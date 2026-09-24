import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { likeTerm, type LeadQuery } from "@/lib/lead-filters";
import type { Lead } from "@/lib/types";

export const PAGE_SIZE = 25;

/** Leads for the signed-in user, through RLS. `pageSize` overrides the UI page size (CSV export). */
export async function fetchLeads(workspaceId: string, q: LeadQuery, pageSize = PAGE_SIZE): Promise<{ leads: Lead[]; total: number }> {
  const supabase = await supabaseServer();
  let query = supabase.from("leads").select("*", { count: "exact" }).eq("workspace_id", workspaceId);
  if (q.status) query = query.eq("status", q.status);
  if (q.priority) query = query.eq("priority", q.priority);
  if (q.campaign) query = query.eq("campaign_id", q.campaign);
  if (q.country) query = query.ilike("country", `%${likeTerm(q.country)}%`);
  if (q.q) {
    const t = likeTerm(q.q);
    query = query.or(`company_name.ilike.%${t}%,contact_name.ilike.%${t}%,email.ilike.%${t}%,domain.ilike.%${t}%,industry.ilike.%${t}%,city.ilike.%${t}%`);
  }
  query = q.sort === "newest"
    ? query.order("created_at", { ascending: false })
    : query.order("lead_score", { ascending: false }).order("created_at", { ascending: false });

  const from = (q.page - 1) * pageSize;
  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);
  return { leads: (data ?? []) as Lead[], total: count ?? 0 };
}
