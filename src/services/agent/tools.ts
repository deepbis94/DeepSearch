import OpenAI from "openai";
import { getConfig } from "../../config";
import type { AgentContext, RelevanceLevel } from "../../types";
import { searchWeb } from "../search";
import { fetchPage } from "../fetchPage";
import * as repo from "../../repositories/research";

export const TOOL_DEFINITIONS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_web",
      description:
        "Execute a web search for the given query. Returns top results with url, title, and snippet. Prefer focused, specific queries.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query string",
          },
          rationale: {
            type: "string",
            description: "Why this query helps answer the research question",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_page",
      description:
        "Fetch and extract the full readable text content of a URL. Use on the most promising search results.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_key_points",
      description:
        "Summarize key findings from page text that are relevant to the research question. Returns a list of concise findings.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Page text to analyze (can be truncated)",
          },
          source_url: {
            type: "string",
            description: "URL the text came from",
          },
        },
        required: ["text", "source_url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_search_queries",
      description:
        "Generate 3-5 new search queries based on the topic and what is already known, targeting information gaps.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "The research topic or question",
          },
          known_info: {
            type: "string",
            description: "Summary of information already gathered",
          },
        },
        required: ["topic", "known_info"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_finding",
      description:
        "Persist a key finding with its source URL and relevance for the final cited report.",
      parameters: {
        type: "object",
        properties: {
          finding: {
            type: "string",
            description: "A clear, specific finding statement",
          },
          source_url: {
            type: "string",
            description: "URL that supports this finding",
          },
          relevance: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "How relevant this finding is to the research question",
          },
        },
        required: ["finding", "source_url", "relevance"],
      },
    },
  },
];

function getOpenAI(): OpenAI {
  const { openai } = getConfig();
  return new OpenAI({ apiKey: openai.apiKey });
}

async function toolSearchWeb(
  ctx: AgentContext,
  args: { query: string; rationale?: string }
): Promise<unknown> {
  if (ctx.searchCount >= ctx.maxIterations) {
    return {
      error: `Search limit reached (${ctx.maxIterations} searches). Synthesize with available findings.`,
    };
  }

  const queryRecord = repo.createSearchQuery(
    ctx.jobId,
    args.query,
    args.rationale
  );
  const results = await searchWeb(args.query);
  const top = results.slice(0, getConfig().search.maxResultsPerSearch);

  const stored = top.map((r) =>
    repo.createSearchResult(queryRecord.id, r)
  );

  ctx.searchCount += 1;
  const event = {
    query: args.query,
    rationale: args.rationale ?? null,
    result_count: stored.length,
    urls: stored.map((s) => s.url),
  };
  repo.addTrailEvent(ctx.jobId, "search", event);
  ctx.trailEvents.push({
    type: "search",
    timestamp: new Date().toISOString(),
    data: event,
  });

  return {
    query_id: queryRecord.id,
    results: stored.map((s) => ({
      id: s.id,
      url: s.url,
      title: s.title,
      snippet: s.snippet,
    })),
    searches_used: ctx.searchCount,
    searches_remaining: ctx.maxIterations - ctx.searchCount,
  };
}

async function toolFetchPage(
  ctx: AgentContext,
  args: { url: string }
): Promise<unknown> {
  const page = await fetchPage(args.url);

  const existing = repo.findSearchResultByUrl(ctx.jobId, args.url);
  if (existing) {
    repo.updateSearchResultContent(existing.id, page.text);
  } else {
    const orphanQuery = repo.createSearchQuery(
      ctx.jobId,
      `direct:${args.url}`,
      "Direct page fetch"
    );
    const result = repo.createSearchResult(orphanQuery.id, {
      url: page.url,
      title: page.title,
      snippet: page.text.slice(0, 280),
    });
    repo.updateSearchResultContent(result.id, page.text);
  }

  ctx.pagesRead += 1;
  const event = {
    url: page.url,
    title: page.title,
    chars: page.text.length,
    truncated: page.truncated,
  };
  repo.addTrailEvent(ctx.jobId, "fetch", event);
  ctx.trailEvents.push({
    type: "fetch",
    timestamp: new Date().toISOString(),
    data: event,
  });

  // Return a preview to the model to keep context size manageable
  const previewLimit = 12_000;
  const preview =
    page.text.length > previewLimit
      ? page.text.slice(0, previewLimit) + "\n\n[Truncated for model context]"
      : page.text;

  return {
    url: page.url,
    title: page.title,
    text: preview,
    full_length: page.text.length,
    truncated: page.truncated || page.text.length > previewLimit,
  };
}

async function toolExtractKeyPoints(
  ctx: AgentContext,
  args: { text: string; source_url: string }
): Promise<unknown> {
  const { openai } = getConfig();
  const client = getOpenAI();

  const completion = await client.chat.completions.create({
    model: openai.model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You extract key research findings from web page text.
Return JSON: { "key_points": [ { "point": string, "relevance": "high"|"medium"|"low" } ] }
Only include points that help answer the research question. Be specific and factual.`,
      },
      {
        role: "user",
        content: `Research question: ${ctx.question}\n\nSource URL: ${args.source_url}\n\nPage text:\n${args.text.slice(0, 20_000)}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: {
    key_points?: Array<{ point: string; relevance?: RelevanceLevel }>;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return { error: "Failed to parse key points", raw };
  }

  return {
    source_url: args.source_url,
    key_points: parsed.key_points ?? [],
  };
}

async function toolGenerateSearchQueries(
  ctx: AgentContext,
  args: { topic: string; known_info: string }
): Promise<unknown> {
  const { openai } = getConfig();
  const client = getOpenAI();

  const completion = await client.chat.completions.create({
    model: openai.model,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You generate focused web search queries to fill research gaps.
Return JSON: { "queries": [ { "query": string, "rationale": string } ] }
Produce 3 to 5 queries. Avoid duplicates of likely prior searches. Prefer authoritative sources.`,
      },
      {
        role: "user",
        content: `Topic: ${args.topic}\n\nAlready known:\n${args.known_info}\n\nOriginal question: ${ctx.question}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw);
  } catch {
    return { error: "Failed to parse generated queries", raw };
  }
}

async function toolSaveFinding(
  ctx: AgentContext,
  args: {
    finding: string;
    source_url: string;
    relevance: RelevanceLevel;
  }
): Promise<unknown> {
  const record = repo.createFinding(
    ctx.jobId,
    args.finding,
    args.source_url,
    args.relevance
  );
  ctx.knownFindings = repo.listFindings(ctx.jobId);

  const event = {
    finding_id: record.id,
    finding: record.content,
    source_url: record.source_url,
    relevance: record.relevance_label,
  };
  repo.addTrailEvent(ctx.jobId, "finding", event);
  ctx.trailEvents.push({
    type: "finding",
    timestamp: new Date().toISOString(),
    data: event,
  });

  return {
    saved: true,
    id: record.id,
    total_findings: ctx.knownFindings.length,
  };
}

export async function executeTool(
  name: string,
  rawArgs: string,
  ctx: AgentContext
): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs) as Record<string, unknown>;
  } catch {
    return JSON.stringify({ error: `Invalid JSON arguments for ${name}` });
  }

  try {
    let result: unknown;
    switch (name) {
      case "search_web":
        result = await toolSearchWeb(ctx, args as { query: string; rationale?: string });
        break;
      case "fetch_page":
        result = await toolFetchPage(ctx, args as { url: string });
        break;
      case "extract_key_points":
        result = await toolExtractKeyPoints(
          ctx,
          args as { text: string; source_url: string }
        );
        break;
      case "generate_search_queries":
        result = await toolGenerateSearchQueries(
          ctx,
          args as { topic: string; known_info: string }
        );
        break;
      case "save_finding":
        result = await toolSaveFinding(
          ctx,
          args as {
            finding: string;
            source_url: string;
            relevance: RelevanceLevel;
          }
        );
        break;
      default:
        result = { error: `Unknown tool: ${name}` };
    }
    return JSON.stringify(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tool:${name}]`, message);
    return JSON.stringify({ error: message });
  }
}
