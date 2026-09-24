import Link from "next/link";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/ui";
import type { Campaign } from "@/lib/types";

export const dynamic = "force-dynamic";

const campaignSchema = z.object({
  campaign_name: z.string().trim().min(2).max(120),
  target_audience: z.string().trim().max(500).optional(),
  channel: z.enum(["email", "whatsapp"]),
  message_template: z.string().trim().max(4000).optional(),
});

async function createCampaign(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const data = campaignSchema.parse(Object.fromEntries(formData));
  const supabase = await supabaseServer();
  const { error } = await supabase.from("campaigns").insert({ ...data, workspace_id: auth.workspace.id });
  if (error) throw new Error(error.code === "23505" ? "A campaign with that name already exists." : error.message);
  revalidatePath("/campaigns");
}

async function setStatus(formData: FormData) {
  "use server";
  const auth = await requireAuth();
  const id = z.string().uuid().parse(formData.get("id"));
  const status = z.enum(["active", "paused", "completed"]).parse(formData.get("status"));
  const supabase = await supabaseServer();
  await supabase.from("campaigns").update({ status }).eq("id", id).eq("workspace_id", auth.workspace.id);
  revalidatePath("/campaigns");
}

export default async function CampaignsPage() {
  const auth = await requireAuth();
  const supabase = await supabaseServer();
  const { data } = await supabase.from("campaigns").select("*").eq("workspace_id", auth.workspace.id).order("created_at", { ascending: false });
  const campaigns = (data ?? []) as Campaign[];

  return (
    <>
      <PageHeader title="Campaigns" subtitle="Group leads and outreach. The agent also creates campaigns when you name one in a command." />

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="section-title">All campaigns</h2>
          {campaigns.length === 0 ? (
            <EmptyState title="No campaigns yet">Try telling the agent: “Find 40 Shopify stores selling skincare for a campaign called Skincare Q4”.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {campaigns.map((c) => {
                const rate = c.sent_count ? Math.round((c.reply_count / c.sent_count) * 100) : null;
                return (
                  <li key={c.id} className="card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/leads?campaign=${c.id}`} className="text-[17px] font-semibold hover:text-accent">{c.campaign_name}</Link>
                        <p className="mt-0.5 text-[13px] text-ink-2">
                          <span className="capitalize">{c.channel}</span>
                          {c.target_audience ? ` · ${c.target_audience}` : ""}
                        </p>
                      </div>
                      <form action={setStatus} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <select name="status" defaultValue={c.status} className="input h-8 w-auto text-[13px]" aria-label="Campaign status">
                          <option value="active">Active</option>
                          <option value="paused">Paused</option>
                          <option value="completed">Completed</option>
                        </select>
                        <button className="btn-ghost h-8 px-3 text-[13px]">Update</button>
                      </form>
                    </div>
                    <dl className="mt-4 grid grid-cols-4 divide-x divide-line bg-surface-2 py-2.5 text-center">
                      {[["Leads", c.total_leads], ["Sent", c.sent_count], ["Replies", c.reply_count], ["Reply rate", rate === null ? "—" : `${rate}%`]].map(([k, v]) => (
                        <div key={k as string} className="flex flex-col-reverse">
                          <dt className="text-[12px] text-ink-2">{k}</dt>
                          <dd className="text-[20px] font-semibold tabular-nums">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="section-title">New campaign</h2>
          <form action={createCampaign} className="card space-y-4 p-4">
            <div><label className="label" htmlFor="campaign_name">Name</label><input id="campaign_name" name="campaign_name" required minLength={2} className="input" placeholder="Skincare Q4" /></div>
            <div><label className="label" htmlFor="target_audience">Target audience</label><input id="target_audience" name="target_audience" placeholder="Dental clinics in Texas" className="input" /></div>
            <div>
              <label className="label" htmlFor="channel">Channel</label>
              <select id="channel" name="channel" className="input"><option value="email">Email</option><option value="whatsapp">WhatsApp (opted-in leads only)</option></select>
            </div>
            <div>
              <label className="label" htmlFor="message_template">Message guidance</label>
              <textarea id="message_template" name="message_template" rows={4} className="input" placeholder="Optional: angle, offer or tone for this campaign" />
            </div>
            <button className="btn-primary w-full">Create Campaign</button>
          </form>
        </section>
      </div>
    </>
  );
}
