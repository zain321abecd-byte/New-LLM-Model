# AI SDR WhatsApp Agent

An AI sales employee you command over WhatsApp. You send a message like *"Find 50 dental clinics in Texas"*. The agent then:

1. finds the businesses and their decision makers,
2. enriches and scores each lead,
3. saves the leads to the CRM,
4. writes personalised outreach,
5. sends it after you reply **YES**.

A web dashboard gives you the CRM, campaigns, CSV export and a console to the same agent.

Stack: Next.js 15 (App Router) + Tailwind 4, Supabase (Postgres + Auth), Claude (`claude-opus-5`) via the Anthropic SDK, Meta WhatsApp Cloud API, Resend, Vercel.

## How it works

```
WhatsApp ──► /api/whatsapp/webhook ─┐                 ┌─► SerpAPI (Google, Google Maps) / Google CSE / Claude web search
                (signature-checked) ├─► handleCommand ─► agent loop (Claude + tools) ─┼─► Apollo (people, companies) · Hunter (emails) · Clearbit
Dashboard ──► /api/agent ───────────┘        │                  ▲                     ├─► Website extraction (SSRF-guarded fetch)
                                              │                  │                     └─► Supabase: leads, campaigns, messages
                              "YES" / "NO" ───┘ (matched in code: executes or cancels a staged send)
```

- **The agent brain** (`lib/agent/agent.ts`): a tool-use loop. Claude picks the tools for each command. Tools only appear when their provider is configured, so the agent works with whatever keys you have.
- **Tools** (`lib/agent/tools.ts`):

  | Spec tool | Implemented as |
  |---|---|
  | Web Search | `search_web` (SerpAPI → Google CSE), or Claude's own web search when neither key is set |
  | Lead Extraction | `extract_leads_from_websites`, `search_local_businesses` (Google Maps) |
  | Email Finder | `find_email` (Hunter) |
  | Company Research | `research_company` (Apollo → Clearbit → website), `search_people_database` (Apollo) |
  | Lead Database | `save_leads`, `query_leads`, `update_lead`, `create_campaign`, `get_pipeline_stats`, `find_follow_up_candidates` |
  | Email Sending / WhatsApp Messaging | `save_outreach_drafts` + `prepare_send`, then your **YES** |

- **Qualification** (`lib/scoring.ts`): the score (0–100) is computed in code from facts plus the agent's judgements: industry fit, active business, growth signals, decision maker found, verified email, phone, LinkedIn. It maps to priority: ≥65 high, ≥40 medium, otherwise low. Each lead page shows the breakdown.
- **Sending is always human-confirmed.** The model can only *stage* a send. The YES/NO reply is matched in code before the model runs, so a website or lead reply that says "send now" can't trigger a send.
- **Compliance is enforced in code** (`lib/agent/send.ts`):
  - unsubscribe links and a suppression list;
  - the one-click `List-Unsubscribe` header and a postal address in every email (CAN-SPAM, Gmail/Yahoo bulk-sender rules);
  - WhatsApp only to leads who opted in (Meta policy);
  - approved templates outside the 24-hour window;
  - daily send caps per workspace.
- **Replies:** when a lead messages the business number, the agent logs it, marks the lead *replied* and alerts you on WhatsApp. "STOP" opts the lead out.

## Setup

1. **Supabase.** Create a project, then apply the schema in [`supabase/migrations/`](supabase/migrations) with the Supabase CLI:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR-PROJECT-REF   # asks for the database password
   npx supabase db push
   ```

   Or paste the migration file into the SQL editor. Under Auth → URL configuration, set the site URL and add `https://YOUR-DOMAIN/auth/callback` as a redirect URL.
2. **Env.** Copy `.env.example` to `.env.local` and fill in the values. Only the Supabase vars and `ANTHROPIC_API_KEY` are required. Every other integration is optional.
   To use an Anthropic-compatible proxy, set `ANTHROPIC_BASE_URL`, then run `npm run smoke:ai` to see which API features it supports.
3. **Run:** `npm install && npm run dev` (port 3003). Sign up, then fill in **Settings → Business profile**. The agent writes outreach from it.
4. **WhatsApp (Meta):**
   - Create an app with the WhatsApp product and add a phone number.
   - Create a System User token with `whatsapp_business_messaging`.
   - Set the webhook URL to `https://YOUR-DOMAIN/api/whatsapp/webhook`, with verify token = `WHATSAPP_VERIFY_TOKEN`, and subscribe to `messages`.
   - Then in the dashboard, go to **Settings → WhatsApp**, enter your number, and send `LINK 123456` to the business number.
5. **Templates (optional).** To message opted-in leads for the first time, or to alert you outside the 24-hour window, get two templates approved in WhatsApp Manager:
   - an outreach template with body params `{{1}}` = first name, `{{2}}` = message;
   - a utility template with `{{1}}` = alert text.

   Put their names in `WHATSAPP_OUTREACH_TEMPLATE` / `WHATSAPP_NOTIFY_TEMPLATE`.
6. **Email.** Verify a sending domain in Resend, then set `RESEND_API_KEY`, `EMAIL_FROM`, `COMPANY_POSTAL_ADDRESS` and `UNSUBSCRIBE_SECRET`. Use a separate domain from your main one for cold outreach.
7. **Deploy.** Import this repo into a new Vercel project and add the env vars. `vercel.json` schedules the daily follow-up nudge (`CRON_SECRET` required).

## Security

- Every API key lives in server env vars. `lib/env.ts` validates them, and each server module imports `server-only`. The browser sees only the Supabase anon key.
- **Dashboard data** goes through the user's session, so Row Level Security scopes it to their workspace. **Webhook and agent data** use the service role through `lib/db.ts`, where every query filters by `workspace_id`.
- **Webhook checks:** each call is HMAC-verified (`X-Hub-Signature-256`) and idempotent. Deduplication is by message id.
- **Rate limits** are Postgres-backed, so they hold across serverless instances. They apply per WhatsApp number, per dashboard user, per export, per link attempt, and to external API calls (per workspace, daily).
- **Page fetching is SSRF-guarded:** http(s) only, no private or loopback addresses, and every redirect hop is re-checked.
- **Other hardening:**
  - CSV export neutralises spreadsheet formulas;
  - link codes are hashed and expire;
  - redirect targets are same-site only;
  - a strict CSP and security headers are set.

## Notes on the spec

- **Bing Search API** was retired by Microsoft in August 2025, so it's not included.
- **Clearbit** no longer sells standalone API keys (it's part of HubSpot). The adapter is there for legacy keys.
- **n8n / LangGraph** weren't needed. The agent loop is a small, typed tool-use loop on the Anthropic SDK, which keeps the whole flow in one deployable app. The follow-up cron covers the scheduling need.
- **Apollo's people search** returns contact details only for records your plan has unlocked. The agent fills gaps with Hunter.
