import "server-only";
import { createHash, randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

/**
 * Linking a WhatsApp number to an account.
 *
 * The user enters their number in the dashboard and gets a 6-digit code; they
 * prove they own the number by sending "LINK <code>" to the business number
 * from it. Only then may that number command the workspace. Codes are stored
 * hashed and expire after 15 minutes.
 */

const CODE_TTL_MS = 15 * 60_000;
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

export async function createLinkCode(workspaceId: string, userId: string, rawPhone: string): Promise<{ code: string } | { error: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { error: "Enter the number in international format, e.g. +1 512 555 0100." };

  const db = supabaseAdmin();
  const { data: taken } = await db.from("whatsapp_links").select("user_id, verified_at").eq("phone", phone).maybeSingle();
  if (taken?.verified_at && taken.user_id !== userId) return { error: "That number is already linked to another account." };

  const code = String(randomInt(100000, 1000000));
  await db.from("whatsapp_links").delete().eq("user_id", userId).neq("phone", phone);
  const { error } = await db.from("whatsapp_links").upsert(
    {
      workspace_id: workspaceId,
      user_id: userId,
      phone,
      link_code_hash: hash(code),
      link_code_expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      verified_at: null,
    },
    { onConflict: "phone" },
  );
  if (error) return { error: error.message };
  return { code };
}

export async function verifyLinkCode(phone: string, code: string): Promise<boolean> {
  const db = supabaseAdmin();
  const { data } = await db.from("whatsapp_links").select("*").eq("phone", phone).maybeSingle();
  if (!data?.link_code_hash || !data.link_code_expires_at) return false;
  if (new Date(data.link_code_expires_at).getTime() < Date.now()) return false;
  if (data.link_code_hash !== hash(code)) return false;
  await db.from("whatsapp_links").update({ verified_at: new Date().toISOString(), link_code_hash: null, link_code_expires_at: null }).eq("id", data.id);
  return true;
}

export async function linkedAccount(phone: string): Promise<{ workspace_id: string; user_id: string } | null> {
  const { data } = await supabaseAdmin().from("whatsapp_links").select("workspace_id, user_id").eq("phone", phone).not("verified_at", "is", null).maybeSingle();
  return data;
}
