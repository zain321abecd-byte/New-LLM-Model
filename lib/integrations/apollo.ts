import "server-only";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";

const BASE = "https://api.apollo.io/api/v1";

function headers() {
  const key = env().APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY is not set.");
  return { "x-api-key": key, "content-type": "application/json", accept: "application/json", "cache-control": "no-cache" };
}

export interface ApolloPerson {
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  linkedin_url: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
  company_name: string | null;
  company_domain: string | null;
  company_website: string | null;
  company_industry: string | null;
  company_size: string | null;
}

export interface CompanyProfile {
  name: string | null;
  domain: string;
  industry: string | null;
  employees: string | null;
  city: string | null;
  country: string | null;
  linkedin_url: string | null;
  description: string | null;
  founded_year: number | null;
  keywords: string[];
  source: string;
}

// Apollo's payloads are large and loosely typed; we map only what we use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

function mapPerson(p: Loose): ApolloPerson {
  const org = p.organization ?? {};
  const email = typeof p.email === "string" && !p.email.includes("not_unlocked") ? p.email : null;
  return {
    name: p.name ?? null,
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? null,
    title: p.title ?? null,
    linkedin_url: p.linkedin_url ?? null,
    // Search results carry an email only when the account has already
    // revealed it; the agent falls back to Hunter otherwise.
    email,
    city: p.city ?? null,
    country: p.country ?? null,
    company_name: org.name ?? null,
    company_domain: org.primary_domain ?? null,
    company_website: org.website_url ?? null,
    company_industry: org.industry ?? null,
    company_size: org.estimated_num_employees ? String(org.estimated_num_employees) : null,
  };
}

/** People search: decision makers by title, location, industry keywords and headcount. */
export async function searchPeople(q: {
  job_titles?: string[];
  locations?: string[];
  industry_keywords?: string[];
  employee_ranges?: string[]; // e.g. ["1,10", "11,50"]
  limit?: number;
}): Promise<ApolloPerson[]> {
  const body = {
    person_titles: q.job_titles,
    person_locations: q.locations,
    q_organization_keyword_tags: q.industry_keywords,
    organization_num_employees_ranges: q.employee_ranges,
    per_page: Math.min(Math.max(q.limit ?? 25, 1), 100),
    page: 1,
  };
  const data = await fetchJson<{ people?: Loose[] }>(`${BASE}/mixed_people/api_search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return (data.people ?? []).map(mapPerson);
}

export async function enrichOrganization(domain: string): Promise<CompanyProfile | null> {
  const data = await fetchJson<{ organization?: Loose }>(`${BASE}/organizations/enrich?domain=${encodeURIComponent(domain)}`, {
    headers: headers(),
  });
  const o = data.organization;
  if (!o) return null;
  return {
    name: o.name ?? null,
    domain,
    industry: o.industry ?? null,
    employees: o.estimated_num_employees ? String(o.estimated_num_employees) : null,
    city: o.city ?? null,
    country: o.country ?? null,
    linkedin_url: o.linkedin_url ?? null,
    description: o.short_description ?? null,
    founded_year: o.founded_year ?? null,
    keywords: (o.keywords ?? []).slice(0, 15),
    source: "apollo",
  };
}
