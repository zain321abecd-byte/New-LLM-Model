import "server-only";
import { env } from "@/lib/env";
import { fetchJson, HttpError } from "@/lib/http";

const BASE = "https://api.hunter.io/v2";

export interface FoundEmail {
  email: string;
  confidence: number | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  linkedin_url: string | null;
  phone: string | null;
}

function key() {
  const k = env().HUNTER_API_KEY;
  if (!k) throw new Error("HUNTER_API_KEY is not set.");
  return k;
}

/** Most likely address for a named person at a domain. */
export async function findEmail(domain: string, firstName: string, lastName: string): Promise<FoundEmail | null> {
  const params = new URLSearchParams({ domain, first_name: firstName, last_name: lastName, api_key: key() });
  try {
    const { data } = await fetchJson<{
      data: { email: string | null; score: number | null; position: string | null; linkedin_url: string | null; phone_number: string | null };
    }>(`${BASE}/email-finder?${params}`);
    if (!data?.email) return null;
    return { email: data.email, confidence: data.score, first_name: firstName, last_name: lastName, position: data.position, linkedin_url: data.linkedin_url, phone: data.phone_number };
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

/** Known addresses at a domain, most senior first. */
export async function domainSearch(domain: string, limit = 5): Promise<FoundEmail[]> {
  const params = new URLSearchParams({ domain, limit: String(Math.min(limit, 10)), type: "personal", seniority: "executive,senior", api_key: key() });
  const { data } = await fetchJson<{
    data: {
      emails?: { value: string; confidence: number; first_name: string | null; last_name: string | null; position: string | null; linkedin: string | null; phone_number: string | null }[];
    };
  }>(`${BASE}/domain-search?${params}`);
  return (data?.emails ?? []).map((e) => ({
    email: e.value,
    confidence: e.confidence,
    first_name: e.first_name,
    last_name: e.last_name,
    position: e.position,
    linkedin_url: e.linkedin,
    phone: e.phone_number,
  }));
}
