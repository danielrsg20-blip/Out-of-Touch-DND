create extension if not exists pgcrypto;

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  host_player_id text not null,
  started boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id text not null,
  player_name text not null,
  user_id uuid,
  character_id text,
  joined_at timestamptz not null default now(),
  unique (session_id, player_id)
);

create table if not exists public.session_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  version bigint not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (session_id, version)
);

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  sequence bigint generated always as identity,
  event_type text not null,
  actor_player_id text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (session_id, sequence)
);

create index if not exists idx_game_events_session_sequence on public.game_events (session_id, sequence);
create index if not exists idx_game_events_type on public.game_events (event_type);
create index if not exists idx_session_members_session on public.session_members (session_id);

alter table public.game_sessions enable row level security;
alter table public.session_members enable row level security;
alter table public.game_events enable row level security;
alter table public.session_snapshots enable row level security;

drop policy if exists sessions_select_member on public.game_sessions;
create policy sessions_select_member
  on public.game_sessions
  for select
  using (
    exists (
      select 1
      from public.session_members m
      where m.session_id = game_sessions.id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists sessions_insert_owner on public.game_sessions;
create policy sessions_insert_owner
  on public.game_sessions
  for insert
  with check (true);

drop policy if exists sessions_update_owner on public.game_sessions;
create policy sessions_update_owner
  on public.game_sessions
  for update
  using (true)
  with check (true);

drop policy if exists members_select_member on public.session_members;
create policy members_select_member
  on public.session_members
  for select
  using (true);

drop policy if exists members_insert_self on public.session_members;
create policy members_insert_self
  on public.session_members
  for insert
  with check (true);

drop policy if exists events_select_member on public.game_events;
create policy events_select_member
  on public.game_events
  for select
  using (true);

drop policy if exists snapshots_select_member on public.session_snapshots;
create policy snapshots_select_member
  on public.session_snapshots
  for select
  using (
    exists (
      select 1
      from public.session_members m
      where m.session_id = session_snapshots.session_id
        and m.user_id = auth.uid()
    )
  );

do $$
begin
  begin
    alter publication supabase_realtime add table public.game_events;
  exception
    when duplicate_object then
      null;
  end;
end $$;