import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { enabledAgentConnections, updateAgentConnection } from "@/lib/db";
import { handleCommand } from "@/lib/agent/handle";
import { open } from "@/lib/secret-box";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { markAgentReadAndTyping, pollUpdates, sendAgentText, type AgentInbound } from "@/lib/integrations/whatsapp-agent";
import type { WhatsAppAgentConnection } from "@/lib/types";

const POLL_SECONDS = 15;

/**
 * Pull new messages for every connected WhatsApp agent until `deadline`
 * (epoch ms), running each through the same command handler as the web
 * console and replying in the agent chat. Called by /api/whatsapp-agent/poll
 * on a schedule; overlapping runs are safe (per-message dedupe, and the API
 * answers 409 to a second poller on the same key).
 */
export async function pollAgents(deadline: number): Promise<{ connections: number; messages: number }> {
  const connections = await enabledAgentConnections();
  const counts = await Promise.all(connections.map((c) => pollConnection(c, deadline).catch((err) => {
    console.error("[wa-agent] poll failed", c.workspace_id, err);
    void updateAgentConnection(c.workspace_id, { last_error: String(err?.message ?? err).slice(0, 300) });
    return 0;
  })));
  return { connections: connections.length, messages: counts.reduce((a, b) => a + b, 0) };
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

  for (;;) {
    const timeoutSec = Math.min(POLL_SECONDS, Math.floor((deadline - Date.now()) / 1000) - 3);
    if (timeoutSec < 2) break;
    const r = await pollUpdates(apiKey, offset, { timeoutSec });
    const now = new Date().toISOString();

    if (r.status === "unauthorized") {
      await updateAgentConnection(conn.workspace_id, { enabled: false, last_polled_at: now, last_error: "WhatsApp rejected the agent key. Reconnect in Settings." });
      return handled;
    }
    if (r.status === "busy" || r.status === "rate_limited") {
      await updateAgentConnection(conn.workspace_id, { last_polled_at: now });
      return handled; // another poller has it, or back off until the next scheduled run
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

async function processMessage(conn: WhatsAppAgentConnection, apiKey: string, owner: string, m: AgentInbound): Promise<boolean> {
  // Idempotency across overlapping polls.
  const { error: dup } = await supabaseAdmin().from("webhook_events").insert({ id: `wa-agent:${m.id}` });
  if (dup) return false;

  if (m.from !== owner) {
    await sendAgentText(apiKey, m.from, "This is a private sales agent. It only takes commands from its owner.");
    return false;
  }
  if (!(await rateLimit(`wa-agent:${conn.workspace_id}`, LIMITS.whatsappCommand.limit, LIMITS.whatsappCommand.window))) {
    await sendAgentText(apiKey, m.from, "You're sending commands faster than I can work. Give me a few minutes and try again.");
    return false;
  }
  if (!m.text) {
    await sendAgentText(apiKey, m.from, "I can only read text messages for now. Tell me what you need, e.g. \"Find 20 marketing agencies in Chicago\".");
    return false;
  }

  await markAgentReadAndTyping(apiKey, m.id);
  await updateAgentConnection(conn.workspace_id, { last_message_at: new Date().toISOString() });

  // Long research runs: tell the user once that work is still going.
  const started = Date.now();
  let nudged = false;
  const onProgress = () => {
    if (!nudged && Date.now() - started > 25_000) {
      nudged = true;
      void sendAgentText(apiKey, m.from, "⏳ Still on it: researching and saving leads. I'll message you when it's done.").catch(() => {});
    }
  };

  const reply = await handleCommand({ workspaceId: conn.workspace_id, userId: conn.created_by, channel: "whatsapp", externalId: m.from, text: m.text, onProgress });
  await sendAgentText(apiKey, m.from, reply);
  return true;
}
