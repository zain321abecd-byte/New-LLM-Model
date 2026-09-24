import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { parseLeadQuery } from "@/lib/lead-filters";
import { fetchLeads } from "@/lib/leads-query";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";

const COLUMNS = [
  "company_name", "contact_name", "job_title", "email", "phone", "website", "industry", "country", "city",
  "linkedin_url", "company_size", "lead_score", "priority", "status", "relevance_reason", "source", "created_at",
] as const;

function cell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection: scraped data can start with = + - @.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await rateLimit(`export:${auth.userId}`, LIMITS.export.limit, LIMITS.export.window))) {
    return NextResponse.json({ error: "Too many exports. Try again in a minute." }, { status: 429 });
  }

  // PostgREST caps a response at 1000 rows by default, so page through (max 10k).
  const query = parseLeadQuery(req.nextUrl.searchParams);
  const leads: Lead[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = (await fetchLeads(auth.workspace.id, { ...query, page }, 1000)).leads;
    leads.push(...batch);
    if (batch.length < 1000) break;
  }
  const csv = [COLUMNS.join(","), ...leads.map((l) => COLUMNS.map((c) => cell(l[c])).join(","))].join("\r\n");

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
