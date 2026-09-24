import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";

/**
 * Meta WhatsApp Cloud API.
 *
 * Messaging rules this module is built around:
 * - Free-form text is only allowed inside the 24-hour customer service window
 *   (the recipient messaged us in the last 24h). The owner commanding the
 *   agent is always inside it, because their command opened it.
 * - Anything outside the window must be an approved template.
 * - Businesses may only message people who opted in. That is enforced in the
 *   send path (lib/agent/send.ts), not here.
 */

const MAX_TEXT = 4096;

function graphUrl(path: string) {
  const e = env();
  return `https://graph.facebook.com/${e.WHATSAPP_GRAPH_VERSION}/${path}`;
}

function authHeaders() {
  const token = env().WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN is not set.");
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

async function post(body: Record<string, unknown>): Promise<string | null> {
  const phoneId = env().WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneId) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set.");
  const data = await fetchJson<{ messages?: { id: string }[] }>(graphUrl(`${phoneId}/messages`), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  return data.messages?.[0]?.id ?? null;
}

/** Split on paragraph boundaries so long agent replies stay readable. */
export function chunkText(text: string, max = MAX_TEXT): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const para of text.split(/\n{2,}/)) {
    const piece = current ? `${current}\n\n${para}` : para;
    if (piece.length <= max) {
      current = piece;
      continue;
    }
    if (current) chunks.push(current);
    current = para.length <= max ? para : "";
    if (para.length > max) for (let i = 0; i < para.length; i += max) chunks.push(para.slice(i, i + max));
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function sendText(to: string, text: string): Promise<string | null> {
  let lastId: string | null = null;
  for (const chunk of chunkText(text)) {
    lastId = await post({ recipient_type: "individual", to, type: "text", text: { body: chunk, preview_url: false } });
  }
  return lastId;
}

/**
 * Template parameters may not contain newlines, tabs or more than four
 * consecutive spaces, and Meta caps each at 1024 characters.
 */
function templateParam(s: string) {
  return s.replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 1024);
}

export async function sendTemplate(to: string, name: string, bodyParams: string[]): Promise<string | null> {
  return post({
    to,
    type: "template",
    template: {
      name,
      language: { code: env().WHATSAPP_TEMPLATE_LANG },
      components: bodyParams.length
        ? [{ type: "body", parameters: bodyParams.map((p) => ({ type: "text", text: templateParam(p) })) }]
        : [],
    },
  });
}

/** Blue ticks plus a typing indicator while the agent works (best effort). */
export async function markReadAndTyping(messageId: string): Promise<void> {
  await post({ status: "read", message_id: messageId, typing_indicator: { type: "text" } }).catch(() => {});
}

/** Verify X-Hub-Signature-256 over the raw request body. */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = env().WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// ─── Webhook payload (the subset we read) ───────────────────────────────────

export interface InboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  button?: { text: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
}

export interface WebhookPayload {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        messages?: InboundMessage[];
        statuses?: { id: string; status: "sent" | "delivered" | "read" | "failed"; recipient_id: string; errors?: { title?: string }[] }[];
      };
    }[];
  }[];
}

export function messageText(m: InboundMessage): string | null {
  return m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
}
