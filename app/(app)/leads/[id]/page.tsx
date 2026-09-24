import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader, PriorityBadge, StatusBadge } from "@/components/ui";
import { LEAD_STATUSES, type Lead, type Message } from "@/lib/types";
import { deleteLeadAction, updateLeadAction } from "../actions";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const BREAKDOWN_LABELS: Record<string, string> = {
  active_business: "Active business",
  relevant_industry: "Relevant industry",
  growth_signals: "Growth signals",
  named_contact: "Named contact",
  decision_maker: "Decision maker",
  email: "Email found",
  email_verified: "Email verified",
  phone: "Phone",
  linkedin: "LinkedIn",
};

function safeHref(url: string | null) {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const auth = await requireAuth();
  const supabase = await supabaseServer();

  const [{ data: lead }, { data: messages }] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).eq("workspace_id", auth.workspace.id).maybeSingle(),
    supabase.from("messages").select("*").eq("lead_id", id).eq("workspace_id", auth.workspace.id).order("timestamp", { ascending: false }),
  ]);
  if (!lead) notFound();
  const l = lead as Lead;
  const website = safeHref(l.website);
  const linkedin = safeHref(l.linkedin_url);

  const facts: [string, React.ReactNode][] = [
    ["Website", website ? <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">{l.domain ?? website}</a> : "—"],
    ["Industry", l.industry ?? "—"],
    ["Location", [l.city, l.country].filter(Boolean).join(", ") || "—"],
    ["Company size", l.company_size ?? "—"],
    ["LinkedIn", linkedin ? <a href={linkedin} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">Profile</a> : "—"],
    ["Source", l.source ?? "—"],
    ["Added", new Date(l.created_at).toLocaleDateString()],
    ["Last contacted", l.last_contacted_at ? new Date(l.last_contacted_at).toLocaleString() : "Never"],
  ];

  const field = "flex items-center gap-3 px-4";
  const fieldInput = "h-11 w-full bg-transparent text-right text-[15px] outline-none placeholder:text-ink-3";

  return (
    <>
      <Link href="/leads" className="inline-flex items-center gap-0.5 text-[15px] text-accent hover:underline">
        <Icon name="back" className="h-4 w-4" /> Leads
      </Link>
      <div className="mt-3">
        <PageHeader
          title={l.company_name}
          subtitle={[l.contact_name, l.job_title].filter(Boolean).join(", ") || undefined}
          actions={<><PriorityBadge priority={l.priority} score={l.lead_score} /><StatusBadge status={l.status} /></>}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {l.relevance_reason && (
            <section>
              <h2 className="section-title">Why this lead</h2>
              <p className="card p-4 text-[15px] leading-relaxed">{l.relevance_reason}</p>
            </section>
          )}

          <section>
            <h2 className="section-title">Company</h2>
            <dl className="card divide-y divide-line overflow-hidden">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-4 py-3 text-[15px]">
                  <dt>{k}</dt>
                  <dd className="text-right text-ink-2">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h2 className="section-title">Messages</h2>
            <div className="card p-4">
              {(messages as Message[] | null)?.length ? (
                <ul className="space-y-4">
                  {(messages as Message[]).map((m) => {
                    const inbound = m.direction === "inbound";
                    return (
                      <li key={m.id} className={`flex flex-col ${inbound ? "items-start" : "items-end"}`}>
                        <p className="mb-1 px-1 text-[11px] text-ink-2">
                          {inbound ? "Reply" : m.sequence_step ? `Follow-up ${m.sequence_step}` : "First touch"} · {m.message_type} · {m.sent_status} ·{" "}
                          {new Date(m.sent_at ?? m.timestamp).toLocaleString()}
                        </p>
                        <div
                          className={`max-w-[85%] px-3.5 py-2.5 text-[15px] leading-snug ${
                            inbound ? " bg-fill text-ink" : m.sent_status === "sent" ? " bg-accent text-white" : " border border-dashed border-accent/50 bg-accent-soft text-ink"
                          }`}
                        >
                          {m.subject && <p className="mb-1 font-semibold">{m.subject}</p>}
                          <p className="whitespace-pre-wrap">{m.message_content}</p>
                        </div>
                        {m.error && <p className="mt-1 px-1 text-[12px] text-danger">{m.error}</p>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="py-6 text-center text-[15px] text-ink-2">No messages yet. Ask the agent: “Write outreach for {l.company_name}”.</p>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-8">
          <form action={updateLeadAction}>
            <input type="hidden" name="id" value={l.id} />
            <h2 className="section-title">Details</h2>
            <div className="card divide-y divide-line overflow-hidden">
              <label className={field}>
                <span className="shrink-0 text-[15px]">Status</span>
                <select name="status" defaultValue={l.status} className={`${fieldInput} cursor-pointer appearance-none text-accent`}>
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                </select>
              </label>
              <label className={field}><span className="shrink-0 text-[15px]">Contact</span><input name="contact_name" defaultValue={l.contact_name ?? ""} placeholder="Name" className={fieldInput} /></label>
              <label className={field}><span className="shrink-0 text-[15px]">Title</span><input name="job_title" defaultValue={l.job_title ?? ""} placeholder="Job title" className={fieldInput} /></label>
              <label className={field}><span className="shrink-0 text-[15px]">Email</span><input name="email" type="email" defaultValue={l.email ?? ""} placeholder="name@company.com" className={fieldInput} /></label>
              <label className={field}><span className="shrink-0 text-[15px]">Phone</span><input name="phone" defaultValue={l.phone ?? ""} placeholder="+1 …" className={fieldInput} /></label>
              <label className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[15px]">WhatsApp opt-in</span>
                <input type="checkbox" name="whatsapp_opt_in" defaultChecked={l.whatsapp_opt_in} className="toggle" />
              </label>
            </div>
            <p className="mt-2 px-4 text-[13px] text-ink-2">Meta requires the lead's consent before the agent can WhatsApp them.</p>

            <h2 className="section-title mt-6">Notes</h2>
            <textarea name="notes" rows={4} defaultValue={l.notes ?? ""} className="card w-full resize-y p-4 text-[15px] outline-none focus:ring-4 focus:ring-accent/25" placeholder="Add a note" />
            <button className="btn-primary mt-4 h-11 w-full">Save</button>
          </form>

          <section>
            <h2 className="section-title">Score · {l.lead_score} of 100</h2>
            <ul className="card divide-y divide-line overflow-hidden">
              {Object.entries(l.score_breakdown ?? {}).map(([k, v]) => (
                <li key={k} className="flex justify-between px-4 py-2.5 text-[15px]"><span>{BREAKDOWN_LABELS[k] ?? k}</span><span className="tabular-nums text-ink-2">+{v}</span></li>
              ))}
              {!Object.keys(l.score_breakdown ?? {}).length && <li className="px-4 py-3 text-[15px] text-ink-2">No signals recorded.</li>}
            </ul>
          </section>

          <form action={deleteLeadAction} className="card overflow-hidden">
            <input type="hidden" name="id" value={l.id} />
            <button className="w-full px-4 py-3 text-center text-[15px] text-danger hover:bg-surface-2">Delete Lead</button>
          </form>
        </div>
      </div>
    </>
  );
}
