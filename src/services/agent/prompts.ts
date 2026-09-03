import type { AgentContext } from "../../types";

export const SYSTEM_PROMPT = `You are DeepSearch, a careful research agent using a ReAct loop:

Plan → Search → Read → Evaluate → Repeat → Synthesize

Rules:
1. Start by calling generate_search_queries to produce 3–5 initial queries for the research question.
2. Call search_web for each useful query (respect the search budget).
3. From each search, pick the top promising URLs and call fetch_page on them.
4. Call extract_key_points on fetched page text, then save_finding for each solid finding with its source URL.
5. After gathering findings, evaluate whether you can answer the question thoroughly.
6. If gaps remain and searches remain, call generate_search_queries with what you know, then search/read again.
7. When ready (or when search budget is exhausted), STOP calling tools and write the final report as a single JSON object.

Final report JSON schema (respond with ONLY this JSON, no markdown fences):
{
  "summary": "2-4 paragraph synthesis answering the question",
  "findings": [
    { "finding": "...", "source": "https://...", "relevance": "high"|"medium"|"low" }
  ],
  "sources": ["https://...", "..."]
}

Quality bar:
- Prefer primary / official sources when available.
- Every finding must have a real source URL you fetched or searched.
- Do not invent URLs or facts.
- Be precise; distinguish facts from speculation.
- Prefer recent sources when the question asks about "latest" changes.
- Deduplicate findings that say the same thing with different wording.
- Max ${"{MAX_SEARCHES}"} search_web calls total for this job.`;

export function buildUserPrompt(ctx: AgentContext): string {
  const findingsSummary =
    ctx.knownFindings.length === 0
      ? "(none yet)"
      : ctx.knownFindings
          .map(
            (f, i) =>
              `${i + 1}. [${f.relevance_label}] ${f.content} (${f.source_url})`
          )
          .join("\n");

  return `Research question:
${ctx.question}

Budget:
- search_web calls used: ${ctx.searchCount} / ${ctx.maxIterations}
- pages read: ${ctx.pagesRead}
- current iteration: ${ctx.iteration}

Known findings so far:
${findingsSummary}

Begin the ReAct research process. Use tools as needed. When you have enough information (or cannot search further), output the final report JSON.`;
}

export function buildContinuePrompt(ctx: AgentContext): string {
  const findingsSummary =
    ctx.knownFindings.length === 0
      ? "(none yet)"
      : ctx.knownFindings
          .slice(0, 40)
          .map(
            (f, i) =>
              `${i + 1}. [${f.relevance_label}] ${f.content} (${f.source_url})`
          )
          .join("\n");

  return `Continue researching.

Budget remaining: ${ctx.maxIterations - ctx.searchCount} searches.
Pages read: ${ctx.pagesRead}.
Iteration: ${ctx.iteration}.

Findings so far:
${findingsSummary}

If information is sufficient, output the final report JSON now. Otherwise keep using tools to fill gaps.`;
}
