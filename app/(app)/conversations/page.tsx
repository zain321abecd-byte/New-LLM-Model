import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { agentThreadMessages, latestAgentMessages, listAgentThreads } from "@/lib/db";
import { EmptyState, PageHeader } from "@/components/ui";
import { Formatted } from "@/components/Formatted";
import { LocalTime } from "@/components/LocalTime";
import type { AgentThread } from "@/lib/types";

export const dynamic = "force-dynamic";

function threadLabel(t: AgentThread): string {
  if (t.channel === "web") return "Web console";
  return /^\d+$/.test(t.external_id) ? `WhatsApp +${t.external_id}` : "WhatsApp agent chat";
}

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const auth = await requireAuth();
  const { t } = await searchParams;
  // Owners and admins review every conversation in the workspace; members see their own.
  const threads = await listAgentThreads(auth.workspace.id, auth.role === "member" ? auth.userId : null);
  const latest = await latestAgentMessages(auth.workspace.id, threads.map((x) => x.id));
  const active = threads.find((x) => x.id === t) ?? threads.find((x) => latest.has(x.id)) ?? threads[0];
  const messages = active ? await agentThreadMessages(auth.workspace.id, active.id) : [];

  return (
    <>
      <PageHeader title="Conversations" subtitle="Every message between you and Theron, on WhatsApp and in the console." />
      {threads.length === 0 ? (
        <EmptyState title="No conversations yet">Connect your WhatsApp agent in Settings, then send it a message. Chats from the Agent console appear here too.</EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <ul className="card divide-y divide-line self-start overflow-hidden">
            {threads.map((x) => {
              const last = latest.get(x.id);
              const on = x.id === active?.id;
              return (
                <li key={x.id}>
                  <Link href={`/conversations?t=${x.id}`} className={`block px-4 py-3 ${on ? "bg-fill" : "hover:bg-fill"}`} aria-current={on ? "page" : undefined}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-[15px] font-medium">
                        <span className={`h-2 w-2 shrink-0 ${x.channel === "whatsapp" ? "bg-green" : "bg-accent"}`} aria-hidden />
                        <span className="truncate">{threadLabel(x)}</span>
                      </span>
                      {last && <span className="shrink-0 font-mono text-[11px] text-ink-3"><LocalTime iso={last.created_at} /></span>}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink-2">{last ? `${last.role === "user" ? "You: " : ""}${last.text}` : "No messages logged yet"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <section className="card flex max-h-[calc(100dvh-14rem)] min-h-[420px] flex-col overflow-hidden lg:col-span-2">
            <div className="border-b border-line px-4 py-3 font-mono text-[12px] uppercase tracking-[0.04em] text-ink-2">
              {active ? threadLabel(active) : ""} · {messages.length} message{messages.length === 1 ? "" : "s"}
            </div>
            <div className="flex flex-1 flex-col-reverse overflow-y-auto px-4 py-5">
              {/* column-reverse keeps the newest message in view without client JS */}
              <div className="space-y-1.5">
                {messages.length === 0 && <p className="py-10 text-center text-[15px] text-ink-2">No messages logged for this chat yet.</p>}
                {messages.map((m, i) => {
                  const mine = m.role === "user";
                  const showTime = i === 0 || new Date(m.created_at).getTime() - new Date(messages[i - 1].created_at).getTime() > 15 * 60_000;
                  return (
                    <div key={m.id}>
                      {showTime && <p className="py-2 text-center font-mono text-[11px] text-ink-3"><LocalTime iso={m.created_at} /></p>}
                      <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] whitespace-pre-wrap px-4 py-3 text-[15px] leading-[1.5] ${mine ? "bg-accent text-white" : "border border-line bg-surface-2 text-ink"}`}>
                          {mine ? m.text : <Formatted text={m.text} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
