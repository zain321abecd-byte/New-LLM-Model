import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { toDomain } from "@/lib/http";
import { normalizePhone } from "@/lib/phone";
import { dedupeKey, scoreLead, type ScoreInput } from "@/lib/scoring";
import type { AgentThread, Campaign, Channel, Lead, LeadStatus, Message, Priority, Workspace } from "@/lib/types";

/**
 * Workspace-scoped data access for code that runs without a user session
 * (the WhatsApp webhook, the agent, cron). Uses the service role, so every
 * function takes the workspace id and filters by it — nothing here may
 * accept a row id without also constraining workspace_id.
 */

const db = () => supabaseAdmin();

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export async function getWorkspace(workspaceId: string): Promise<Workspace> {
  return check(await db().from("workspaces").select("*").eq("id", workspaceId).single()) as Workspace;
}

// ─── Leads ─────────────────────────────────────────────────────────────────

export interface LeadInput extends ScoreInput {
  company_name: string;
  industry?: string | null;
  country?: string | null;
  city?: string | null;
  relevance_reason?: string | null;
  source?: string | null;
}

const MERGEABLE = [
  "contact_name", "job_title", "email", "email_confidence", "phone", "website", "domain", "industry",
  "country", "city", "linkedin_url", "company_size", "relevance_reason", "source",
] as const;

/**
 * Insert new leads and enrich existing ones. A lead found again keeps its
 * status and history; new non-empty facts fill in or replace old ones, and
 * the score is recomputed from the merged record.
 */
export async function saveLeads(
  workspaceId: string,
  inputs: LeadInput[],
  campaignId: string | null,
): Promise<{ saved: Lead[]; created: number; updated: number }> {
  const prepared = inputs.map((l) => {
    const domain = toDomain(l.website ?? null) ?? (l.email ? l.email.split("@")[1]?.toLowerCase() ?? null : null);
    const email = l.email?.trim().toLowerCase() || null;
    return {
      ...l,
      email,
      domain,
      phone: l.phone?.trim() || null,
      website: l.website ? (l.website.includes("://") ? l.website : `https://${l.website}`) : null,
      key: dedupeKey({ email, domain, company_name: l.company_name, contact_name: l.contact_name }),
    };
  });

  const keys = [...new Set(prepared.map((p) => p.key))];
  const existing = check(
    await db().from("leads").select("*").eq("workspace_id", workspaceId).in("dedupe_key", keys),
  ) as Lead[];
  const byKey = new Map(existing.map((l) => [l.dedupe_key, l]));

  const rows = new Map<string, Record<string, unknown>>();
  for (const p of prepared) {
    const prev = byKey.get(p.key) ?? (rows.get(p.key) as Partial<Lead> | undefined);
    const merged: Record<string, unknown> = { ...(prev ?? {}) };
    delete merged.phone_digits; // generated column: Postgres rejects writes to it
    for (const f of MERGEABLE) {
      const v = (p as Record<string, unknown>)[f];
      if (v !== undefined && v !== null && v !== "") merged[f] = v;
    }
    const { score, priority, breakdown } = scoreLead({
      website: merged.website as string | null,
      contact_name: merged.contact_name as string | null,
      job_title: merged.job_title as string | null,
      email: merged.email as string | null,
      email_confidence: merged.email_confidence as number | null,
      phone: merged.phone as string | null,
      linkedin_url: merged.linkedin_url as string | null,
      company_size: merged.company_size as string | null,
      industry_match: p.industry_match,
      growth_signals: p.growth_signals,
      active_business: p.active_business,
    });
    rows.set(p.key, {
      ...merged,
      id: prev?.id,
      workspace_id: workspaceId,
      company_name: p.company_name || prev?.company_name,
      campaign_id: prev?.campaign_id ?? campaignId,
      dedupe_key: p.key,
      lead_score: score,
      priority,
      score_breakdown: breakdown,
      status: prev?.status ?? "new",
    });
  }

  const toInsert = [...rows.values()].filter((r) => !r.id).map(({ id: _id, ...r }) => r);
  const toUpdate = [...rows.values()].filter((r) => r.id);
  const saved: Lead[] = [];
  if (toInsert.length) {
    saved.push(...(check(await db().from("leads").upsert(toInsert, { onConflict: "workspace_id,dedupe_key" }).select("*")) as Lead[]));
  }
  for (const r of toUpdate) {
    const { id, created_at: _c, updated_at: _u, ...patch } = r as Record<string, unknown>;
    saved.push(check(await db().from("leads").update(patch).eq("workspace_id", workspaceId).eq("id", id as string).select("*").single()) as Lead);
  }
  return { saved, created: toInsert.length, updated: toUpdate.length };
}

export interface LeadFilters {
  status?: LeadStatus;
  priority?: Priority;
  campaign_id?: string;
  industry?: string;
  country?: string;
  search?: string;
  ids?: string[];
  limit?: number;
}

export async function queryLeads(workspaceId: string, f: LeadFilters): Promise<Lead[]> {
  let q = db().from("leads").select("*").eq("workspace_id", workspaceId);
  if (f.ids?.length) q = q.in("id", f.ids);
  if (f.status) q = q.eq("status", f.status);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.campaign_id) q = q.eq("campaign_id", f.campaign_id);
  if (f.industry) q = q.ilike("industry", `%${escapeLike(f.industry)}%`);
  if (f.country) q = q.ilike("country", `%${escapeLike(f.country)}%`);
  if (f.search) {
    const s = escapeLike(f.search).replace(/[,()]/g, " ");
    q = q.or(`company_name.ilike.%${s}%,contact_name.ilike.%${s}%,email.ilike.%${s}%,domain.ilike.%${s}%`);
  }
  return check(await q.order("lead_score", { ascending: false }).limit(Math.min(f.limit ?? 50, 200))) as Lead[];
}

export function escapeLike(s: string) {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export async function updateLead(
  workspaceId: string,
  leadId: string,
  patch: Partial<Pick<Lead, "status" | "notes" | "whatsapp_opt_in" | "campaign_id" | "email" | "phone" | "contact_name" | "job_title">>,
): Promise<Lead> {
  return check(await db().from("leads").update(patch).eq("workspace_id", workspaceId).eq("id", leadId).select("*").single()) as Lead;
}

/** Leads contacted at least `days` ago that have not replied, with fewer than `maxSteps` follow-ups. */
export async function followUpCandidates(workspaceId: string, days: number, maxSteps = 2): Promise<(Lead & { steps_sent: number })[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const leads = check(
    await db().from("leads").select("*").eq("workspace_id", workspaceId).eq("status", "contacted").lte("last_contacted_at", cutoff).limit(200),
  ) as Lead[];
  if (!leads.length) return [];
  const msgs = check(
    await db().from("messages").select("lead_id, sequence_step").eq("workspace_id", workspaceId).eq("direction", "outbound").eq("sent_status", "sent")
      .in("lead_id", leads.map((l) => l.id)),
  ) as { lead_id: string; sequence_step: number }[];
  const maxStep = new Map<string, number>();
  for (const m of msgs) maxStep.set(m.lead_id, Math.max(maxStep.get(m.lead_id) ?? 0, m.sequence_step));
  return leads.map((l) => ({ ...l, steps_sent: maxStep.get(l.id) ?? 0 })).filter((l) => l.steps_sent < maxSteps);
}

// ─── Campaigns ─────────────────────────────────────────────────────────────

export async function upsertCampaign(
  workspaceId: string,
  c: { campaign_name: string; target_audience?: string | null; message_template?: string | null; channel?: Channel },
): Promise<Campaign> {
  const existing = check(
    await db().from("campaigns").select("*").eq("workspace_id", workspaceId).ilike("campaign_name", escapeLike(c.campaign_name)).maybeSingle(),
  ) as Campaign | null;
  if (existing) {
    const patch = Object.fromEntries(Object.entries({ target_audience: c.target_audience, message_template: c.message_template, channel: c.channel }).filter(([, v]) => v != null));
    if (!Object.keys(patch).length) return existing;
    return check(await db().from("campaigns").update(patch).eq("id", existing.id).eq("workspace_id", workspaceId).select("*").single()) as Campaign;
  }
  return check(await db().from("campaigns").insert({ workspace_id: workspaceId, ...c }).select("*").single()) as Campaign;
}

export async function listCampaigns(workspaceId: string): Promise<Campaign[]> {
  return check(await db().from("campaigns").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50)) as Campaign[];
}

// ─── Messages ──────────────────────────────────────────────────────────────

export async function insertDrafts(
  workspaceId: string,
  drafts: { lead_id: string; message_type: Channel; subject?: string | null; message_content: string; sequence_step: number; campaign_id: string | null }[],
): Promise<Message[]> {
  if (!drafts.length) return [];
  // Replace any unsent draft for the same lead/channel/step so re-drafting doesn't pile up.
  for (const d of drafts) {
    await db().from("messages").delete().eq("workspace_id", workspaceId).eq("lead_id", d.lead_id).eq("message_type", d.message_type)
      .eq("sequence_step", d.sequence_step).eq("sent_status", "draft");
  }
  return check(
    await db().from("messages").insert(drafts.map((d) => ({ ...d, workspace_id: workspaceId, direction: "outbound", sent_status: "draft" }))).select("*"),
  ) as Message[];
}

export async function getMessages(workspaceId: string, ids: string[]): Promise<Message[]> {
  if (!ids.length) return [];
  return check(await db().from("messages").select("*").eq("workspace_id", workspaceId).in("id", ids)) as Message[];
}

export async function draftsFor(workspaceId: string, f: { lead_ids?: string[]; channel?: Channel; campaign_id?: string }): Promise<Message[]> {
  let q = db().from("messages").select("*").eq("workspace_id", workspaceId).eq("sent_status", "draft");
  if (f.lead_ids?.length) q = q.in("lead_id", f.lead_ids);
  if (f.channel) q = q.eq("message_type", f.channel);
  if (f.campaign_id) q = q.eq("campaign_id", f.campaign_id);
  return check(await q.limit(500)) as Message[];
}

export async function sentTodayCount(workspaceId: string, channel: Channel): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error } = await db().from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId)
    .eq("message_type", channel).eq("direction", "outbound").eq("sent_status", "sent").gte("sent_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function suppressedValues(workspaceId: string, values: string[]): Promise<Set<string>> {
  const clean = [...new Set(values.filter(Boolean).map((v) => v.toLowerCase()))];
  if (!clean.length) return new Set();
  const rows = check(await db().from("suppressions").select("value").eq("workspace_id", workspaceId).in("value", clean)) as { value: string }[];
  return new Set(rows.map((r) => r.value));
}

export async function suppress(workspaceId: string, values: (string | null)[], reason = "unsubscribed") {
  const rows = values.filter((v): v is string => !!v).map((v) => ({ workspace_id: workspaceId, value: v.toLowerCase(), reason }));
  if (rows.length) await db().from("suppressions").upsert(rows, { onConflict: "workspace_id,value", ignoreDuplicates: true });
}

// ─── Stats ─────────────────────────────────────────────────────────────────

export interface LeadStats {
  total_leads: number;
  new_leads: number;
  contacted: number;
  replied: number;
  converted: number;
  high_priority: number;
  medium_priority: number;
  low_priority: number;
}

export const EMPTY_STATS: LeadStats = {
  total_leads: 0, new_leads: 0, contacted: 0, replied: 0, converted: 0, high_priority: 0, medium_priority: 0, low_priority: 0,
};

export async function leadStats(workspaceId: string): Promise<LeadStats> {
  const row = check(await db().from("lead_stats").select("*").eq("workspace_id", workspaceId).maybeSingle()) as LeadStats | null;
  return row ?? EMPTY_STATS;
}

// ─── Agent threads ─────────────────────────────────────────────────────────

export async function getThread(
  workspaceId: string,
  channel: AgentThread["channel"],
  externalId: string,
  userId: string | null,
): Promise<AgentThread> {
  const found = check(
    await db().from("agent_threads").select("*").eq("workspace_id", workspaceId).eq("channel", channel).eq("external_id", externalId).maybeSingle(),
  ) as AgentThread | null;
  if (found) return found;
  return check(
    await db().from("agent_threads")
      .upsert({ workspace_id: workspaceId, channel, external_id: externalId, user_id: userId }, { onConflict: "workspace_id,channel,external_id" })
      .select("*").single(),
  ) as AgentThread;
}

export async function saveThread(thread: AgentThread, patch: Partial<Pick<AgentThread, "history" | "last_lead_ids" | "last_inbound_at">>) {
  await db().from("agent_threads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", thread.id).eq("workspace_id", thread.workspace_id);
}

// ─── Usage metering ────────────────────────────────────────────────────────

export async function logUsage(workspaceId: string, kind: string, quantity = 1, meta: Record<string, unknown> = {}) {
  const { error } = await db().from("usage_events").insert({ workspace_id: workspaceId, kind, quantity, meta });
  if (error) console.error("[usage]", error.message);
}

// ─── Inbound replies from leads ────────────────────────────────────────────

/** A lead who messaged the business number, most recently WhatsApp-contacted first. */
export async function findLeadByPhone(phone: string): Promise<Lead | null> {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  // Stored phones are free-form ("+1 (512) 555-0100"), and may lack the country
  // code; phone_digits is their digits-only form. Match on the national tail.
  const tail = digits.slice(-9);
  const candidates = check(
    await db().from("leads").select("*").like("phone_digits", `%${tail}`)
      .order("last_contacted_at", { ascending: false, nullsFirst: false }).limit(10),
  ) as Lead[];
  return candidates[0] ?? null;
}
