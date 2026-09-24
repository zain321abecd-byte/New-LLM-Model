import { after, NextResponse, type NextRequest } from "next/server";
import { env, integrations } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { findLeadByPhone, suppress } from "@/lib/db";
import { handleCommand } from "@/lib/agent/handle";
import { linkedAccount, verifyLinkCode } from "@/lib/linking";
import { notifyWorkspace } from "@/lib/notify";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { markReadAndTyping, messageText, sendText, verifySignature, type InboundMessage, type WebhookPayload } from "@/lib/integrations/whatsapp";

export const runtime = "nodejs";
// Agent turns that research many leads can take minutes. Meta only needs the
// 200 quickly; the work continues in after().
export const maxDuration = 300;

/** Meta's subscription handshake. */
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = env().WHATSAPP_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  if (!integrations().whatsapp) return new NextResponse("WhatsApp not configured", { status: 503 });

  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const inbound: InboundMessage[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      inbound.push(...(change.value?.messages ?? []));
      for (const s of change.value?.statuses ?? []) {
        if (s.status === "failed") failed.push({ id: s.id, error: s.errors?.[0]?.title ?? "delivery failed" });
      }
    }
  }

  // Acknowledge now; Meta retries (and duplicates) deliveries it doesn't see acknowledged fast.
  after(async () => {
    for (const f of failed) {
      await supabaseAdmin().from("messages").update({ sent_status: "failed", error: f.error }).eq("provider_message_id", f.id);
    }
    for (const m of inbound) {
      try {
        await processMessage(m);
      } catch (err) {
        console.error("[whatsapp] processing failed", m.id, err);
      }
    }
  });

  return NextResponse.json({ ok: true });
}

const LINK = /^\s*link\s+(\d{6})\s*$/i;
const OPT_OUT = /^\s*(stop|unsubscribe|opt[\s-]?out|remove me)\b/i;

async function processMessage(m: InboundMessage) {
  // Idempotency: Meta can deliver the same message more than once.
  const { error: dup } = await supabaseAdmin().from("webhook_events").insert({ id: m.id });
  if (dup) return;

  const from = m.from;
  const text = messageText(m);
  const account = await linkedAccount(from);

  if (account) {
    if (!(await rateLimit(`wa:${from}`, LIMITS.whatsappCommand.limit, LIMITS.whatsappCommand.window))) {
      await sendText(from, "You're sending commands faster than I can work. Give me a few minutes and try again.");
      return;
    }
    if (!text) {
      await sendText(from, "I can only read text messages for now. Tell me what you need, e.g. \"Find 20 marketing agencies in Chicago\".");
      return;
    }
    await markReadAndTyping(m.id);

    // Long research runs: tell the user once that work is still going.
    const started = Date.now();
    let nudged = false;
    const onProgress = () => {
      if (!nudged && Date.now() - started > 25_000) {
        nudged = true;
        void sendText(from, "⏳ Still on it: researching and saving leads. I'll message you when it's done.").catch(() => {});
      }
    };

    const reply = await handleCommand({ workspaceId: account.workspace_id, userId: account.user_id, channel: "whatsapp", externalId: from, text, onProgress });
    await sendText(from, reply);
    return;
  }

  const link = text?.match(LINK);
  if (link) {
    if (!(await rateLimit(`link:${from}`, LIMITS.linkAttempt.limit, LIMITS.linkAttempt.window))) return;
    const ok = await verifyLinkCode(from, link[1]);
    await sendText(
      from,
      ok
        ? "✅ Linked! I'm your AI sales assistant. Try:\n• Find 30 dental clinics in Texas\n• Find Shopify store owners in the USA\n• Write outreach for these leads\n• Send follow-ups"
        : "That code didn't match or has expired. Generate a new one in Dashboard → Settings.",
    );
    return;
  }

  // Not a user: maybe a lead replying to outreach.
  const lead = await findLeadByPhone(from);
  if (lead) {
    const db = supabaseAdmin();
    await db.from("messages").insert({
      workspace_id: lead.workspace_id,
      lead_id: lead.id,
      campaign_id: lead.campaign_id,
      message_type: "whatsapp",
      direction: "inbound",
      message_content: text ?? `[${m.type} message]`,
      sent_status: "received",
      provider_message_id: m.id,
    });

    if (text && OPT_OUT.test(text)) {
      await db.from("leads").update({ status: "unsubscribed", whatsapp_opt_in: false }).eq("id", lead.id).eq("workspace_id", lead.workspace_id);
      await suppress(lead.workspace_id, [from, lead.email]);
      await sendText(from, "Done. You won't receive further messages from us.");
      await notifyWorkspace(lead.workspace_id, `🚫 ${lead.company_name} opted out.`);
      return;
    }

    if (["new", "contacted"].includes(lead.status)) {
      await db.from("leads").update({ status: "replied" }).eq("id", lead.id).eq("workspace_id", lead.workspace_id);
    }
    await notifyWorkspace(
      lead.workspace_id,
      `💬 *${lead.contact_name ?? lead.company_name}* (${lead.company_name}) replied on WhatsApp:\n\n"${(text ?? `[${m.type}]`).slice(0, 800)}"\n\nAsk me to draft a response, or reply to them from the dashboard.`,
    );
    return;
  }

  await sendText(
    from,
    "Hi! This is an AI sales assistant. If you have an account, link this number in Dashboard → Settings, then send the code here as: LINK 123456",
  );
}
