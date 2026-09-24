import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { suppress } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/integrations/email";

export const runtime = "nodejs";

async function unsubscribe(token: string | null): Promise<boolean> {
  const parsed = token ? verifyUnsubscribeToken(token) : null;
  if (!parsed) return false;
  const db = supabaseAdmin();
  const { data: lead } = await db.from("leads").update({ status: "unsubscribed", whatsapp_opt_in: false })
    .eq("id", parsed.leadId).eq("workspace_id", parsed.workspaceId).select("email, phone_digits").maybeSingle();
  if (lead) await suppress(parsed.workspaceId, [lead.email, lead.phone_digits]);
  return true;
}

function page(message: string, status = 200) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a">
<p style="max-width:28rem;padding:2rem;text-align:center">${message}</p></body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

/** Link in the email footer. */
export async function GET(req: NextRequest) {
  const ok = await unsubscribe(req.nextUrl.searchParams.get("t"));
  return ok
    ? page("You've been unsubscribed. You won't receive further emails from us.")
    : page("This unsubscribe link is invalid. Reply to the email with \"unsubscribe\" and we'll remove you.", 400);
}

/** RFC 8058 one-click unsubscribe (List-Unsubscribe-Post), sent by mail clients. */
export async function POST(req: NextRequest) {
  const ok = await unsubscribe(req.nextUrl.searchParams.get("t"));
  return new NextResponse(null, { status: ok ? 200 : 400 });
}
