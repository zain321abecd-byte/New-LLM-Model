import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";

/**
 * Outbound email through Resend's HTTP API.
 *
 * Every message carries a working one-click unsubscribe link (header and
 * footer) and the sender's postal address: CAN-SPAM requires both for
 * commercial email, and Gmail/Yahoo bulk-sender rules require the header.
 */

export function unsubscribeToken(workspaceId: string, leadId: string): string {
  const secret = env().UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error("UNSUBSCRIBE_SECRET is not set.");
  const payload = `${workspaceId}.${leadId}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): { workspaceId: string; leadId: string } | null {
  const secret = env().UNSUBSCRIBE_SECRET;
  const [p, sig] = token.split(".");
  if (!secret || !p || !sig) return null;
  const payload = Buffer.from(p, "base64url").toString();
  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [workspaceId, leadId] = payload.split(".");
  return workspaceId && leadId ? { workspaceId, leadId } : null;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
  replyTo?: string | null;
  fromName?: string | null;
  workspaceId: string;
  leadId: string;
}): Promise<string | null> {
  const e = env();
  if (!e.RESEND_API_KEY || !e.EMAIL_FROM) throw new Error("Email is not configured (RESEND_API_KEY, EMAIL_FROM).");

  const unsubscribeUrl = `${e.NEXT_PUBLIC_SITE_URL}/api/unsubscribe?t=${unsubscribeToken(opts.workspaceId, opts.leadId)}`;
  const footerText = [
    "",
    "—",
    e.COMPANY_POSTAL_ADDRESS ?? "",
    `Not interested? Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");

  // Plain, personal-looking HTML: heavy templates hurt cold-email deliverability.
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">` +
    opts.body.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("") +
    `<p style="color:#888;font-size:12px;margin-top:24px">${escapeHtml(e.COMPANY_POSTAL_ADDRESS ?? "")}<br>` +
    `<a href="${unsubscribeUrl}" style="color:#888">Unsubscribe</a></p></div>`;

  // Display name comes from the workspace, the address from the verified domain.
  const fromAddress = e.EMAIL_FROM.match(/<([^>]+)>/)?.[1] ?? e.EMAIL_FROM;
  const from = opts.fromName ? `${opts.fromName.replace(/[<>"]/g, "")} <${fromAddress}>` : e.EMAIL_FROM;

  const data = await fetchJson<{ id?: string }>("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.body + footerText,
      html,
      reply_to: opts.replyTo || undefined,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  return data.id ?? null;
}
