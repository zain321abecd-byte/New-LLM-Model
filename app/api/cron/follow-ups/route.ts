import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
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
  const secret = env().CRON_SECRET;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data: links } = await supabaseAdmin().from("whatsapp_links").select("workspace_id").not("verified_at", "is", null);
  const workspaces = [...new Set((links ?? []).map((l) => l.workspace_id as string))];

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
