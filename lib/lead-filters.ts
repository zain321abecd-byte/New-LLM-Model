import { LEAD_STATUSES, PRIORITIES, type LeadStatus, type Priority } from "@/lib/types";

/** Dashboard lead filters, parsed from the URL. Shared by the Leads page and CSV export. */
export interface LeadQuery {
  q?: string;
  status?: LeadStatus;
  priority?: Priority;
  campaign?: string;
  country?: string;
  sort: "score" | "newest";
  page: number;
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(p: Params, k: string): string | undefined {
  const v = p instanceof URLSearchParams ? p.get(k) : p[k];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

export function parseLeadQuery(p: Params): LeadQuery {
  const status = get(p, "status");
  const priority = get(p, "priority");
  return {
    q: get(p, "q")?.slice(0, 100),
    status: LEAD_STATUSES.includes(status as LeadStatus) ? (status as LeadStatus) : undefined,
    priority: PRIORITIES.includes(priority as Priority) ? (priority as Priority) : undefined,
    campaign: get(p, "campaign")?.match(/^[0-9a-f-]{36}$/i)?.[0],
    country: get(p, "country")?.slice(0, 60),
    sort: get(p, "sort") === "newest" ? "newest" : "score",
    page: Math.max(1, Math.min(1000, Number(get(p, "page")) || 1)),
  };
}

export function leadQueryString(q: Partial<LeadQuery>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "" && !(k === "page" && v === 1) && !(k === "sort" && v === "score")) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
}

/** Escape user input for a PostgREST ilike/or() filter. */
export function likeTerm(s: string) {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()]/g, " ");
}
