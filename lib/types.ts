export const LEAD_STATUSES = ["new", "contacted", "replied", "qualified", "converted", "lost", "unsubscribed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type Channel = "email" | "whatsapp";

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  company_name: string | null;
  offering: string | null;
  value_proposition: string | null;
  target_customer: string | null;
  sender_name: string | null;
  sender_email: string | null;
  daily_email_limit: number;
  daily_whatsapp_limit: number;
  plan: string;
  created_at: string;
}

export interface Lead {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  company_name: string;
  contact_name: string | null;
  job_title: string | null;
  email: string | null;
  email_confidence: number | null;
  phone: string | null;
  website: string | null;
  domain: string | null;
  industry: string | null;
  country: string | null;
  city: string | null;
  linkedin_url: string | null;
  company_size: string | null;
  relevance_reason: string | null;
  lead_score: number;
  priority: Priority;
  status: LeadStatus;
  source: string | null;
  whatsapp_opt_in: boolean;
  notes: string | null;
  score_breakdown: Record<string, number>;
  dedupe_key: string;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  workspace_id: string;
  lead_id: string;
  campaign_id: string | null;
  message_type: Channel;
  direction: "outbound" | "inbound";
  sequence_step: number;
  subject: string | null;
  message_content: string;
  sent_status: "draft" | "queued" | "sent" | "failed" | "skipped" | "received";
  provider_message_id: string | null;
  error: string | null;
  timestamp: string;
  sent_at: string | null;
}

export interface Campaign {
  id: string;
  workspace_id: string;
  campaign_name: string;
  target_audience: string | null;
  message_template: string | null;
  channel: Channel;
  status: "active" | "paused" | "completed";
  total_leads: number;
  sent_count: number;
  reply_count: number;
  created_at: string;
}

export interface AgentThread {
  id: string;
  workspace_id: string;
  user_id: string | null;
  channel: "whatsapp" | "web";
  external_id: string;
  history: { role: "user" | "assistant"; text: string }[];
  last_lead_ids: string[];
  last_inbound_at: string | null;
}
