import { requireAuth } from "@/lib/auth";
import { env, integrations } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { ProfileForm, WhatsAppLinkForm } from "./forms";

export const dynamic = "force-dynamic";

const INTEGRATIONS: { key: keyof ReturnType<typeof integrations>; label: string; purpose: string }[] = [
  { key: "ai", label: "Claude (Anthropic)", purpose: "Agent brain" },
  { key: "whatsapp", label: "WhatsApp Cloud API", purpose: "Commands, replies, opted-in outreach" },
  { key: "serpapi", label: "SerpAPI", purpose: "Google + Google Maps search" },
  { key: "googleCse", label: "Google Programmable Search", purpose: "Web search fallback" },
  { key: "apollo", label: "Apollo", purpose: "Decision makers, company data" },
  { key: "hunter", label: "Hunter", purpose: "Email finder" },
  { key: "clearbit", label: "Clearbit", purpose: "Company enrichment (legacy keys)" },
  { key: "email", label: "Resend", purpose: "Sending email" },
];

export default async function SettingsPage() {
  const auth = await requireAuth();
  const supabase = await supabaseServer();
  const { data: link } = await supabase.from("whatsapp_links").select("phone, verified_at").eq("user_id", auth.userId).maybeSingle();
  const live = integrations();

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ProfileForm ws={auth.workspace} canEdit={auth.role !== "member"} />
        </div>
        <div className="space-y-7 lg:col-span-2">
          <WhatsAppLinkForm linkedPhone={link?.verified_at ? link.phone : null} businessNumber={env().WHATSAPP_BUSINESS_NUMBER ?? null} />
          <section>
            <h2 className="section-title">Integrations</h2>
            <ul className="card divide-y divide-line overflow-hidden">
              {INTEGRATIONS.map((i) => (
                <li key={i.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block text-[15px]">{i.label}</span>
                    <span className="block text-[12px] text-ink-2">{i.purpose}</span>
                  </span>
                  <span className={`flex shrink-0 items-center gap-1.5 text-[13px] ${live[i.key] ? "text-green" : "text-ink-2"}`}>
                    <span className={`h-2 w-2 ${live[i.key] ? "bg-green" : "bg-ink-3"}`} aria-hidden />
                    {live[i.key] ? "Connected" : "Not set"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 px-4 text-[13px] text-ink-2">Set by your administrator in server environment variables. Keys never reach the browser.</p>
          </section>
        </div>
      </div>
    </>
  );
}
