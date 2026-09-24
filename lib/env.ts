import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once on first use.
 *
 * Only the Supabase URL/anon key are required to boot. Every integration is
 * optional: the agent only offers a tool when its provider is configured, so a
 * missing key degrades the agent rather than crashing it. See .env.example.
 */
const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const schema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3003"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  ANTHROPIC_API_KEY: optional,
  AGENT_MODEL: z.string().default("claude-opus-5"),
  AGENT_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),

  WHATSAPP_ACCESS_TOKEN: optional,
  WHATSAPP_PHONE_NUMBER_ID: optional,
  WHATSAPP_APP_SECRET: optional,
  WHATSAPP_VERIFY_TOKEN: optional,
  WHATSAPP_BUSINESS_NUMBER: optional, // shown to users when they link their phone
  WHATSAPP_GRAPH_VERSION: z.string().default("v23.0"),
  WHATSAPP_OUTREACH_TEMPLATE: optional, // approved template for first-touch lead messages
  WHATSAPP_NOTIFY_TEMPLATE: optional, // approved template for owner alerts outside 24h
  WHATSAPP_TEMPLATE_LANG: z.string().default("en_US"),

  SERPAPI_API_KEY: optional,
  GOOGLE_CSE_API_KEY: optional,
  GOOGLE_CSE_ID: optional,
  APOLLO_API_KEY: optional,
  HUNTER_API_KEY: optional,
  CLEARBIT_API_KEY: optional,

  RESEND_API_KEY: optional,
  EMAIL_FROM: optional, // e.g. "Sales <sales@yourdomain.com>" on a Resend-verified domain
  COMPANY_POSTAL_ADDRESS: optional, // CAN-SPAM requires a physical address in commercial email

  UNSUBSCRIBE_SECRET: optional,
  CRON_SECRET: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Which integrations are live. Booleans only — safe to show in the UI. */
export function integrations() {
  const e = env();
  return {
    ai: !!e.ANTHROPIC_API_KEY,
    whatsapp: !!(e.WHATSAPP_ACCESS_TOKEN && e.WHATSAPP_PHONE_NUMBER_ID && e.WHATSAPP_APP_SECRET && e.WHATSAPP_VERIFY_TOKEN),
    serpapi: !!e.SERPAPI_API_KEY,
    googleCse: !!(e.GOOGLE_CSE_API_KEY && e.GOOGLE_CSE_ID),
    apollo: !!e.APOLLO_API_KEY,
    hunter: !!e.HUNTER_API_KEY,
    clearbit: !!e.CLEARBIT_API_KEY,
    email: !!(e.RESEND_API_KEY && e.EMAIL_FROM && e.UNSUBSCRIBE_SECRET),
  };
}
