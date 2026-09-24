"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { createLinkCode } from "@/lib/linking";
import { rateLimit } from "@/lib/ratelimit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { seal } from "@/lib/secret-box";
import { checkAgentKey } from "@/lib/integrations/whatsapp-agent";

const profileSchema = z.object({
  company_name: z.string().trim().max(200),
  offering: z.string().trim().max(1000),
  value_proposition: z.string().trim().max(1000),
  target_customer: z.string().trim().max(500),
  sender_name: z.string().trim().max(100),
  sender_email: z.union([z.literal(""), z.string().trim().email()]),
  daily_email_limit: z.coerce.number().int().min(0).max(2000),
  daily_whatsapp_limit: z.coerce.number().int().min(0).max(1000),
});

export async function saveProfileAction(_: unknown, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireAuth();
  if (auth.role === "member") return { error: "Only workspace owners and admins can change settings." };
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await supabaseServer();
  const blankToNull = Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [k, v === "" ? null : v]));
  const { error } = await supabase.from("workspaces").update(blankToNull).eq("id", auth.workspace.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function createLinkCodeAction(_: unknown, formData: FormData): Promise<{ code?: string; error?: string }> {
  const auth = await requireAuth();
  if (!(await rateLimit(`linkcode:${auth.userId}`, 5, 3600))) return { error: "Too many attempts. Try again in an hour." };
  return createLinkCode(auth.workspace.id, auth.userId, String(formData.get("phone") ?? ""));
}

const agentKeySchema = z.string().trim().min(16, "That doesn't look like a WhatsApp agent key.").max(4096).regex(/^\S+$/, "The key can't contain spaces.");

export async function connectWhatsAppAgentAction(_: unknown, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireAuth();
  if (auth.role === "member") return { error: "Only workspace owners and admins can connect WhatsApp." };
  if (!(await rateLimit(`agentkey:${auth.workspace.id}`, 10, 3600))) return { error: "Too many attempts. Try again in an hour." };
  const parsed = agentKeySchema.safeParse(formData.get("key"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid key." };
  const key = parsed.data;

  let check: Awaited<ReturnType<typeof checkAgentKey>>;
  try {
    check = await checkAgentKey(key);
  } catch (err) {
    return { error: `Couldn't reach WhatsApp to check the key. ${err instanceof Error ? err.message : ""}`.trim() };
  }
  if (check === "invalid") return { error: "WhatsApp rejected that key. Copy it again from WhatsApp → Settings → Agents." };

  // Service role: the table has no RLS policies, so the sealed key never reaches the browser.
  const { error } = await supabaseAdmin().from("whatsapp_agent_connections").upsert(
    {
      workspace_id: auth.workspace.id,
      created_by: auth.userId,
      api_key_enc: seal(key),
      key_hint: key.slice(-4),
      owner_participant: null,
      next_offset: null,
      enabled: true,
      last_error: check === "busy" ? "Another app is already polling this key. Use a separate agent for Theron." : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" },
  );
  if (error) {
    const missingTable = error.code === "PGRST205" || error.code === "42P01";
    return { error: missingTable ? "Run supabase/migrations/20260925000000_whatsapp_agent.sql in the Supabase SQL editor first." : error.message };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function disconnectWhatsAppAgentAction(): Promise<void> {
  const auth = await requireAuth();
  if (auth.role === "member") return;
  await supabaseAdmin().from("whatsapp_agent_connections").delete().eq("workspace_id", auth.workspace.id);
  revalidatePath("/settings");
}
