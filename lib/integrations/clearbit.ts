import "server-only";
import { env } from "@/lib/env";
import { fetchJson, HttpError } from "@/lib/http";
import type { CompanyProfile } from "@/lib/integrations/apollo";

/**
 * Clearbit Company API. Clearbit is now part of HubSpot and no longer issues
 * standalone keys to new customers; this adapter exists for accounts that
 * still have one. Everything works without it.
 */
export async function clearbitCompany(domain: string): Promise<CompanyProfile | null> {
  const key = env().CLEARBIT_API_KEY;
  if (!key) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = await fetchJson<any>(`https://company.clearbit.com/v2/companies/find?domain=${encodeURIComponent(domain)}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    return {
      name: c.name ?? null,
      domain,
      industry: c.category?.industry ?? null,
      employees: c.metrics?.employeesRange ?? (c.metrics?.employees ? String(c.metrics.employees) : null),
      city: c.geo?.city ?? null,
      country: c.geo?.country ?? null,
      linkedin_url: c.linkedin?.handle ? `https://www.linkedin.com/${c.linkedin.handle}` : null,
      description: c.description ?? null,
      founded_year: c.foundedYear ?? null,
      keywords: c.tags ?? [],
      source: "clearbit",
    };
  } catch (err) {
    if (err instanceof HttpError && (err.status === 404 || err.status === 422)) return null;
    throw err;
  }
}
