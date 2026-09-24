import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { leadQueryString, parseLeadQuery } from "@/lib/lead-filters";
import { fetchLeads, PAGE_SIZE } from "@/lib/leads-query";
import { EmptyState, PageHeader, PriorityBadge, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { LEAD_STATUSES, PRIORITIES } from "@/lib/types";

export const dynamic = "force-dynamic";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireAuth();
  const q = parseLeadQuery(await searchParams);
  const supabase = await supabaseServer();

  const [{ leads, total }, { data: campaigns }] = await Promise.all([
    fetchLeads(auth.workspace.id, q),
    supabase.from("campaigns").select("id, campaign_name").eq("workspace_id", auth.workspace.id).order("campaign_name"),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!(q.q || q.status || q.priority || q.campaign || q.country);

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${total.toLocaleString()} ${filtered ? "matching" : "total"}`}
        actions={
          <a href={`/api/leads/export${leadQueryString({ ...q, page: 1 })}`} className="btn-ghost">
            <Icon name="download" className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <form className="mb-5 space-y-3" method="get">
        <label className="relative block">
          <span className="sr-only">Search</span>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-2" />
          <input name="q" defaultValue={q.q} placeholder="Search companies, contacts, emails, cities" className="input pl-9" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select name="status" defaultValue={q.status ?? ""} className="input h-8 w-auto text-[13px]" aria-label="Status">
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
          </select>
          <select name="priority" defaultValue={q.priority ?? ""} className="input h-8 w-auto text-[13px]" aria-label="Priority">
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{cap(p)}</option>)}
          </select>
          <select name="campaign" defaultValue={q.campaign ?? ""} className="input h-8 w-auto max-w-[14rem] text-[13px]" aria-label="Campaign">
            <option value="">All campaigns</option>
            {(campaigns ?? []).map((c) => <option key={c.id} value={c.id}>{c.campaign_name}</option>)}
          </select>
          <select name="sort" defaultValue={q.sort} className="input h-8 w-auto text-[13px]" aria-label="Sort">
            <option value="score">Best first</option>
            <option value="newest">Newest</option>
          </select>
          <button className="btn-primary h-8 px-4 text-[13px]">Apply</button>
          {filtered && <Link href="/leads" className="px-2 text-[13px] text-accent hover:underline">Clear</Link>}
        </div>
      </form>

      {leads.length === 0 ? (
        <EmptyState title={filtered ? "No results" : "No leads yet"}>
          {filtered ? (
            <>Try a different search or <Link href="/leads" className="text-accent hover:underline">clear the filters</Link>.</>
          ) : (
            <>Message the agent on WhatsApp or open the <Link href="/agent" className="text-accent hover:underline">Agent</Link>: “Find 30 marketing agencies in Chicago”.</>
          )}
        </EmptyState>
      ) : (
        <div className="card overflow-hidden">
          {/* Desktop: table */}
          <table className="hidden w-full text-[15px] lg:table">
            <thead className="text-left font-mono text-[11px] uppercase tracking-[0.04em] text-ink-2">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Contact</th>
                <th className="px-4 py-2.5 font-medium">Email / phone</th>
                <th className="px-4 py-2.5 font-medium">Location</th>
                <th className="px-4 py-2.5 font-medium">Priority</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {leads.map((l) => (
                <tr key={l.id} className="align-top hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${l.id}`} className="font-medium hover:text-accent">{l.company_name}</Link>
                    <div className="text-[13px] text-ink-2">{[l.industry, l.domain].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="px-4 py-3">
                    {l.contact_name ?? <span className="text-ink-3">—</span>}
                    {l.job_title && <div className="text-[13px] text-ink-2">{l.job_title}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {l.email ?? <span className="text-ink-3">—</span>}
                    {l.phone && <div className="text-[13px] text-ink-2">{l.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{[l.city, l.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-4 py-3"><PriorityBadge priority={l.priority} score={l.lead_score} /></td>
                  <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile / tablet: iOS-style list */}
          <ul className="divide-y divide-line lg:hidden">
            {leads.map((l) => (
              <li key={l.id}>
                <Link href={`/leads/${l.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-medium">{l.company_name}</span>
                    </span>
                    <span className="block truncate text-[13px] text-ink-2">
                      {[l.contact_name, l.email ?? l.phone, [l.city, l.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "No contact details yet"}
                    </span>
                    <span className="mt-1 block"><StatusBadge status={l.status} /></span>
                  </span>
                  <PriorityBadge priority={l.priority} score={l.lead_score} />
                  <Icon name="chevron" className="h-4 w-4 shrink-0 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-5 flex items-center justify-between text-[15px]" aria-label="Pagination">
          {q.page > 1 ? <Link className="btn-ghost" href={`/leads${leadQueryString({ ...q, page: q.page - 1 })}`}>‹ Previous</Link> : <span />}
          <span className="text-[13px] text-ink-2">Page {q.page} of {pages}</span>
          {q.page < pages ? <Link className="btn-ghost" href={`/leads${leadQueryString({ ...q, page: q.page + 1 })}`}>Next ›</Link> : <span />}
        </nav>
      )}
    </>
  );
}
