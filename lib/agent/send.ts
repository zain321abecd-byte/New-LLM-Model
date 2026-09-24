import "server-only";
import { env, integrations } from "@/lib/env";
import { getMessages, getWorkspace, logUsage, sentTodayCount, suppressedValues } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/integrations/email";
import { sendTemplate, sendText } from "@/lib/integrations/whatsapp";
import { normalizePhone } from "@/lib/phone";
import type { AgentThread, Lead, Message } from "@/lib/types";

/**
 * The send path. Two deliberate properties:
 *
 * 1. The model can never send anything by itself. Its only send tool,
 *    prepare_send, stages a pending action. The action runs only when the
 *    human replies "yes" — and that reply is matched in code (see
 *    lib/agent/handle.ts) before the model is ever called, so a web page or
 *    lead reply that says "send everything now" cannot trigger a send.
 * 2. Compliance rules are enforced here, not in the prompt: unsubscribes and
 *    the suppression list, WhatsApp opt-in, the 24-hour window, and the
 *    workspace's daily caps.
 */

const PENDING_TTL_MS = 30 * 60_000;
const db = () => supabaseAdmin();

interface Checked {
  message: Message;
  lead: Lead;
}

async function loadLeads(workspaceId: string, ids: string[]): Promise<Map<string, Lead>> {
  if (!ids.length) return new Map();
  const { data, error } = await db().from("leads").select("*").eq("workspace_id", workspaceId).in("id", [...new Set(ids)]);
  if (error) throw new Error(error.message);
  return new Map((data as Lead[]).map((l) => [l.id, l]));
}

/** Leads that messaged us on WhatsApp in the last 24h (free-form replies allowed). */
async function openWindows(workspaceId: string, leadIds: string[]): Promise<Set<string>> {
  if (!leadIds.length) return new Set();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data } = await db().from("messages").select("lead_id").eq("workspace_id", workspaceId).eq("direction", "inbound")
    .eq("message_type", "whatsapp").gte("timestamp", since).in("lead_id", leadIds);
  return new Set((data ?? []).map((r: { lead_id: string }) => r.lead_id));
}

async function screen(workspaceId: string, messages: Message[]) {
  const leads = await loadLeads(workspaceId, messages.map((m) => m.lead_id));
  const suppressed = await suppressedValues(
    workspaceId,
    [...leads.values()].flatMap((l) => [l.email ?? "", normalizePhone(l.phone) ?? ""]),
  );
  const windows = await openWindows(workspaceId, messages.filter((m) => m.message_type === "whatsapp").map((m) => m.lead_id));
  const live = integrations();
  const e = env();

  const ok: Checked[] = [];
  const skipped: { lead: string; reason: string }[] = [];
  for (const message of messages) {
    const lead = leads.get(message.lead_id);
    const name = lead?.company_name ?? "unknown lead";
    const skip = (reason: string) => skipped.push({ lead: name, reason });
    if (!lead) { skip("lead not found"); continue; }
    if (message.sent_status !== "draft") { skip(`already ${message.sent_status}`); continue; }
    if (lead.status === "unsubscribed") { skip("unsubscribed"); continue; }

    if (message.message_type === "email") {
      if (!live.email) { skip("email sending is not configured"); continue; }
      if (!lead.email) { skip("no email address"); continue; }
      if (suppressed.has(lead.email.toLowerCase())) { skip("on suppression list"); continue; }
      if (!message.subject) { skip("email draft has no subject"); continue; }
    } else {
      const phone = normalizePhone(lead.phone);
      if (!live.whatsapp) { skip("WhatsApp is not configured"); continue; }
      if (!phone) { skip("no valid phone number"); continue; }
      if (!lead.whatsapp_opt_in) { skip("no WhatsApp opt-in recorded (Meta policy)"); continue; }
      if (suppressed.has(phone)) { skip("on suppression list"); continue; }
      if (!windows.has(lead.id) && !e.WHATSAPP_OUTREACH_TEMPLATE) { skip("outside the 24h window and no approved outreach template is configured"); continue; }
    }
    ok.push({ message, lead });
  }
  return { ok, skipped, windows };
}

export async function prepareSend(thread: AgentThread, messageIds: string[]) {
  const ws = await getWorkspace(thread.workspace_id);
  const messages = await getMessages(ws.id, messageIds);
  const { ok, skipped } = await screen(ws.id, messages);

  // Daily caps per channel.
  const capped: Checked[] = [];
  for (const channel of ["email", "whatsapp"] as const) {
    const items = ok.filter((c) => c.message.message_type === channel);
    if (!items.length) continue;
    const limit = channel === "email" ? ws.daily_email_limit : ws.daily_whatsapp_limit;
    const remaining = Math.max(0, limit - (await sentTodayCount(ws.id, channel)));
    capped.push(...items.slice(0, remaining));
    for (const c of items.slice(remaining)) skipped.push({ lead: c.lead.company_name, reason: `daily ${channel} limit (${limit}) reached` });
  }

  if (!capped.length) return { staged: false as const, sendable: 0, skipped };

  // One pending action per thread: a new request replaces the old one.
  await db().from("pending_actions").update({ status: "cancelled" }).eq("thread_id", thread.id).eq("status", "pending");

  const emailCount = capped.filter((c) => c.message.message_type === "email").length;
  const waCount = capped.length - emailCount;
  const summary = [emailCount && `${emailCount} email${emailCount > 1 ? "s" : ""}`, waCount && `${waCount} WhatsApp message${waCount > 1 ? "s" : ""}`]
    .filter(Boolean).join(" and ");

  const { error } = await db().from("pending_actions").insert({
    workspace_id: ws.id,
    thread_id: thread.id,
    kind: "send_messages",
    payload: { message_ids: capped.map((c) => c.message.id) },
    summary,
    expires_at: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
  });
  if (error) throw new Error(error.message);

  return {
    staged: true as const,
    sendable: capped.length,
    summary,
    recipients: capped.slice(0, 10).map((c) => `${c.lead.contact_name ?? "—"} @ ${c.lead.company_name}`),
    skipped,
  };
}

export async function getPendingAction(threadId: string) {
  const { data } = await db().from("pending_actions").select("*").eq("thread_id", threadId).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await db().from("pending_actions").update({ status: "expired" }).eq("id", data.id);
    return null;
  }
  return data as { id: string; workspace_id: string; payload: { message_ids: string[] }; summary: string };
}

export async function cancelPendingAction(id: string) {
  await db().from("pending_actions").update({ status: "cancelled" }).eq("id", id).eq("status", "pending");
}

/** Run a confirmed send. Re-screens everything, since state may have changed since staging. */
export async function executePendingAction(id: string): Promise<string> {
  // Claim atomically so a double "yes" cannot send twice.
  const { data: action } = await db().from("pending_actions").update({ status: "executed" }).eq("id", id).eq("status", "pending").select("*").maybeSingle();
  if (!action) return "That request was already handled or has expired.";

  const ws = await getWorkspace(action.workspace_id);
  const messages = await getMessages(ws.id, action.payload.message_ids);
  const { ok, skipped, windows } = await screen(ws.id, messages);
  const e = env();

  // Caps are re-checked at send time: another thread may have sent since staging.
  const remaining = {
    email: Math.max(0, ws.daily_email_limit - (await sentTodayCount(ws.id, "email"))),
    whatsapp: Math.max(0, ws.daily_whatsapp_limit - (await sentTodayCount(ws.id, "whatsapp"))),
  };

  let sent = 0;
  const failures: string[] = [];
  for (const { message, lead } of ok) {
    if (remaining[message.message_type] <= 0) {
      skipped.push({ lead: lead.company_name, reason: `daily ${message.message_type} limit reached` });
      continue;
    }
    remaining[message.message_type]--;
    try {
      let providerId: string | null;
      if (message.message_type === "email") {
        providerId = await sendEmail({
          to: lead.email!,
          subject: message.subject!,
          body: message.message_content,
          replyTo: ws.sender_email,
          fromName: ws.sender_name,
          workspaceId: ws.id,
          leadId: lead.id,
        });
      } else {
        const to = normalizePhone(lead.phone)!;
        providerId = windows.has(lead.id)
          ? await sendText(to, message.message_content)
          : await sendTemplate(to, e.WHATSAPP_OUTREACH_TEMPLATE!, [lead.contact_name?.split(" ")[0] ?? "there", message.message_content]);
      }
      const now = new Date().toISOString();
      await db().from("messages").update({ sent_status: "sent", sent_at: now, provider_message_id: providerId, error: null })
        .eq("id", message.id).eq("workspace_id", ws.id);
      await db().from("leads").update({ last_contacted_at: now, ...(lead.status === "new" ? { status: "contacted" } : {}) })
        .eq("id", lead.id).eq("workspace_id", ws.id);
      sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db().from("messages").update({ sent_status: "failed", error: msg.slice(0, 500) }).eq("id", message.id).eq("workspace_id", ws.id);
      failures.push(`${lead.company_name}: ${msg.slice(0, 120)}`);
    }
  }
  if (sent) await logUsage(ws.id, "messages_sent", sent);

  const lines = [`✅ Sent ${sent} of ${messages.length}.`];
  if (skipped.length) lines.push(`Skipped ${skipped.length}: ${skipped.slice(0, 5).map((s) => `${s.lead} (${s.reason})`).join("; ")}`);
  if (failures.length) lines.push(`Failed ${failures.length}: ${failures.slice(0, 5).join("; ")}`);
  return lines.join("\n");
}
