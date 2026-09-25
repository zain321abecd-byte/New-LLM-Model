import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { workerToken } from "@/lib/agent/whatsapp-agent-worker";

function matches(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const given = Buffer.from(authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Scheduled endpoints take `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends). */
export function isCronAuthorized(authorization: string | null): boolean {
  return matches(authorization, env().CRON_SECRET);
}

/** The WhatsApp agent poll also accepts this server's own background worker. */
export function isPollAuthorized(authorization: string | null): boolean {
  return isCronAuthorized(authorization) || matches(authorization, workerToken());
}
