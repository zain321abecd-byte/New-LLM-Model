import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { followUpCandidates } from "@/lib/db";
import { notifyWorkspace } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily nudge (vercel.json cron). Tells each workspace owner on WhatsApp how
 * many leads are due a follow-up. It does not draft or send anything by
 * itself: the owner replies "draft follow-ups" and confirms as usual.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) return new NextResponse("Unauthorized", { status: 401 });

  // Workspaces reachable on WhatsApp: a linked number, or an agent chat with an owner.
  const db = supabaseAdmin();
  const [{ data: links }, { data: agents }] = await Promise.all([
    db.from("whatsapp_links").select("workspace_id").not("verified_at", "is", null),
    db.from("whatsapp_agent_connections").select("workspace_id").eq("enabled", true).not("owner_participant", "is", null),
  ]);
  const workspaces = [...new Set([...(links ?? []), ...(agents ?? [])].map((l) => l.workspace_id as string))];

  let notified = 0;
  for (const ws of workspaces) {
    const due = await followUpCandidates(ws, 3);
    if (!due.length) continue;
    const names = due.slice(0, 3).map((l) => l.company_name).join(", ");
    await notifyWorkspace(
      ws,
      `📬 ${due.length} lead${due.length > 1 ? "s are" : " is"} due a follow-up (${names}${due.length > 3 ? ", …" : ""}).\nReply *draft follow-ups* and I'll write them for your approval.`,
    );
    notified++;
  }
  return NextResponse.json({ workspaces: workspaces.length, notified });
}
