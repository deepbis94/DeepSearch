import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_CONTENT_CHARS = 50_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; DeepSearchBot/1.0; +https://localhost/research)";

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

function stripNoise(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_CONTENT_CHARS) {
    return { text, truncated: false };
  }
  return {
    text: text.slice(0, MAX_CONTENT_CHARS) + "\n\n[Content truncated]",
    truncated: true,
  };
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  // IPv4 private / loopback / link-local
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  // IPv6 loopback / unique local / link-local
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return true;
  }

  return false;
}

/**
 * Fetch a URL and extract main readable text via Mozilla Readability.
 */
export async function fetchPage(url: string): Promise<FetchedPage> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }

  if (isPrivateHostname(parsed.hostname)) {
    throw new Error(`Refusing to fetch private/internal host: ${parsed.hostname}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const html = await response.text();

    if (
      contentType.includes("application/json") ||
      contentType.includes("text/plain")
    ) {
      const cleaned = stripNoise(html);
      const { text, truncated } = truncate(cleaned);
      return { url, title: parsed.hostname, text, truncated };
    }

    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    let title = article?.title?.trim() || dom.window.document.title || parsed.hostname;
    let body =
      article?.textContent?.trim() ||
      dom.window.document.body?.textContent?.trim() ||
      "";

    body = stripNoise(body);
    if (!body) {
      throw new Error(`No readable content extracted from ${url}`);
    }

    const { text, truncated } = truncate(body);
    return { url, title, text, truncated };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Timed out fetching ${url} after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
