"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { LEAD_STATUSES } from "@/lib/types";

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(LEAD_STATUSES),
  notes: z.string().max(5000).optional(),
  whatsapp_opt_in: z.literal("on").optional(),
  contact_name: z.string().trim().max(200).optional(),
  job_title: z.string().trim().max(200).optional(),
  email: z.union([z.literal(""), z.string().trim().email()]).optional(),
  phone: z.string().trim().max(40).optional(),
});

/** Runs through the user's session, so RLS scopes it to their workspace. */
export async function updateLeadAction(formData: FormData) {
  const auth = await requireAuth();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid lead update.");
  const { id, whatsapp_opt_in, ...rest } = parsed.data;

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("leads")
    .update({
      ...rest,
      email: rest.email || null,
      phone: rest.phone || null,
      contact_name: rest.contact_name || null,
      job_title: rest.job_title || null,
      whatsapp_opt_in: whatsapp_opt_in === "on",
    })
    .eq("id", id)
    .eq("workspace_id", auth.workspace.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/leads/${id}`);
}

export async function deleteLeadAction(formData: FormData) {
  const auth = await requireAuth();
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await supabaseServer();
  const { error } = await supabase.from("leads").delete().eq("id", id).eq("workspace_id", auth.workspace.id);
  if (error) throw new Error(error.message);
  redirect("/leads");
}
