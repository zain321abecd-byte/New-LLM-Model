import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { pollAgents } from "@/lib/agent/whatsapp-agent";

export const runtime = "nodejs";
// Polling stops after POLL_WINDOW_MS; a command that arrives late in the
// window may still run the agent for a few minutes after that.
export const maxDuration = 300;

const POLL_WINDOW_MS = 50_000;

/**
 * Fetches and answers new messages from connected WhatsApp agents. Call it
 * about once a minute: Vercel Cron (Pro), an external cron service, or
 * `npm run agent:poll` in development. Needs `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) return new NextResponse("Unauthorized", { status: 401 });
  const result = await pollAgents(Date.now() + POLL_WINDOW_MS);
  return NextResponse.json(result);
}
