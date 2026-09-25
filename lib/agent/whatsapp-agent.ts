import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { enabledAgentConnections, getAgentConnection, updateAgentConnection } from "@/lib/db";
import { handleCommand } from "@/lib/agent/handle";
import { open, seal } from "@/lib/secret-box";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { markAgentReadAndTyping, pollUpdates, sendAgentText, type AgentInbound } from "@/lib/integrations/whatsapp-agent";
import type { WhatsAppAgentConnection } from "@/lib/types";

const POLL_SECONDS = 15;
const TYPING_REFRESH_MS = 20_000;

const preview = (text: string | null) => (text ?? "").replace(/\s+/g, " ").slice(0, 120);

/**
 * Pull new messages for every connected WhatsApp agent until `deadline`
 * (epoch ms), running each through the same command handler as the web
 * console and replying in the agent chat. Driven by the background worker
 * (instrumentation.ts) or /api/whatsapp-agent/poll on a schedule; overlapping
 * runs are safe (per-message dedupe, and the API answers 409 to a second
 * poller on the same key). Does nothing unless WHATSAPP_AGENT_ENABLED=true.
 */
export async function pollAgents(deadline: number): Promise<{ enabled: boolean; connections: number; messages: number }> {
  if (!env().WHATSAPP_AGENT_ENABLED) return { enabled: false, connections: 0, messages: 0 };
  await syncEnvConnection().catch((err) => console.error("[wa-agent] WHATSAPP_AGENT_KEY setup failed", err));

  const connections = await enabledAgentConnections();
  const counts = await Promise.all(connections.map((c) => pollConnection(c, deadline).catch((err) => {
    console.error("[wa-agent] poll failed", c.workspace_id, err);
    void updateAgentConnection(c.workspace_id, { last_error: String(err?.message ?? err).slice(0, 300) });
    return 0;
  })));
  return { enabled: true, connections: connections.length, messages: counts.reduce((a, b) => a + b, 0) };
}

let syncedKeyHash: string | null = null;

/**
 * WHATSAPP_AGENT_KEY, when set, is the agent key for one workspace
 * (WHATSAPP_AGENT_WORKSPACE_ID, or the only workspace there is). It is copied
 * into that workspace's connection, replacing any key pasted in Settings.
 */
async function syncEnvConnection(): Promise<void> {
  const key = env().WHATSAPP_AGENT_KEY;
  if (!key) return;
  const hash = createHash("sha256").update(key).digest("hex");
  if (hash === syncedKeyHash) return;

  const db = supabaseAdmin();
  let workspaceId = env().WHATSAPP_AGENT_WORKSPACE_ID;
  if (!workspaceId) {
    const { data } = await db.from("workspaces").select("id").limit(2);
    if (data?.length !== 1) {
      console.error("[wa-agent] WHATSAPP_AGENT_KEY is set but there isn't exactly one workspace; set WHATSAPP_AGENT_WORKSPACE_ID too.");
      return;
    }
    workspaceId = data[0].id as string;
  }

  const existing = await getAgentConnection(workspaceId);
  let same = false;
  try {
    same = !!existing && open(existing.api_key_enc) === key;
  } catch {
    same = false;
  }
  if (!same) {
    const { data: owner } = await db.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner").limit(1).maybeSingle();
    const { error } = await db.from("whatsapp_agent_connections").upsert(
      {
        workspace_id: workspaceId,
        created_by: owner?.user_id ?? null,
        api_key_enc: seal(key),
        key_hint: key.slice(-4),
        owner_participant: null,
        next_offset: null,
        enabled: true,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" },
    );
    if (error) throw new Error(error.message);
    console.log(`[wa-agent] using WHATSAPP_AGENT_KEY (…${key.slice(-4)}) for workspace ${workspaceId}`);
  }
  syncedKeyHash = hash;
}

async function pollConnection(conn: WhatsAppAgentConnection, deadline: number): Promise<number> {
  let apiKey: string;
  try {
    apiKey = open(conn.api_key_enc);
  } catch {
    await updateAgentConnection(conn.workspace_id, { enabled: false, last_error: "Stored key can't be decrypted (was the service role key rotated?). Reconnect in Settings." });
    return 0;
  }

  let offset = conn.next_offset;
  let owner = conn.owner_participant;
  let handled = 0;
  let backoff = 2_000;

  for (;;) {
    const timeoutSec = Math.min(POLL_SECONDS, Math.floor((deadline - Date.now()) / 1000) - 8);
    if (timeoutSec < 2) break;

    let r: Awaited<ReturnType<typeof pollUpdates>>;
    try {
      r = await pollUpdates(apiKey, offset, { timeoutSec });
      backoff = 2_000;
    } catch (err) {
      // Network blips and 5xx: log, back off, keep polling.
      console.error("[wa-agent] poll error; retrying in", backoff / 1000, "s:", (err as Error).message);
      await updateAgentConnection(conn.workspace_id, { last_error: String((err as Error).message).slice(0, 300) });
      if (Date.now() + backoff > deadline) break;
      await new Promise((res) => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, 30_000);
      continue;
    }
    const now = new Date().toISOString();

    if (r.status === "unauthorized") {
      console.error(`[wa-agent] key …${conn.key_hint} rejected by WhatsApp; pausing this connection`);
      await updateAgentConnection(conn.workspace_id, { enabled: false, last_polled_at: now, last_error: "WhatsApp rejected the agent key (invalid or missing bearer token). Reconnect in Settings." });
      return handled;
    }
    if (r.status === "busy") {
      await updateAgentConnection(conn.workspace_id, { last_polled_at: now });
      return handled; // another poller holds this key; it will answer
    }
    if (r.status === "rate_limited") {
      console.warn("[wa-agent] poll rate-limited; waiting", Math.round(r.retryAfterMs / 1000), "s");
      if (Date.now() + r.retryAfterMs > deadline) break;
      await new Promise((res) => setTimeout(res, r.retryAfterMs));
      continue;
    }
    if (r.status === "empty") {
      await updateAgentConnection(conn.workspace_id, { last_polled_at: now, last_error: null });
      continue;
    }

    // Save the cursor before the (possibly minutes-long) agent runs, so an
    // overlapping poll doesn't pick the same messages up again.
    offset = r.nextOffset;
    await updateAgentConnection(conn.workspace_id, { next_offset: offset, last_polled_at: now, last_error: null });

    for (const m of r.messages) {
      console.log(`[wa-agent] ← ${m.from} ${m.type} ${m.id}${m.text ? `: ${preview(m.text)}` : ""}`);
      // The first person to message the agent owns it; everyone else is refused.
      if (!owner) {
        owner = m.from;
        await updateAgentConnection(conn.workspace_id, { owner_participant: owner });
      }
      try {
        if (await processMessage(conn, apiKey, owner, m)) handled++;
      } catch (err) {
        console.error("[wa-agent] message failed", m.id, err);
      }
    }
  }
  return handled;
}

async function reply(apiKey: string, to: string, text: string, replyTo?: string) {
  await sendAgentText(apiKey, to, text, replyTo);
  console.log(`[wa-agent] → ${to}: ${preview(text)}`);
}

async function processMessage(conn: WhatsAppAgentConnection, apiKey: string, owner: string, m: AgentInbound): Promise<boolean> {
  // Idempotency across overlapping polls.
  const { error: dup } = await supabaseAdmin().from("webhook_events").insert({ id: `wa-agent:${m.id}` });
  if (dup) return false;

  if (m.from !== owner) {
    await reply(apiKey, m.from, "This is a private sales agent. It only takes commands from its owner.");
    return false;
  }
  if (!(await rateLimit(`wa-agent:${conn.workspace_id}`, LIMITS.whatsappCommand.limit, LIMITS.whatsappCommand.window))) {
    await reply(apiKey, m.from, "You're sending commands faster than I can work. Give me a few minutes and try again.", m.id);
    return false;
  }
  if (!m.text) {
    await reply(apiKey, m.from, "I can only read text messages for now. Tell me what you need, e.g. \"Find 20 marketing agencies in Chicago\".", m.id);
    return false;
  }

  await markAgentReadAndTyping(apiKey, m.id);
  await updateAgentConnection(conn.workspace_id, { last_message_at: new Date().toISOString() });

  // Long research runs: keep the typing indicator up, and say once that work is still going.
  const started = Date.now();
  let lastTyping = started;
  let nudged = false;
  const onProgress = () => {
    if (Date.now() - lastTyping > TYPING_REFRESH_MS) {
      lastTyping = Date.now();
      void markAgentReadAndTyping(apiKey, m.id);
    }
    if (!nudged && Date.now() - started > 25_000) {
      nudged = true;
      void reply(apiKey, m.from, "⏳ Still on it: researching and saving leads. I'll message you when it's done.").catch(() => {});
    }
  };

  const answer = await handleCommand({ workspaceId: conn.workspace_id, userId: conn.created_by, channel: "whatsapp", externalId: m.from, text: m.text, onProgress });
  await reply(apiKey, m.from, answer, m.id);
  return true;
}
