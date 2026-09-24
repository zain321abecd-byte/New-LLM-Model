-- ============================================================================
-- AI SDR WhatsApp Agent — complete schema.
--
-- Run once in the Supabase SQL editor of a fresh project (it is idempotent
-- enough to re-run, but it is written for a clean database).
--
-- Tenancy: every business row belongs to a workspace. Dashboard users reach
-- rows through RLS (membership in the workspace). The WhatsApp webhook and the
-- agent run with the service role and scope every query by workspace_id in
-- code (lib/db.ts), because a webhook request has no Supabase session.
-- ============================================================================

create extension if not exists pgcrypto;

-- ─── Workspaces ────────────────────────────────────────────────────────────

create table if not exists public.workspaces (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  owner_id           uuid not null references auth.users(id) on delete cascade,
  -- What this workspace sells. The agent writes every outreach message from
  -- these, so an empty profile produces generic copy.
  company_name       text,
  offering           text,
  value_proposition  text,
  target_customer    text,
  sender_name        text,
  sender_email       text,
  -- Hard caps the send path enforces regardless of what the agent asks for.
  daily_email_limit    int not null default 50  check (daily_email_limit between 0 and 2000),
  daily_whatsapp_limit int not null default 20  check (daily_whatsapp_limit between 0 and 1000),
  plan               text not null default 'free',
  created_at         timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members(user_id);

-- security definer so RLS policies can call it without recursing into the
-- workspace_members policy.
create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = auth.uid()
  );
$$;

-- Every new account gets its own workspace.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare ws_id uuid;
begin
  insert into public.workspaces (name, owner_id, sender_email)
  values (coalesce(split_part(new.email, '@', 1), 'My') || '''s workspace', new.id, new.email)
  returning id into ws_id;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'owner');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Campaigns ─────────────────────────────────────────────────────────────

create table if not exists public.campaigns (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  campaign_name     text not null,
  target_audience   text,
  message_template  text,
  channel           text not null default 'email' check (channel in ('email', 'whatsapp')),
  status            text not null default 'active' check (status in ('active', 'paused', 'completed')),
  -- Maintained by triggers below; never written by application code.
  total_leads       int not null default 0,
  sent_count        int not null default 0,
  reply_count       int not null default 0,
  created_at        timestamptz not null default now(),
  unique (workspace_id, campaign_name)
);

-- ─── Leads ─────────────────────────────────────────────────────────────────

create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  campaign_id       uuid references public.campaigns(id) on delete set null,
  company_name      text not null,
  contact_name      text,
  job_title         text,
  email             text,
  email_confidence  int check (email_confidence between 0 and 100),
  phone             text,
  -- Digits only, for matching inbound WhatsApp numbers against free-form phones.
  phone_digits      text generated always as (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored,
  website           text,
  domain            text,
  industry          text,
  country           text,
  city              text,
  linkedin_url      text,
  company_size      text,
  relevance_reason  text,
  lead_score        int not null default 0 check (lead_score between 0 and 100),
  priority          text not null default 'low' check (priority in ('high', 'medium', 'low')),
  status            text not null default 'new'
                    check (status in ('new', 'contacted', 'replied', 'qualified', 'converted', 'lost', 'unsubscribed')),
  source            text,
  -- WhatsApp Business policy: a business may only message people who opted in.
  -- The send path refuses WhatsApp outreach to any lead where this is false.
  whatsapp_opt_in   boolean not null default false,
  notes             text,
  score_breakdown   jsonb not null default '{}'::jsonb,
  -- One row per company+person per workspace; see lib/scoring.ts dedupeKey().
  dedupe_key        text not null,
  last_contacted_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (workspace_id, dedupe_key)
);
create index if not exists leads_ws_status_idx   on public.leads(workspace_id, status);
create index if not exists leads_ws_priority_idx on public.leads(workspace_id, priority);
create index if not exists leads_ws_created_idx  on public.leads(workspace_id, created_at desc);
create index if not exists leads_ws_campaign_idx on public.leads(workspace_id, campaign_id);
create index if not exists leads_phone_idx       on public.leads(right(phone_digits, 9)) where phone_digits is not null;

-- ─── Messages ──────────────────────────────────────────────────────────────

create table if not exists public.messages (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  lead_id             uuid not null references public.leads(id) on delete cascade,
  campaign_id         uuid references public.campaigns(id) on delete set null,
  message_type        text not null check (message_type in ('email', 'whatsapp')),
  direction           text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  sequence_step       int not null default 0,            -- 0 = first touch, 1+ = follow-ups
  subject             text,
  message_content     text not null,
  sent_status         text not null default 'draft'
                      check (sent_status in ('draft', 'queued', 'sent', 'failed', 'skipped', 'received')),
  provider_message_id text,
  error               text,
  "timestamp"         timestamptz not null default now(),
  sent_at             timestamptz
);
create index if not exists messages_ws_lead_idx   on public.messages(workspace_id, lead_id, "timestamp" desc);
create index if not exists messages_ws_status_idx on public.messages(workspace_id, sent_status);
create index if not exists messages_provider_idx  on public.messages(provider_message_id) where provider_message_id is not null;

-- ─── Suppression (unsubscribes / do-not-contact) ───────────────────────────

create table if not exists public.suppressions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  value        text not null,       -- lower-cased email or E.164 digits
  reason       text not null default 'unsubscribed',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, value)
);

-- ─── WhatsApp: who may command which workspace ─────────────────────────────

create table if not exists public.whatsapp_links (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  phone                text not null unique,          -- E.164 digits, no '+'
  link_code_hash       text,
  link_code_expires_at timestamptz,
  verified_at          timestamptz,
  created_at           timestamptz not null default now()
);

-- ─── Agent state (service role only) ───────────────────────────────────────

create table if not exists public.agent_threads (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,
  channel       text not null check (channel in ('whatsapp', 'web')),
  external_id   text not null,                 -- phone for WhatsApp, user id for web
  history       jsonb not null default '[]'::jsonb,  -- recent text turns only
  last_lead_ids uuid[] not null default '{}',  -- resolves "these leads"
  last_inbound_at timestamptz,
  updated_at    timestamptz not null default now(),
  unique (workspace_id, channel, external_id)
);

create table if not exists public.pending_actions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id    uuid not null references public.agent_threads(id) on delete cascade,
  kind         text not null check (kind in ('send_messages')),
  payload      jsonb not null,
  summary      text not null,
  status       text not null default 'pending' check (status in ('pending', 'executed', 'cancelled', 'expired')),
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
create index if not exists pending_actions_thread_idx on public.pending_actions(thread_id, status);

create table if not exists public.webhook_events (
  id          text primary key,                -- WhatsApp message id
  received_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind         text not null,                  -- 'ai_tokens' | 'tool:<name>' | 'email_sent' | ...
  quantity     int not null default 1,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists usage_events_ws_idx on public.usage_events(workspace_id, created_at desc);

-- ─── Rate limiting ─────────────────────────────────────────────────────────

create table if not exists public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);

-- Fixed-window counter. Returns true when the hit is allowed. Atomic under
-- concurrency because the upsert takes a row lock.
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning count into v_count;
  -- Opportunistic cleanup keeps the table small without a cron.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_count <= p_limit;
end;
$$;
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;

-- ─── Counters & timestamps ─────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

create or replace function public.campaign_lead_counter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.campaign_id is not null then
    update public.campaigns set total_leads = greatest(total_leads - 1, 0) where id = old.campaign_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.campaign_id is not null then
    update public.campaigns set total_leads = total_leads + 1 where id = new.campaign_id;
  end if;
  return null;
end;
$$;
drop trigger if exists leads_campaign_count on public.leads;
create trigger leads_campaign_count
  after insert or delete or update of campaign_id on public.leads
  for each row execute function public.campaign_lead_counter();

-- sent_count counts each outbound message once, on its transition to 'sent'.
-- reply_count counts inbound messages.
create or replace function public.campaign_message_counter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.campaign_id is null then return null; end if;
  if new.direction = 'outbound' and new.sent_status = 'sent'
     and (tg_op = 'INSERT' or old.sent_status is distinct from 'sent') then
    update public.campaigns set sent_count = sent_count + 1 where id = new.campaign_id;
  elsif new.direction = 'inbound' and tg_op = 'INSERT' then
    update public.campaigns set reply_count = reply_count + 1 where id = new.campaign_id;
  end if;
  return null;
end;
$$;
drop trigger if exists messages_campaign_count on public.messages;
create trigger messages_campaign_count
  after insert or update of sent_status on public.messages
  for each row execute function public.campaign_message_counter();

-- ─── Row Level Security ────────────────────────────────────────────────────

alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.campaigns         enable row level security;
alter table public.leads             enable row level security;
alter table public.messages          enable row level security;
alter table public.suppressions      enable row level security;
alter table public.whatsapp_links    enable row level security;
alter table public.agent_threads     enable row level security;
alter table public.pending_actions   enable row level security;
alter table public.webhook_events    enable row level security;
alter table public.usage_events      enable row level security;
alter table public.rate_limits       enable row level security;

drop policy if exists ws_select on public.workspaces;
create policy ws_select on public.workspaces for select using (public.is_workspace_member(id));
drop policy if exists ws_update on public.workspaces;
create policy ws_update on public.workspaces for update
  using (exists (select 1 from public.workspace_members m
                 where m.workspace_id = id and m.user_id = auth.uid() and m.role in ('owner', 'admin')));

drop policy if exists wm_select on public.workspace_members;
create policy wm_select on public.workspace_members for select using (public.is_workspace_member(workspace_id));

-- Plain workspace-scoped CRUD for the business tables.
do $$
declare t text;
begin
  foreach t in array array['campaigns', 'leads', 'messages', 'suppressions'] loop
    execute format('drop policy if exists %1$s_member_all on public.%1$s', t);
    execute format(
      'create policy %1$s_member_all on public.%1$s for all
         using (public.is_workspace_member(workspace_id))
         with check (public.is_workspace_member(workspace_id))', t);
  end loop;
end $$;

-- Users see their own WhatsApp link; creating/verifying it goes through the
-- server (service role) so the code hash is never exposed to the browser.
drop policy if exists wl_select on public.whatsapp_links;
create policy wl_select on public.whatsapp_links for select using (user_id = auth.uid());

drop policy if exists usage_select on public.usage_events;
create policy usage_select on public.usage_events for select using (public.is_workspace_member(workspace_id));

-- agent_threads, pending_actions, webhook_events, rate_limits: no policies,
-- so only the service role can touch them.

-- ─── Dashboard stats ───────────────────────────────────────────────────────

create or replace view public.lead_stats with (security_invoker = true) as
select
  workspace_id,
  count(*)                                                    as total_leads,
  count(*) filter (where created_at > now() - interval '7 days') as new_leads,
  count(*) filter (where last_contacted_at is not null)       as contacted,
  count(*) filter (where status in ('replied', 'qualified', 'converted')) as replied,
  count(*) filter (where status = 'converted')                as converted,
  count(*) filter (where priority = 'high')                   as high_priority,
  count(*) filter (where priority = 'medium')                 as medium_priority,
  count(*) filter (where priority = 'low')                    as low_priority
from public.leads
group by workspace_id;
