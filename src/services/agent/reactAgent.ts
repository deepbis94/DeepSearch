import OpenAI from "openai";
import { getConfig } from "../../config";
import type {
  AgentContext,
  ReportFinding,
  RelevanceLevel,
  StructuredReport,
} from "../../types";
import * as repo from "../../repositories/research";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  buildContinuePrompt,
} from "./prompts";
import { TOOL_DEFINITIONS, executeTool } from "./tools";

const MAX_TOOL_ROUNDS = 40;

function getClient(): OpenAI {
  const { openai } = getConfig();
  return new OpenAI({ apiKey: openai.apiKey });
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // try fenced block
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) {
      try {
        return JSON.parse(fence[1].trim());
      } catch {
        /* fall through */
      }
    }
    // try first {...} span
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeRelevance(value: unknown): RelevanceLevel {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function buildStructuredReport(
  question: string,
  draft: {
    summary?: string;
    findings?: Array<{ finding?: string; source?: string; relevance?: string }>;
    sources?: string[];
  },
  ctx: AgentContext
): StructuredReport {
  const dbFindings = repo.listFindings(ctx.jobId);

  let findings: ReportFinding[] =
    draft.findings
      ?.filter((f) => f.finding && f.source)
      .map((f) => ({
        finding: f.finding!,
        source: f.source!,
        relevance: normalizeRelevance(f.relevance),
      })) ?? [];

  if (findings.length === 0) {
    findings = dbFindings.map((f) => ({
      finding: f.content,
      source: f.source_url,
      relevance: f.relevance_label,
    }));
  }

  const sources =
    draft.sources && draft.sources.length > 0
      ? draft.sources
      : [...new Set(findings.map((f) => f.source))];

  const summary =
    draft.summary?.trim() ||
    (findings.length > 0
      ? findings.map((f) => f.finding).join(" ")
      : "Insufficient information was gathered to answer the question.");

  return {
    question,
    summary,
    findings,
    sources,
    research_trail: {
      queries_executed: repo.countQueries(ctx.jobId),
      pages_read: repo.countFetchedPages(ctx.jobId),
      iterations: ctx.iteration,
    },
  };
}

async function synthesizeFallback(
  question: string,
  ctx: AgentContext
): Promise<StructuredReport> {
  const { openai } = getConfig();
  const client = getClient();
  const findings = repo.listFindings(ctx.jobId);

  const completion = await client.chat.completions.create({
    model: openai.model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Synthesize a research report as JSON with keys: summary, findings (array of {finding, source, relevance}), sources (url array).",
      },
      {
        role: "user",
        content: `Question: ${question}\n\nFindings:\n${JSON.stringify(
          findings.map((f) => ({
            finding: f.content,
            source: f.source_url,
            relevance: f.relevance_label,
          })),
          null,
          2
        )}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = extractJsonObject(raw) as {
    summary?: string;
    findings?: Array<{ finding?: string; source?: string; relevance?: string }>;
    sources?: string[];
  } | null;

  return buildStructuredReport(question, parsed ?? {}, ctx);
}

/**
 * ReAct research agent: Plan → Search → Read → Evaluate → Repeat → Synthesize
 */
export async function runResearchAgent(
  jobId: string,
  question: string
): Promise<StructuredReport> {
  const config = getConfig();
  const client = getClient();

  const ctx: AgentContext = {
    jobId,
    question,
    knownFindings: [],
    searchCount: 0,
    pagesRead: 0,
    iteration: 1,
    maxIterations: config.agent.maxSearchIterations,
    trailEvents: [],
  };

  const systemContent = SYSTEM_PROMPT.replace(
    "{MAX_SEARCHES}",
    String(ctx.maxIterations)
  );

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    { role: "user", content: buildUserPrompt(ctx) },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await client.chat.completions.create({
      model: config.openai.model,
      temperature: 0.2,
      tools: TOOL_DEFINITIONS,
      tool_choice: "auto",
      messages,
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error("Empty completion from OpenAI");
    }

    const message = choice.message;
    messages.push(message);

    const toolCalls = message.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      for (const call of toolCalls) {
        if (call.type !== "function") continue;
        console.log(
          `[job ${jobId}] tool ${call.function.name} (${call.function.arguments.slice(0, 120)}...)`
        );
        const result = await executeTool(
          call.function.name,
          call.function.arguments,
          ctx
        );
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
      }

      // Mark evaluation checkpoint when agent has used search + findings
      if (ctx.searchCount > 0 && round % 3 === 2) {
        ctx.iteration += 1;
        repo.addTrailEvent(ctx.jobId, "evaluate", {
          iteration: ctx.iteration,
          searches_used: ctx.searchCount,
          findings: ctx.knownFindings.length,
          pages_read: ctx.pagesRead,
        });
        messages.push({
          role: "user",
          content: buildContinuePrompt(ctx),
        });
      }
      continue;
    }

    // No tool calls — expect final report
    const content = message.content ?? "";
    const parsed = extractJsonObject(content) as {
      summary?: string;
      findings?: Array<{ finding?: string; source?: string; relevance?: string }>;
      sources?: string[];
    } | null;

    if (parsed && (parsed.summary || parsed.findings)) {
      repo.addTrailEvent(ctx.jobId, "synthesize", {
        method: "model_json",
        findings_count: (parsed.findings ?? []).length,
      });
      return buildStructuredReport(question, parsed, ctx);
    }

    // Model replied without JSON — nudge once, then fallback synthesize
    if (round < MAX_TOOL_ROUNDS - 1) {
      messages.push({
        role: "user",
        content:
          "Please output ONLY the final report JSON object now (summary, findings, sources).",
      });
      continue;
    }
  }

  console.warn(`[job ${jobId}] Falling back to synthesizeFallback`);
  repo.addTrailEvent(ctx.jobId, "synthesize", { method: "fallback" });
  return synthesizeFallback(question, ctx);
}
