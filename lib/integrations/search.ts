import "server-only";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
}

export interface LocalResult {
  name: string;
  website?: string;
  phone?: string;
  address?: string;
  category?: string;
  rating?: number;
  reviews?: number;
}

export function webSearchConfigured(): boolean {
  const e = env();
  return !!(e.SERPAPI_API_KEY || (e.GOOGLE_CSE_API_KEY && e.GOOGLE_CSE_ID));
}

/**
 * Web search. SerpAPI (Google engine) first, Google Programmable Search as a
 * fallback. Bing's Search API was retired by Microsoft in August 2025, so it
 * is intentionally not an option. When neither key is set the agent uses
 * Claude's built-in web search instead (see lib/agent/tools.ts).
 */
export async function webSearch(query: string, opts: { location?: string; num?: number } = {}): Promise<SearchResult[]> {
  const e = env();
  const num = Math.min(Math.max(opts.num ?? 10, 1), 20);

  if (e.SERPAPI_API_KEY) {
    const params = new URLSearchParams({ engine: "google", q: query, num: String(num), api_key: e.SERPAPI_API_KEY });
    if (opts.location) params.set("location", opts.location);
    const data = await fetchJson<{ organic_results?: { title: string; link: string; snippet?: string }[] }>(
      `https://serpapi.com/search.json?${params}`,
    );
    return (data.organic_results ?? []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
  }

  if (e.GOOGLE_CSE_API_KEY && e.GOOGLE_CSE_ID) {
    const q = opts.location ? `${query} ${opts.location}` : query;
    const params = new URLSearchParams({ key: e.GOOGLE_CSE_API_KEY, cx: e.GOOGLE_CSE_ID, q, num: String(Math.min(num, 10)) });
    const data = await fetchJson<{ items?: { title: string; link: string; snippet?: string }[] }>(
      `https://www.googleapis.com/customsearch/v1?${params}`,
    );
    return (data.items ?? []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
  }

  throw new Error("No web search provider configured (set SERPAPI_API_KEY or GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID).");
}

/**
 * Local business search via SerpAPI's Google Maps engine. This is the best
 * source for "dental clinics in Texas"-style requests: it returns the
 * business phone and website directly.
 */
export async function localSearch(query: string, location: string, limit = 20): Promise<LocalResult[]> {
  const key = env().SERPAPI_API_KEY;
  if (!key) throw new Error("Local search needs SERPAPI_API_KEY.");
  const out: LocalResult[] = [];
  // Maps returns 20 results per page; page with `start`.
  for (let start = 0; out.length < limit && start < 120; start += 20) {
    const params = new URLSearchParams({ engine: "google_maps", type: "search", q: `${query} in ${location}`, start: String(start), api_key: key });
    const data = await fetchJson<{
      local_results?: { title: string; website?: string; phone?: string; address?: string; type?: string; rating?: number; reviews?: number }[];
    }>(`https://serpapi.com/search.json?${params}`);
    const page = data.local_results ?? [];
    out.push(
      ...page.map((r) => ({ name: r.title, website: r.website, phone: r.phone, address: r.address, category: r.type, rating: r.rating, reviews: r.reviews })),
    );
    if (page.length < 20) break;
  }
  return out.slice(0, limit);
}
