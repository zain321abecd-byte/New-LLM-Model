import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { handleCommand } from "@/lib/agent/handle";
import { rateLimit, LIMITS } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 300;

const body = z.object({ text: z.string().trim().min(1).max(4000) });

/** The dashboard's agent console: same brain and tools as WhatsApp. */
export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { text }." }, { status: 400 });

  if (!(await rateLimit(`web:${auth.userId}`, LIMITS.webCommand.limit, LIMITS.webCommand.window))) {
    return NextResponse.json({ error: "Too many commands. Give it a few minutes." }, { status: 429 });
  }

  const reply = await handleCommand({
    workspaceId: auth.workspace.id,
    userId: auth.userId,
    channel: "web",
    externalId: auth.userId,
    text: parsed.data.text,
  });
  return NextResponse.json({ reply });
}
