import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { EMPTY_STATS, type LeadStats } from "@/lib/db";
import { PageHeader, PriorityBadge, EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { Campaign, Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card flex min-h-[124px] flex-col justify-between p-4 md:min-h-[150px]">
      <p className="font-mono text-[11px] uppercase tracking-[0.04em] text-ink-2">{label}</p>
      <div>
        <p className="text-[40px] font-medium leading-none tracking-[-0.05em] tabular-nums md:text-[48px]">{value.toLocaleString()}</p>
        <p className="mt-2 h-4 font-mono text-[11px] uppercase tracking-[0.04em] text-accent">{hint}</p>
      </div>
    </div>
  );
}

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "—";
}

export default async function DashboardPage() {
  const auth = await requireAuth();
  const supabase = await supabaseServer();
  const ws = auth.workspace.id;

  const [{ data: statsRow }, { data: campaigns }, { data: hot }, { data: link }] = await Promise.all([
    supabase.from("lead_stats").select("*").eq("workspace_id", ws).maybeSingle(),
    supabase.from("campaigns").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(10),
    supabase.from("leads").select("*").eq("workspace_id", ws).eq("priority", "high").eq("status", "new").order("lead_score", { ascending: false }).limit(5),
    supabase.from("whatsapp_links").select("verified_at").eq("user_id", auth.userId).maybeSingle(),
  ]);
  const s: LeadStats = (statsRow as LeadStats | null) ?? EMPTY_STATS;
  const profileDone = !!(auth.workspace.offering && auth.workspace.company_name);
  const linked = !!link?.verified_at;

  const mix = [
    { key: "high", label: "High", value: s.high_priority, cls: "bg-high" },
    { key: "medium", label: "Medium", value: s.medium_priority, cls: "bg-medium" },
    { key: "low", label: "Low", value: s.low_priority, cls: "bg-low" },
  ];

  return (
    <>
      <PageHeader title="Overview" subtitle="Theron's pipeline at a glance." />

      {(!profileDone || !linked) && (
        <section className="mb-8">
          <h2 className="section-title">Finish setting up</h2>
          <div className="card divide-y divide-line overflow-hidden">
            {[
              { done: profileDone, title: "Tell the agent what you sell", detail: "Outreach is written from your business profile.", href: "/settings" },
              { done: linked, title: "Link your WhatsApp", detail: "Command the agent from your phone.", href: "/settings#whatsapp" },
            ].map((t) => (
              <Link key={t.title} href={t.href} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <span className={`grid h-6 w-6 shrink-0 place-items-center text-[13px] ${t.done ? "bg-green text-white" : "border-2 border-ink-3"}`} aria-hidden>
                  {t.done ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[15px] ${t.done ? "text-ink-2 line-through" : ""}`}>{t.title}</span>
                  <span className="block text-[13px] text-ink-2">{t.detail}</span>
                </span>
                <Icon name="chevron" className="h-4 w-4 text-ink-3" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-5 [&>.card]:border-0 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
        <Stat label="Total leads" value={s.total_leads} />
        <Stat label="New this week" value={s.new_leads} />
        <Stat label="Contacted" value={s.contacted} hint={s.total_leads ? `${pct(s.contacted, s.total_leads)} of leads` : undefined} />
        <Stat label="Replies" value={s.replied} hint={s.contacted ? `${pct(s.replied, s.contacted)} reply rate` : undefined} />
        <Stat label="Converted" value={s.converted} hint={s.contacted ? `${pct(s.converted, s.contacted)} of contacted` : undefined} />
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-3">
        <div>
          <h2 className="section-title">Lead quality</h2>
          <div className="card p-4">
            {s.total_leads ? (
              <>
                <div className="flex h-2.5 gap-[2px] overflow-hidden" role="img" aria-label={mix.map((m) => `${m.label} ${m.value}`).join(", ")}>
                  {mix.filter((m) => m.value).map((m) => (
                    <div key={m.key} className={m.cls} style={{ width: `${(m.value / s.total_leads) * 100}%` }} title={`${m.label} priority: ${m.value}`} />
                  ))}
                </div>
                <ul className="mt-3 divide-y divide-line">
                  {mix.map((m) => (
                    <li key={m.key}>
                      <Link href={`/leads?priority=${m.key}`} className="flex items-center justify-between py-2.5 text-[15px]">
                        <span className="flex items-center gap-2.5">
                          <span className={`h-2.5 w-2.5 ${m.cls}`} aria-hidden /> {m.label} priority
                        </span>
                        <span className="flex items-center gap-1 tabular-nums text-ink-2">
                          {m.value} <span className="text-ink-3">· {pct(m.value, s.total_leads)}</span>
                          <Icon name="chevron" className="h-4 w-4 text-ink-3" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="py-6 text-center text-[15px] text-ink-2">No leads yet.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="flex items-baseline justify-between pr-1">
            <h2 className="section-title">Hot leads, not yet contacted</h2>
            <Link href="/leads?priority=high&status=new" className="mb-3 font-mono text-[12px] uppercase tracking-[0.04em] text-accent hover:underline">See all →</Link>
          </div>
          <div className="card overflow-hidden">
            {(hot as Lead[] | null)?.length ? (
              <ul className="divide-y divide-line">
                {(hot as Lead[]).map((l) => (
                  <li key={l.id}>
                    <Link href={`/leads/${l.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{l.company_name}</span>
                        <span className="block truncate text-[13px] text-ink-2">{[l.contact_name, l.job_title].filter(Boolean).join(", ") || "No contact yet"}</span>
                      </span>
                      <PriorityBadge priority={l.priority} score={l.lead_score} />
                      <Icon name="chevron" className="h-4 w-4 shrink-0 text-ink-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-10 text-center text-[15px] text-ink-2">Ask the agent to find leads. High-priority ones show up here.</p>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="section-title">Campaign performance</h2>
        {(campaigns as Campaign[] | null)?.length ? (
          <div className="card overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead className="text-left font-mono text-[11px] uppercase tracking-[0.04em] text-ink-2">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 font-medium">Campaign</th>
                  <th className="px-4 py-2.5 font-medium">Channel</th>
                  <th className="px-4 py-2.5 text-right font-medium">Leads</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sent</th>
                  <th className="px-4 py-2.5 text-right font-medium">Replies</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reply rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(campaigns as Campaign[]).map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2">
                    <td className="px-4 py-3"><Link href={`/leads?campaign=${c.id}`} className="font-medium hover:text-accent">{c.campaign_name}</Link></td>
                    <td className="px-4 py-3 capitalize text-ink-2">{c.channel}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.total_leads}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.sent_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.reply_count}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{pct(c.reply_count, c.sent_count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No campaigns yet">Campaigns are created when the agent saves leads or drafts outreach under a campaign name.</EmptyState>
        )}
      </section>
    </>
  );
}
