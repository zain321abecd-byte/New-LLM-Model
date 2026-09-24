import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Fixed-window rate limit backed by Postgres (see rate_limit_hit in the
 * schema), so it holds across serverless instances without Redis.
 * Fails open if the database call itself errors: a limiter outage should not
 * take the product down, and every expensive path has its own hard caps.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("rate_limit_hit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[ratelimit]", error.message);
    return true;
  }
  return data === true;
}

export const LIMITS = {
  whatsappCommand: { limit: 20, window: 600 }, // per phone
  webCommand: { limit: 30, window: 600 }, // per user
  export: { limit: 10, window: 60 }, // per user
  linkAttempt: { limit: 5, window: 3600 }, // per phone
  toolCall: { limit: 400, window: 86400 }, // external API calls per workspace per day
} as const;
