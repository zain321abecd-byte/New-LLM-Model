import { NextResponse, type NextRequest } from "next/server";
import { isPollAuthorized } from "@/lib/cron-auth";
import { pollAgents } from "@/lib/agent/whatsapp-agent";

export const runtime = "nodejs";
// Polling stops after POLL_WINDOW_MS; a command that arrives late in the
// window may still run the agent for a few minutes after that.
export const maxDuration = 300;

const POLL_WINDOW_MS = 50_000;

/**
 * Fetches and answers new messages from connected WhatsApp agents. On a
 * long-running server the background worker (instrumentation.ts) calls this
 * continuously; on Vercel, call it about once a minute (Vercel Cron on Pro, or
 * an external scheduler) with `Authorization: Bearer $CRON_SECRET`. Does
 * nothing unless WHATSAPP_AGENT_ENABLED=true.
 */
export async function GET(req: NextRequest) {
  if (!isPollAuthorized(req.headers.get("authorization"))) return new NextResponse("Unauthorized", { status: 401 });
  const result = await pollAgents(Date.now() + POLL_WINDOW_MS);
  return NextResponse.json(result);
}
