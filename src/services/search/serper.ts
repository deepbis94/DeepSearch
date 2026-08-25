import { getConfig } from "../../config";
import type { WebSearchResult } from "../../types";

interface SerperResponse {
  organic?: Array<{
    link?: string;
    title?: string;
    snippet?: string;
  }>;
}

export async function searchWithSerper(
  query: string,
  maxResults: number
): Promise<WebSearchResult[]> {
  const { search } = getConfig();
  if (!search.serperApiKey) {
    throw new Error("SERPER_API_KEY is not configured");
  }

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": search.serperApiKey,
    },
    body: JSON.stringify({
      q: query,
      num: maxResults,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Serper HTTP ${response.status}: ${body}`);
  }

  const data = (await response.json()) as SerperResponse;
  return (data.organic ?? [])
    .filter((r) => r.link)
    .slice(0, maxResults)
    .map((r) => ({
      url: r.link!,
      title: r.title ?? r.link!,
      snippet: r.snippet ?? "",
    }));
}
