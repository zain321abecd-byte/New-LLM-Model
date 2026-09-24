import type { Priority } from "@/lib/types";

/**
 * Lead qualification.
 *
 * The score is computed here, in code, from facts about the lead plus a few
 * judgements the agent makes (is the industry a fit, are there growth
 * signals). Keeping the arithmetic out of the model makes scores consistent
 * across runs and explainable: score_breakdown records every point awarded.
 */
export interface ScoreInput {
  website?: string | null;
  contact_name?: string | null;
  job_title?: string | null;
  email?: string | null;
  email_confidence?: number | null;
  phone?: string | null;
  linkedin_url?: string | null;
  company_size?: string | null;
  /** Agent judgement: does the company sit in the industry the user targets? */
  industry_match?: boolean;
  /** Agent judgement: hiring, new locations, funding, recent launches, etc. */
  growth_signals?: string[];
  /** Agent judgement: website looks live and maintained (not parked/abandoned). */
  active_business?: boolean;
}

const DECISION_MAKER = /\b(owner|founder|co-?founder|ceo|chief|president|principal|partner|director|head of|vp|vice president|managing|gm|general manager)\b/i;
const FREE_MAIL = /@(gmail|yahoo|hotmail|outlook|aol|icloud|proton(mail)?|live|msn)\./i;

export function scoreLead(input: ScoreInput): { score: number; priority: Priority; breakdown: Record<string, number> } {
  const b: Record<string, number> = {};

  if (input.active_business ?? !!input.website) b.active_business = 15;
  if (input.industry_match) b.relevant_industry = 20;
  if (input.growth_signals && input.growth_signals.length > 0) b.growth_signals = Math.min(15, 8 + input.growth_signals.length * 3);

  if (input.contact_name) b.named_contact = 10;
  if (input.job_title && DECISION_MAKER.test(input.job_title)) b.decision_maker = 15;

  if (input.email) {
    b.email = FREE_MAIL.test(input.email) ? 5 : 10;
    if ((input.email_confidence ?? 0) >= 80) b.email_verified = 5;
  }
  if (input.phone) b.phone = 5;
  if (input.linkedin_url) b.linkedin = 5;

  const score = Math.min(100, Object.values(b).reduce((s, n) => s + n, 0));
  return { score, priority: priorityFor(score), breakdown: b };
}

export function priorityFor(score: number): Priority {
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/** One lead per company+person. Email wins; otherwise domain + contact name. */
export function dedupeKey(l: { email?: string | null; domain?: string | null; company_name: string; contact_name?: string | null }): string {
  if (l.email) return `e:${l.email.trim().toLowerCase()}`;
  const base = l.domain ? `d:${l.domain}` : `c:${l.company_name.trim().toLowerCase().replace(/\s+/g, " ")}`;
  return l.contact_name ? `${base}|${l.contact_name.trim().toLowerCase()}` : base;
}
