import "server-only";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendTemplate, sendText } from "@/lib/integrations/whatsapp";
import { sendAgentText } from "@/lib/integrations/whatsapp-agent";
import { getAgentConnection } from "@/lib/db";
import { open } from "@/lib/secret-box";

/**
 * Alert the workspace owner: in their WhatsApp agent chat when one is
 * connected, and to everyone who linked a number to the business number.
 * On the business number, free-form text works while the owner's 24h window
 * is open (they messaged the agent recently); outside it Meta rejects the
 * text, so fall back to the approved notification template when one is set.
 */
export async function notifyWorkspace(workspaceId: string, text: string): Promise<void> {
  try {
    const agent = await getAgentConnection(workspaceId);
    if (agent?.enabled && agent.owner_participant) await sendAgentText(open(agent.api_key_enc), agent.owner_participant, text);
  } catch (err) {
    console.error("[notify] agent chat failed", err);
  }

  const { data: links } = await supabaseAdmin().from("whatsapp_links").select("phone").eq("workspace_id", workspaceId).not("verified_at", "is", null);
  const template = env().WHATSAPP_NOTIFY_TEMPLATE;
  for (const { phone } of links ?? []) {
    try {
      await sendText(phone, text);
    } catch (err) {
      if (!template) {
        console.error("[notify] text failed and no WHATSAPP_NOTIFY_TEMPLATE set", err);
        continue;
      }
      await sendTemplate(phone, template, [text]).catch((e) => console.error("[notify] template failed", e));
    }
  }
}
