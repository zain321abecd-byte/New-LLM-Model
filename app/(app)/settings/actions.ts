"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { createLinkCode } from "@/lib/linking";
import { rateLimit } from "@/lib/ratelimit";

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
