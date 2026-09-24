import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui";
import { AgentConsole } from "./AgentConsole";
import type { AgentThread } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const auth = await requireAuth();
  // agent_threads is service-role only; scope explicitly to this user's own web thread.
  const { data } = await supabaseAdmin().from("agent_threads").select("history")
    .eq("workspace_id", auth.workspace.id).eq("channel", "web").eq("external_id", auth.userId).maybeSingle();
  const history = ((data as Pick<AgentThread, "history"> | null)?.history ?? []).slice(-20);

  return (
    <>
      <PageHeader title="Agent console" subtitle="The same Theron you reach on WhatsApp. Useful for testing and for longer sessions at a desk." />
      <AgentConsole initial={history} />
    </>
  );
}
