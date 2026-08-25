import { getConfig } from "../../config";
import type { WebSearchResult } from "../../types";
import { searchWithTavily } from "./tavily";
import { searchWithSerper } from "./serper";

export async function searchWeb(
  query: string,
  maxResults?: number
): Promise<WebSearchResult[]> {
  const config = getConfig();
  const limit = maxResults ?? config.search.maxResultsPerSearch;

  if (!query.trim()) {
    throw new Error("Search query must not be empty");
  }

  try {
    if (config.search.provider === "tavily") {
      return await searchWithTavily(query, limit);
    }
    return await searchWithSerper(query, limit);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Web search failed (${config.search.provider}): ${message}`);
  }
}
