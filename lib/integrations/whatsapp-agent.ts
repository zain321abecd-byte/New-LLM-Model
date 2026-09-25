import "server-only";

/**
 * WhatsApp Agent API: the chat a user creates under WhatsApp → Settings →
 * Agents. Authenticated with that agent's connection key. Inbound messages
 * are long-polled from /updates (there is no webhook); replies and read
 * receipts use the same shapes as the Cloud API.
 *
 * Limits: one poller per key (a second gets 409), 15 polls/min, 12 sends/min,
 * 4096 characters per message. The agent only chats with the account that
 * created it.
 */
// Overridable for tests against a mock server.
const base = () => (process.env.WHATSAPP_AGENT_API_URL || "https://api.whatsapp.com/agent/v1").replace(/\/+$/, "");
const MAX_TEXT = 4096;
const SENDS_PER_MINUTE = 12;
const MIN_POLL_GAP_MS = 4_500; // keeps a fast-returning poll loop under 15/min

export interface AgentInbound {
  id: string;
  from: string;
  type: string;
  timestamp: string | null;
  text: string | null;
}

export type PollResult =
  | { status: "ok"; messages: AgentInbound[]; nextOffset: string | null }
  | { status: "empty" }
  | { status: "busy" } // another poller holds this key (409)
  | { status: "rate_limited"; retryAfterMs: number }
  | { status: "unauthorized" };

export class AgentApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function headers(apiKey: string) {
  return { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
}

/** Retry-After in ms (seconds or an HTTP date), with a floor for missing or bad values. */
function retryAfterMs(res: Response, fallback: number): number {
  const h = res.headers.get("retry-after");
  if (!h) return fallback;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(1_000, secs * 1_000);
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(1_000, at - Date.now()) : fallback;
}

/** 401/403, or the 400 WhatsApp returns for a malformed or unknown key. */
async function isAuthFailure(res: Response): Promise<boolean> {
  if (res.status === 401 || res.status === 403) return true;
  if (res.status !== 400) return false;
  const body = await res.clone().text().catch(() => "");
  return /authorization bearer token/i.test(body);
}

// Per-key pacing, per server instance. Keys are only ever held in memory here.
const lastPollAt = new Map<string, number>();
const sendTimes = new Map<string, number[]>();

async function paceSend(apiKey: string) {
  const now = Date.now();
  const recent = (sendTimes.get(apiKey) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= SENDS_PER_MINUTE) await sleep(60_000 - (now - recent[0]) + 250);
  recent.push(Date.now());
  sendTimes.set(apiKey, recent.slice(-SENDS_PER_MINUTE));
}

interface UpdatesPayload {
  next_offset?: string | number;
  entry?: {
    changes?: {
      value?: {
        messages?: { id: string; from: string; type: string; timestamp?: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[];
      };
    }[];
  }[];
}

/** One long-poll for new messages. Passing `offset` confirms everything before it. */
export async function pollUpdates(apiKey: string, offset: string | null, opts: { timeoutSec: number; limit?: number }): Promise<PollResult> {
  const wait = (lastPollAt.get(apiKey) ?? 0) + MIN_POLL_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastPollAt.set(apiKey, Date.now());

  const url = new URL(`${base()}/updates`);
  url.searchParams.set("limit", String(opts.limit ?? 50));
  url.searchParams.set("timeout", String(opts.timeoutSec));
  if (offset) url.searchParams.set("offset", offset);

  const res = await fetch(url, { headers: headers(apiKey), signal: AbortSignal.timeout((opts.timeoutSec + 8) * 1000) });
  if (res.status === 204) return { status: "empty" };
  if (res.status === 409) return { status: "busy" };
  if (res.status === 429) return { status: "rate_limited", retryAfterMs: retryAfterMs(res, 10_000) };
  if (await isAuthFailure(res)) return { status: "unauthorized" };
  if (!res.ok) throw new AgentApiError(`WhatsApp agent poll failed (${res.status}): ${(await res.text()).slice(0, 300)}`, res.status);

  const data = (await res.json()) as UpdatesPayload;
  const messages: AgentInbound[] = [];
  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        if (!m?.id || !m.from) continue;
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
        messages.push({ id: m.id, from: m.from, type: m.type, timestamp: m.timestamp ?? null, text: text?.trim() ? text : null });
      }
    }
  }
  const next = data.next_offset;
  return { status: "ok", messages, nextOffset: next === undefined || next === null || next === "" ? offset : String(next) };
}

/** Replies go to a participant id; bare numbers are addressed as `user:<id>`. */
function participant(to: string): string {
  const t = to.trim();
  return t.startsWith("user:") || t.startsWith("agent:") ? t : `user:${t}`;
}

/**
 * WhatsApp renders *bold*, _italic_, ~strike~ and `code` only. Converts the
 * Markdown a model tends to write: **bold**, __bold__, # headings, [text](url).
 */
export function toWhatsAppFormat(text: string): string {
  return text
    .replace(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm, (_, h: string) => `*${h.replace(/\*+/g, "")}*`)
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "*$1*")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label: string, url: string) => (label === url ? url : `${label} (${url})`))
    .replace(/^\s*[-*]{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split long replies on paragraph or line breaks rather than cutting mid-sentence. */
export function chunkText(text: string, max = MAX_TEXT): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const cut = Math.max(rest.lastIndexOf("\n\n", max), rest.lastIndexOf("\n", max), rest.lastIndexOf(" ", max));
    const at = cut > max / 2 ? cut : max;
    chunks.push(rest.slice(0, at).trimEnd());
    rest = rest.slice(at).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * Send a text reply, formatted for WhatsApp and split under 4096 characters.
 * The first chunk quotes `replyTo` when given; if WhatsApp rejects that
 * context (e.g. the message is too old) it is sent again without it.
 */
export async function sendAgentText(apiKey: string, to: string, body: string, replyTo?: string): Promise<void> {
  let context = replyTo;
  for (const chunk of chunkText(toWhatsAppFormat(body))) {
    for (let attempt = 0; ; attempt++) {
      await paceSend(apiKey);
      const payload: Record<string, unknown> = { messaging_product: "whatsapp", to: participant(to), type: "text", text: { body: chunk } };
      if (context) payload.context = { message_id: context };
      const res = await fetch(`${base()}/messages`, { method: "POST", headers: headers(apiKey), body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) });
      if (res.ok) break;
      if (res.status === 400 && context && !(await isAuthFailure(res))) {
        context = undefined; // retry once without the quoted message
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await sleep(res.status === 429 ? retryAfterMs(res, 5_000 * (attempt + 1)) : 1_500 * (attempt + 1));
        continue;
      }
      throw new AgentApiError(`WhatsApp agent send failed (${res.status}): ${(await res.text()).slice(0, 300)}`, res.status);
    }
    context = undefined; // only the first chunk quotes the question
  }
}

/** Blue ticks plus a typing indicator while the agent works (best effort). */
export async function markAgentReadAndTyping(apiKey: string, messageId: string): Promise<void> {
  await fetch(`${base()}/statuses`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId, typing_indicator: { type: "text" } }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

/**
 * Checks a key without consuming anything: an instant poll with no offset
 * confirms nothing, so those messages are delivered again on the next poll.
 */
export async function checkAgentKey(apiKey: string): Promise<"ok" | "busy" | "invalid"> {
  const r = await pollUpdates(apiKey, null, { timeoutSec: 0, limit: 1 });
  if (r.status === "unauthorized") return "invalid";
  if (r.status === "busy") return "busy";
  return "ok";
}
