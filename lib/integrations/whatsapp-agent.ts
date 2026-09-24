import "server-only";

/**
 * WhatsApp Agent API: the chat a user creates under WhatsApp → Settings →
 * Agents. Authenticated with that agent's connection key. Inbound messages
 * are long-polled from /updates (there is no webhook); replies and read
 * receipts use the same shapes as the Cloud API.
 */
// Overridable for tests against a mock server.
const base = () => (process.env.WHATSAPP_AGENT_API_URL || "https://api.whatsapp.com/agent/v1").replace(/\/+$/, "");
const MAX_TEXT = 4096;

export interface AgentInbound {
  id: string;
  from: string;
  type: string;
  text: string | null;
}

export type PollResult =
  | { status: "ok"; messages: AgentInbound[]; nextOffset: string | null }
  | { status: "empty" }
  | { status: "busy" } // another poller holds this key (409)
  | { status: "rate_limited" }
  | { status: "unauthorized" };

export class AgentApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function headers(apiKey: string) {
  return { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
}

interface UpdatesPayload {
  next_offset?: string | number;
  entry?: {
    changes?: {
      value?: {
        messages?: { id: string; from: string; type: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[];
      };
    }[];
  }[];
}

/** One long-poll for new messages. Passing `offset` confirms everything before it. */
export async function pollUpdates(apiKey: string, offset: string | null, opts: { timeoutSec: number; limit?: number }): Promise<PollResult> {
  const url = new URL(`${base()}/updates`);
  url.searchParams.set("limit", String(opts.limit ?? 50));
  url.searchParams.set("timeout", String(opts.timeoutSec));
  if (offset) url.searchParams.set("offset", offset);

  const res = await fetch(url, { headers: headers(apiKey), signal: AbortSignal.timeout((opts.timeoutSec + 8) * 1000) });
  if (res.status === 204) return { status: "empty" };
  if (res.status === 409) return { status: "busy" };
  if (res.status === 429) return { status: "rate_limited" };
  if (res.status === 401 || res.status === 403) return { status: "unauthorized" };
  if (!res.ok) throw new AgentApiError(`WhatsApp agent poll failed (${res.status}): ${(await res.text()).slice(0, 300)}`, res.status);

  const data = (await res.json()) as UpdatesPayload;
  const messages: AgentInbound[] = [];
  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        if (!m?.id || !m.from) continue;
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
        messages.push({ id: m.id, from: m.from, type: m.type, text: text?.trim() ? text : null });
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

export async function sendAgentText(apiKey: string, to: string, body: string): Promise<void> {
  for (const chunk of chunkText(body)) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${base()}/messages`, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({ messaging_product: "whatsapp", to: participant(to), type: "text", text: { body: chunk } }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) break;
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw new AgentApiError(`WhatsApp agent send failed (${res.status}): ${(await res.text()).slice(0, 300)}`, res.status);
    }
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
