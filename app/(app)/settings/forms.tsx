"use client";

import { useActionState } from "react";
import { connectWhatsAppAgentAction, createLinkCodeAction, disconnectWhatsAppAgentAction, saveProfileAction } from "./actions";
import type { Workspace } from "@/lib/types";

/** One row of an inset grouped form: label on the left, value on the right. */
function Row({ label, name, ws, type = "text", placeholder, disabled }: { label: string; name: keyof Workspace; ws: Workspace; type?: string; placeholder?: string; disabled: boolean }) {
  return (
    <label className="flex items-center gap-3 px-4">
      <span className="w-40 shrink-0 text-[15px]">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={(ws[name] as string | number) ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        className="h-11 w-full min-w-0 bg-transparent text-right text-[15px] text-ink-2 outline-none placeholder:text-ink-3 focus:text-ink"
      />
    </label>
  );
}

function Area({ label, name, ws, placeholder, disabled }: { label: string; name: keyof Workspace; ws: Workspace; placeholder: string; disabled: boolean }) {
  return (
    <label className="block px-4 py-3">
      <span className="block text-[15px]">{label}</span>
      <textarea
        name={name}
        rows={2}
        defaultValue={(ws[name] as string) ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-1 w-full resize-y bg-transparent text-[15px] text-ink-2 outline-none placeholder:text-ink-3 focus:text-ink"
      />
    </label>
  );
}

export function ProfileForm({ ws, canEdit }: { ws: Workspace; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveProfileAction, {});
  const d = !canEdit;

  return (
    <form action={action} className="space-y-7">
      <section>
        <h2 className="section-title">Business profile</h2>
        <div className="card divide-y divide-line overflow-hidden">
          <Row label="Company" name="company_name" ws={ws} placeholder="Acme Automation" disabled={d} />
          <Area label="What you sell" name="offering" ws={ws} disabled={d} placeholder="Workflow automation for small e-commerce teams: order routing, inventory sync, support macros." />
          <Area label="Why customers buy" name="value_proposition" ws={ws} disabled={d} placeholder="Saves 10+ hours a week; live in 7 days; no-code; month-to-month." />
          <Area label="Ideal customer" name="target_customer" ws={ws} disabled={d} placeholder="Shopify stores doing $1–20M/yr with 5–50 staff." />
        </div>
        <p className="mt-2 px-4 text-[13px] text-ink-2">The agent writes every outreach message from this. The more specific, the better.</p>
      </section>

      <section>
        <h2 className="section-title">Sender</h2>
        <div className="card divide-y divide-line overflow-hidden">
          <Row label="Name" name="sender_name" ws={ws} placeholder="Sam from Acme" disabled={d} />
          <Row label="Reply-to email" name="sender_email" ws={ws} type="email" placeholder="sam@acme.com" disabled={d} />
        </div>
      </section>

      <section>
        <h2 className="section-title">Daily limits</h2>
        <div className="card divide-y divide-line overflow-hidden">
          <Row label="Emails per day" name="daily_email_limit" ws={ws} type="number" disabled={d} />
          <Row label="WhatsApp per day" name="daily_whatsapp_limit" ws={ws} type="number" disabled={d} />
        </div>
        <p className="mt-2 px-4 text-[13px] text-ink-2">Hard caps. The agent can't send more than this, whatever it's asked.</p>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending || !canEdit}>{pending ? "Saving…" : "Save"}</button>
        {state.ok && <span className="text-[15px] text-green">✓ Saved</span>}
        {state.error && <span className="text-[15px] text-danger">{state.error}</span>}
        {!canEdit && <span className="text-[13px] text-ink-2">Only owners and admins can edit.</span>}
      </div>
    </form>
  );
}

export function WhatsAppLinkForm({ linkedPhone, businessNumber }: { linkedPhone: string | null; businessNumber: string | null }) {
  const [state, action, pending] = useActionState(createLinkCodeAction, {});
  return (
    <section id="whatsapp">
      <h2 className="section-title">WhatsApp business number</h2>
      <div className="card divide-y divide-line overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-[15px]">Linked number</span>
          <span className={`text-[15px] ${linkedPhone ? "text-ink-2" : "text-ink-3"}`}>{linkedPhone ? `+${linkedPhone}` : "Not linked"}</span>
        </div>
        <form action={action} className="flex items-center gap-2 px-4 py-2">
          <input name="phone" type="tel" required placeholder="+1 512 555 0100" className="h-9 w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-ink-3" aria-label="Your WhatsApp number" />
          <button className="btn-ghost h-8 shrink-0 px-3 text-[13px]" disabled={pending}>{linkedPhone ? "Change" : "Get Code"}</button>
        </form>
      </div>
      {state.error && <p className="mt-2 px-4 text-[13px] text-danger">{state.error}</p>}
      {state.code ? (
        <div className="card mt-3 p-4 text-center">
          <p className="text-[13px] text-ink-2">
            From that phone, send this message{businessNumber ? <> to <span className="font-medium text-ink">+{businessNumber.replace(/^\+/, "")}</span></> : null}
          </p>
          <p className="mt-2 font-mono text-[28px] font-semibold tracking-[0.15em]">LINK {state.code}</p>
          <p className="mt-1 text-[12px] text-ink-2">Expires in 15 minutes</p>
        </div>
      ) : (
        <p className="mt-2 px-4 text-[13px] text-ink-2">Link your phone to command the agent from WhatsApp.</p>
      )}
    </section>
  );
}

export interface AgentStatus {
  keyHint: string;
  enabled: boolean;
  hasOwner: boolean;
  lastPolledAt: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** WhatsApp → Settings → Agents: paste the agent's connection key here. */
export function WhatsAppAgentForm({ status, canEdit }: { status: AgentStatus | null; canEdit: boolean }) {
  const [state, action, pending] = useActionState(connectWhatsAppAgentAction, {});
  const stale = status?.enabled && (!status.lastPolledAt || Date.now() - new Date(status.lastPolledAt).getTime() > 5 * 60_000);

  return (
    <section id="whatsapp-agent">
      <h2 className="section-title">WhatsApp agent</h2>
      <div className="card divide-y divide-line overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-[15px]">Status</span>
          <span className={`flex items-center gap-1.5 text-[13px] ${status?.enabled ? "text-green" : "text-ink-2"}`}>
            <span className={`h-2 w-2 ${status?.enabled ? "bg-green" : "bg-ink-3"}`} aria-hidden />
            {!status ? "Not connected" : status.enabled ? `Connected · key …${status.keyHint}` : "Paused"}
          </span>
        </div>
        {status && (
          <>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
              <span className="text-ink-2">Owner</span>
              <span className="text-ink-2">{status.hasOwner ? "Locked to your chat" : "First person to message it"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
              <span className="text-ink-2">Last checked · last message</span>
              <span className="text-ink-2" suppressHydrationWarning>{ago(status.lastPolledAt)} · {ago(status.lastMessageAt)}</span>
            </div>
          </>
        )}
        {canEdit && (
          <form action={action} className="flex items-center gap-2 px-4 py-2">
            <input name="key" type="password" required autoComplete="off" placeholder="Paste connection key" className="h-9 w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-ink-3" aria-label="WhatsApp agent connection key" />
            <button className="btn-ghost h-8 shrink-0 px-3 text-[13px]" disabled={pending}>{pending ? "Checking…" : status ? "Replace" : "Connect"}</button>
          </form>
        )}
      </div>
      {state.error && <p className="mt-2 px-4 text-[13px] text-danger">{state.error}</p>}
      {state.ok && <p className="mt-2 px-4 text-[13px] text-green">✓ Connected. Now send your agent a message on WhatsApp.</p>}
      {status?.lastError && <p className="mt-2 px-4 text-[13px] text-danger">{status.lastError}</p>}
      {stale && !status?.lastError && (
        <p className="mt-2 px-4 text-[13px] text-danger">Nothing has checked for messages in the last few minutes. Schedule /api/whatsapp-agent/poll (see README), or run npm run agent:poll.</p>
      )}
      <p className="mt-2 px-4 text-[13px] text-ink-2">
        In WhatsApp, go to Settings → Agents → Add an agent, name it Theron, and paste its connection key here. Then chat with Theron in that WhatsApp chat.
      </p>
      {status && canEdit && (
        <form action={disconnectWhatsAppAgentAction} className="mt-1 px-4">
          <button className="text-[13px] text-ink-2 underline hover:text-danger">Disconnect</button>
        </form>
      )}
    </section>
  );
}
