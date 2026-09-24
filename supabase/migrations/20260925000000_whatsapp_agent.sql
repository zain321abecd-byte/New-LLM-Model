-- WhatsApp Agents (WhatsApp → Settings → Agents → Add an agent).
-- The owner creates an agent chat in their own WhatsApp and pastes its
-- connection key into Theron; Theron polls the WhatsApp Agent API for their
-- messages and replies in that chat. One connection per workspace.
-- Both tables are service role only, like agent_threads.

create table if not exists public.whatsapp_agent_connections (
  workspace_id      uuid primary key references public.workspaces(id) on delete cascade,
  created_by        uuid references auth.users(id) on delete set null,
  api_key_enc       text not null,              -- AES-GCM, see lib/secret-box.ts
  key_hint          text not null,              -- last 4 characters, for display
  owner_participant text,                       -- first sender; the only one allowed to command
  next_offset       text,                       -- long-poll cursor from /updates
  enabled           boolean not null default true,
  last_polled_at    timestamptz,
  last_message_at   timestamptz,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.whatsapp_agent_connections enable row level security;

-- Full log of every message between users and the agent (WhatsApp and the
-- web console), for the Conversations page. agent_threads.history keeps only
-- recent turns: it is the model's short-term memory. This table keeps all.
create table if not exists public.agent_messages (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  thread_id     uuid not null references public.agent_threads(id) on delete cascade,
  role          text not null check (role in ('user', 'assistant')),
  text          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists agent_messages_thread_idx on public.agent_messages(thread_id, id desc);
alter table public.agent_messages enable row level security;

-- Backfill from the recent turns already stored on each thread, oldest first.
-- Their exact times are unknown, so they take the thread's last update time.
insert into public.agent_messages (workspace_id, thread_id, role, text, created_at)
select t.workspace_id, t.id, turn.value->>'role', turn.value->>'text', t.updated_at
from public.agent_threads t
cross join lateral jsonb_array_elements(t.history) with ordinality as turn(value, n)
where not exists (select 1 from public.agent_messages m where m.thread_id = t.id)
  and turn.value->>'role' in ('user', 'assistant')
  and coalesce(turn.value->>'text', '') <> ''
order by t.id, turn.n;
