import { getConfig } from "../../config";
import type { WebSearchResult } from "../../types";

interface TavilyResponse {
  results?: Array<{
    url?: string;
    title?: string;
    content?: string;
  }>;
}

export async function searchWithTavily(
  query: string,
  maxResults: number
): Promise<WebSearchResult[]> {
  const { search } = getConfig();
  if (!search.tavilyApiKey) {
    throw new Error("TAVILY_API_KEY is not configured");
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: search.tavilyApiKey,
      query,
      search_depth: "advanced",
      include_answer: false,
      max_results: maxResults,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Tavily HTTP ${response.status}: ${body}`);
  }

  const data = (await response.json()) as TavilyResponse;
  return (data.results ?? [])
    .filter((r) => r.url)
    .slice(0, maxResults)
    .map((r) => ({
      url: r.url!,
      title: r.title ?? r.url!,
      snippet: r.content ?? "",
    }));
}
