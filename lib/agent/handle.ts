import "server-only";
import { getThread, getWorkspace, logAgentMessages, saveThread } from "@/lib/db";
import { describeAgentError, runAgent } from "@/lib/agent/agent";
import { cancelPendingAction, executePendingAction, getPendingAction } from "@/lib/agent/send";
import { integrations } from "@/lib/env";

const CONFIRM = /^\s*(yes|y|yep|yeah|confirm(ed)?|send( it| them)?|go( ahead)?|approve[d]?|ok(ay)?,? send)\s*[.!👍✅]*\s*$/i;
const CANCEL = /^\s*(no|n|nope|cancel|stop|don'?t send|abort)\s*[.!❌]*\s*$/i;
const MAX_STORED_TURNS = 40;

export interface CommandInput {
  workspaceId: string;
  userId: string | null;
  channel: "whatsapp" | "web";
  externalId: string;
  text: string;
  onProgress?: () => void;
}

/**
 * Entry point for one user command, shared by WhatsApp and the web console.
 *
 * Confirmation of a staged send is decided here, by exact match on the
 * user's own message, before the model is involved.
 */
export async function handleCommand(input: CommandInput): Promise<string> {
  const thread = await getThread(input.workspaceId, input.channel, input.externalId, input.userId);
  const text = input.text.trim().slice(0, 4000);

  const record = async (reply: string, lastLeadIds?: string[]) => {
    const history = [...thread.history, { role: "user" as const, text }, { role: "assistant" as const, text: reply }].slice(-MAX_STORED_TURNS);
    await saveThread(thread, { history, last_inbound_at: new Date().toISOString(), ...(lastLeadIds ? { last_lead_ids: lastLeadIds.slice(0, 500) } : {}) });
    await logAgentMessages(thread, [{ role: "user", text }, { role: "assistant", text: reply }]);
    return reply;
  };

  const pending = await getPendingAction(thread.id);
  if (pending && CONFIRM.test(text)) return record(await executePendingAction(pending.id));
  if (pending && CANCEL.test(text)) {
    await cancelPendingAction(pending.id);
    return record(`Cancelled. Nothing was sent. The drafts are still saved if you want to edit or send them later.`);
  }
  if (!pending && CONFIRM.test(text) && thread.history.length === 0) {
    return record("Hi! Tell me who you want to reach, e.g. \"Find 30 dental clinics in Austin, TX\" or \"Find Shopify store owners in the USA\".");
  }

  if (!integrations().ai) return record("The AI engine isn't configured yet (ANTHROPIC_API_KEY). Ask your admin to add it.");

  const workspace = await getWorkspace(input.workspaceId);
  const ctx = { workspace, thread, lastLeadIds: thread.last_lead_ids };
  try {
    const { reply, lastLeadIds } = await runAgent(ctx, input.channel, text, input.onProgress);
    return record(reply, lastLeadIds);
  } catch (err) {
    console.error("[agent]", err);
    return record(`${describeAgentError(err)} Nothing was sent.`);
  }
}
