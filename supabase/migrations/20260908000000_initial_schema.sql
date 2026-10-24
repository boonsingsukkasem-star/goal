-- Goal initial database baseline
-- Generated from the unreleased migration history on 2026-09-08.
-- Apply only to a new Supabase project or an empty local database.
-- Once applied to a shared environment, keep this file immutable and add forward migrations.

-- Remote resets recreate user-owned objects and must not rely on dashboard defaults for
-- Data API schema access. Table and function privileges remain explicitly scoped below.
grant usage on schema public to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260816000000_production_foundation.sql
-- -----------------------------------------------------------------------------
create schema if not exists app_private;

revoke all on schema app_private from public;
revoke all on schema app_private from anon;
revoke all on schema app_private from authenticated;

alter default privileges in schema app_private revoke execute on functions from public;
alter default privileges in schema app_private revoke all on tables from public;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

revoke all on function app_private.set_updated_at() from public;
revoke all on function app_private.set_updated_at() from anon;
revoke all on function app_private.set_updated_at() from authenticated;
grant execute on function app_private.set_updated_at() to service_role;

comment on schema app_private is
  'Server-only functions and tables. Never expose this schema through the Data API.';
-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260816010000_vercel_async_foundation.sql
-- -----------------------------------------------------------------------------
create type app_private.execution_status as enum (
  'pending',
  'running',
  'succeeded',
  'failed',
  'dead_lettered'
);

create table app_private.outbox_events (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic ~ '^[A-Za-z0-9_-]+$'),
  event_key text not null check (length(event_key) between 1 and 256),
  schema_version integer not null default 1 check (schema_version > 0),
  payload jsonb not null,
  occurred_at timestamptz not null default timezone('utc', now()),
  available_at timestamptz not null default timezone('utc', now()),
  published_at timestamptz,
  queue_message_id text,
  publish_attempts integer not null default 0 check (publish_attempts >= 0),
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (topic, event_key, schema_version)
);

create index outbox_events_pending_idx
  on app_private.outbox_events (available_at, created_at)
  where published_at is null;

create table app_private.processed_events (
  consumer_name text not null check (length(consumer_name) between 1 and 128),
  message_id text not null check (length(message_id) between 1 and 256),
  idempotency_key text not null check (length(idempotency_key) between 1 and 256),
  processed_at timestamptz not null default timezone('utc', now()),
  result jsonb,
  primary key (consumer_name, message_id),
  unique (consumer_name, idempotency_key)
);

create table app_private.job_executions (
  id uuid primary key default gen_random_uuid(),
  outbox_event_id uuid references app_private.outbox_events (id) on delete set null,
  topic text not null check (topic ~ '^[A-Za-z0-9_-]+$'),
  consumer_name text not null check (length(consumer_name) between 1 and 128),
  message_id text not null check (length(message_id) between 1 and 256),
  idempotency_key text not null check (length(idempotency_key) between 1 and 256),
  status app_private.execution_status not null default 'pending',
  delivery_count integer not null default 1 check (delivery_count > 0),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (consumer_name, message_id, delivery_count)
);

create index job_executions_status_idx
  on app_private.job_executions (status, created_at);

create table app_private.dead_letter_events (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic ~ '^[A-Za-z0-9_-]+$'),
  consumer_name text not null check (length(consumer_name) between 1 and 128),
  message_id text not null check (length(message_id) between 1 and 256),
  idempotency_key text not null check (length(idempotency_key) between 1 and 256),
  payload jsonb not null,
  delivery_count integer not null check (delivery_count > 0),
  error_code text,
  error_message text not null,
  failed_at timestamptz not null default timezone('utc', now()),
  replayed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (consumer_name, message_id)
);

create table app_private.cron_executions (
  id uuid primary key default gen_random_uuid(),
  cron_name text not null check (length(cron_name) between 1 and 128),
  scheduled_for timestamptz not null,
  status app_private.execution_status not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (cron_name, scheduled_for)
);

create table app_private.execution_locks (
  lock_key text primary key check (length(lock_key) between 1 and 256),
  owner_token uuid not null,
  acquired_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now()),
  check (expires_at > acquired_at)
);

create trigger set_outbox_events_updated_at
before update on app_private.outbox_events
for each row execute function app_private.set_updated_at();

create trigger set_job_executions_updated_at
before update on app_private.job_executions
for each row execute function app_private.set_updated_at();

create trigger set_cron_executions_updated_at
before update on app_private.cron_executions
for each row execute function app_private.set_updated_at();

create trigger set_execution_locks_updated_at
before update on app_private.execution_locks
for each row execute function app_private.set_updated_at();

create or replace function app_private.try_acquire_execution_lock(
  p_lock_key text,
  p_owner_token uuid,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  acquired boolean;
begin
  if length(p_lock_key) not between 1 and 256 then
    raise exception 'lock key must contain between 1 and 256 characters';
  end if;

  if p_ttl_seconds not between 1 and 3600 then
    raise exception 'lock TTL must contain between 1 and 3600 seconds';
  end if;

  insert into app_private.execution_locks (
    lock_key,
    owner_token,
    acquired_at,
    expires_at
  )
  values (
    p_lock_key,
    p_owner_token,
    timezone('utc', now()),
    timezone('utc', now()) + (p_ttl_seconds * interval '1 second')
  )
  on conflict (lock_key) do update
  set
    owner_token = excluded.owner_token,
    acquired_at = excluded.acquired_at,
    expires_at = excluded.expires_at
  where
    app_private.execution_locks.expires_at <= timezone('utc', now())
    or app_private.execution_locks.owner_token = excluded.owner_token
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;

create or replace function app_private.release_execution_lock(
  p_lock_key text,
  p_owner_token uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with released as (
    delete from app_private.execution_locks
    where lock_key = p_lock_key and owner_token = p_owner_token
    returning 1
  )
  select exists(select 1 from released);
$$;

revoke all on all tables in schema app_private from public, anon, authenticated;
revoke all on all sequences in schema app_private from public, anon, authenticated;
revoke all on function app_private.try_acquire_execution_lock(text, uuid, integer)
  from public, anon, authenticated;
revoke all on function app_private.release_execution_lock(text, uuid)
  from public, anon, authenticated;

grant usage on schema app_private to service_role;
grant select, insert, update, delete on all tables in schema app_private to service_role;
grant usage, select on all sequences in schema app_private to service_role;
grant execute on function app_private.try_acquire_execution_lock(text, uuid, integer)
  to service_role;
grant execute on function app_private.release_execution_lock(text, uuid)
  to service_role;

alter default privileges in schema app_private
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema app_private
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema app_private
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema app_private
  grant usage, select on sequences to service_role;

comment on table app_private.outbox_events is
  'Transactional outbox. Domain writes and event creation must commit in the same database transaction.';
comment on table app_private.processed_events is
  'Consumer inbox used to make at-least-once Vercel Queue delivery idempotent.';
comment on table app_private.dead_letter_events is
  'Application-level dead-letter evidence for messages acknowledged after terminal failure.';
comment on table app_private.execution_locks is
  'Short database-backed leases for Cron and singleton dispatch operations; never replace with Runtime Cache.';
-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260816020000_authentication.sql
-- -----------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  locale text not null default 'th-TH' check (char_length(locale) between 2 and 16),
  timezone text not null default 'Asia/Bangkok' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.profiles is
  'User-editable profile data. Authentication identifiers remain in auth.users.';

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function app_private.set_updated_at();

create or replace function app_private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_name text;
  candidate_avatar text;
begin
  candidate_name := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  if candidate_name is not null and char_length(candidate_name) > 80 then
    candidate_name := left(candidate_name, 80);
  end if;

  candidate_avatar := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture',
    ''
  )), '');

  if candidate_avatar is not null and candidate_avatar !~ '^https://' then
    candidate_avatar := null;
  end if;

  insert into public.profiles (user_id, display_name, avatar_url)
  values (new.id, candidate_name, candidate_avatar)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function app_private.create_profile_for_new_user() from public;
revoke all on function app_private.create_profile_for_new_user() from anon;
revoke all on function app_private.create_profile_for_new_user() from authenticated;
grant execute on function app_private.create_profile_for_new_user() to service_role;

create trigger auth_user_create_profile
after insert on auth.users
for each row execute function app_private.create_profile_for_new_user();

create table public.revoked_auth_sessions (
  user_id uuid primary key,
  expires_at timestamptz not null,
  revoked_at timestamptz not null default timezone('utc', now())
);

comment on table public.revoked_auth_sessions is
  'Server-only denylist that invalidates JWTs immediately after account deletion.';

alter table public.revoked_auth_sessions enable row level security;
alter table public.revoked_auth_sessions force row level security;
revoke all on table public.revoked_auth_sessions from anon;
revoke all on table public.revoked_auth_sessions from authenticated;
grant all on table public.revoked_auth_sessions to service_role;

create table public.account_deletion_audit (
  request_id uuid primary key default gen_random_uuid(),
  user_reference text not null check (char_length(user_reference) = 64),
  provider_revocation text not null check (
    provider_revocation in ('not_applicable', 'succeeded', 'unavailable', 'failed')
  ),
  requested_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

comment on table public.account_deletion_audit is
  'Minimal, pseudonymized deletion evidence retained under the published retention policy.';

alter table public.account_deletion_audit enable row level security;
alter table public.account_deletion_audit force row level security;
revoke all on table public.account_deletion_audit from anon;
revoke all on table public.account_deletion_audit from authenticated;
grant all on table public.account_deletion_audit to service_role;

create or replace function public.delete_authenticated_user(
  target_user_id uuid,
  token_expires_at timestamptz,
  hashed_user_reference text,
  revocation_result text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  deletion_request_id uuid;
begin
  if char_length(hashed_user_reference) <> 64 then
    raise exception 'Invalid user reference';
  end if;
  if revocation_result not in ('not_applicable', 'succeeded', 'unavailable', 'failed') then
    raise exception 'Invalid provider revocation result';
  end if;

  insert into public.account_deletion_audit (user_reference, provider_revocation)
  values (hashed_user_reference, revocation_result)
  returning request_id into deletion_request_id;

  insert into public.revoked_auth_sessions (user_id, expires_at)
  values (target_user_id, token_expires_at)
  on conflict (user_id) do update
  set expires_at = greatest(public.revoked_auth_sessions.expires_at, excluded.expires_at),
      revoked_at = timezone('utc', now());

  delete from auth.users where id = target_user_id;
  if not found then
    raise exception 'User not found';
  end if;

  update public.account_deletion_audit
  set completed_at = timezone('utc', now())
  where request_id = deletion_request_id;

  return deletion_request_id;
end;
$$;

revoke all on function public.delete_authenticated_user(uuid, timestamptz, text, text) from public;
revoke all on function public.delete_authenticated_user(uuid, timestamptz, text, text) from anon;
revoke all on function public.delete_authenticated_user(uuid, timestamptz, text, text) from authenticated;
grant execute on function public.delete_authenticated_user(uuid, timestamptz, text, text) to service_role;

create or replace function public.run_auth_retention(p_scheduled_for timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_id uuid;
  revoked_count integer;
  audit_count integer;
begin
  insert into app_private.cron_executions (
    cron_name,
    scheduled_for,
    status,
    started_at
  )
  values (
    'auth-retention',
    p_scheduled_for,
    'running',
    timezone('utc', now())
  )
  on conflict (cron_name, scheduled_for) do update
  set status = 'running',
      started_at = timezone('utc', now()),
      completed_at = null,
      error_message = null
  where app_private.cron_executions.status = 'failed'
  returning id into execution_id;

  if execution_id is null then
    return jsonb_build_object('status', 'duplicate', 'revokedSessionsPurged', 0, 'auditRowsPurged', 0);
  end if;

  delete from public.revoked_auth_sessions
  where expires_at < timezone('utc', now()) - interval '1 day';
  get diagnostics revoked_count = row_count;

  delete from public.account_deletion_audit
  where requested_at < timezone('utc', now()) - interval '180 days';
  get diagnostics audit_count = row_count;

  update app_private.cron_executions
  set status = 'succeeded', completed_at = timezone('utc', now())
  where id = execution_id;

  return jsonb_build_object(
    'status', 'succeeded',
    'revokedSessionsPurged', revoked_count,
    'auditRowsPurged', audit_count
  );
exception
  when others then
    if execution_id is not null then
      update app_private.cron_executions
      set status = 'failed', completed_at = timezone('utc', now()), error_message = sqlerrm
      where id = execution_id;
    end if;
    return jsonb_build_object(
      'status', 'failed',
      'error', sqlerrm,
      'revokedSessionsPurged', 0,
      'auditRowsPurged', 0
    );
end;
$$;

revoke all on function public.run_auth_retention(timestamptz) from public;
revoke all on function public.run_auth_retention(timestamptz) from anon;
revoke all on function public.run_auth_retention(timestamptz) from authenticated;
grant execute on function public.run_auth_retention(timestamptz) to service_role;
-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260816030000_core_football.sql
-- -----------------------------------------------------------------------------
create table public.football_leagues (
  sportmonks_id bigint primary key check (sportmonks_id > 0),
  country_id bigint,
  name text not null check (char_length(name) between 1 and 160),
  short_code text check (short_code is null or char_length(short_code) <= 16),
  image_url text check (image_url is null or image_url ~ '^https://'),
  type text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.football_seasons (
  sportmonks_id bigint primary key check (sportmonks_id > 0),
  league_id bigint not null references public.football_leagues(sportmonks_id),
  name text not null check (char_length(name) between 1 and 80),
  is_current boolean not null default false,
  finished boolean not null default false,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.football_teams (
  sportmonks_id bigint primary key check (sportmonks_id > 0),
  country_id bigint,
  name text not null check (char_length(name) between 1 and 160),
  short_code text check (short_code is null or char_length(short_code) <= 16),
  image_url text check (image_url is null or image_url ~ '^https://'),
  gender text,
  team_type text,
  founded smallint check (founded is null or founded between 1800 and 2200),
  placeholder boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.football_players (
  sportmonks_id bigint primary key check (sportmonks_id > 0),
  country_id bigint,
  display_name text not null check (char_length(display_name) between 1 and 160),
  image_url text check (image_url is null or image_url ~ '^https://'),
  date_of_birth date,
  gender text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.football_fixtures (
  sportmonks_id bigint primary key check (sportmonks_id > 0),
  league_id bigint not null references public.football_leagues(sportmonks_id),
  season_id bigint not null references public.football_seasons(sportmonks_id),
  stage_id bigint,
  round_id bigint,
  group_id bigint,
  venue_id bigint,
  state_id bigint not null,
  state_name text,
  state_code text,
  name text not null check (char_length(name) between 1 and 240),
  starts_at timestamptz not null,
  length_minutes smallint check (length_minutes is null or length_minutes between 1 and 240),
  result_info text,
  placeholder boolean not null default false,
  is_live boolean not null default false,
  home_score smallint check (home_score is null or home_score >= 0),
  away_score smallint check (away_score is null or away_score >= 0),
  provider_last_processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index football_fixtures_starts_at_idx on public.football_fixtures (starts_at, sportmonks_id);
create index football_fixtures_live_idx on public.football_fixtures (starts_at) where is_live;
create index football_fixtures_league_idx on public.football_fixtures (league_id, starts_at);
create index football_fixtures_season_idx on public.football_fixtures (season_id, starts_at);

create table public.football_fixture_participants (
  fixture_id bigint not null references public.football_fixtures(sportmonks_id) on delete cascade,
  team_id bigint not null references public.football_teams(sportmonks_id),
  location text not null check (location in ('home', 'away')),
  winner boolean,
  position smallint,
  primary key (fixture_id, team_id),
  unique (fixture_id, location)
);

create index football_fixture_participants_team_idx
  on public.football_fixture_participants (team_id, fixture_id);

create table public.football_fixture_scores (
  sportmonks_id bigint primary key check (sportmonks_id > 0),
  fixture_id bigint not null references public.football_fixtures(sportmonks_id) on delete cascade,
  team_id bigint references public.football_teams(sportmonks_id),
  type_id bigint not null,
  description text not null,
  location text check (location is null or location in ('home', 'away')),
  goals smallint check (goals is null or goals >= 0)
);

create index football_fixture_scores_fixture_idx on public.football_fixture_scores (fixture_id);

create table public.football_fixture_events (
  sportmonks_id bigint primary key check (sportmonks_id > 0),
  fixture_id bigint not null references public.football_fixtures(sportmonks_id) on delete cascade,
  period_id bigint,
  team_id bigint references public.football_teams(sportmonks_id),
  player_id bigint references public.football_players(sportmonks_id),
  related_player_id bigint references public.football_players(sportmonks_id),
  type_id bigint not null,
  type_name text,
  type_code text,
  section text,
  minute smallint check (minute is null or minute between 0 and 240),
  extra_minute smallint check (extra_minute is null or extra_minute between 0 and 60),
  player_name text,
  related_player_name text,
  result text,
  info text,
  sort_order integer not null default 0
);

create index football_fixture_events_fixture_idx
  on public.football_fixture_events (fixture_id, sort_order, minute);

create table public.football_fixture_lineups (
  sportmonks_id bigint primary key check (sportmonks_id > 0),
  fixture_id bigint not null references public.football_fixtures(sportmonks_id) on delete cascade,
  team_id bigint not null references public.football_teams(sportmonks_id),
  player_id bigint not null references public.football_players(sportmonks_id),
  position_id bigint,
  type_id bigint not null,
  player_name text not null,
  jersey_number smallint,
  formation_field text,
  formation_position smallint
);

create index football_fixture_lineups_fixture_team_idx
  on public.football_fixture_lineups (fixture_id, team_id, type_id);

create table public.football_fixture_formations (
  sportmonks_id bigint primary key check (sportmonks_id > 0),
  fixture_id bigint not null references public.football_fixtures(sportmonks_id) on delete cascade,
  team_id bigint not null references public.football_teams(sportmonks_id),
  location text check (location is null or location in ('home', 'away')),
  formation text not null check (char_length(formation) between 1 and 32),
  unique (fixture_id, team_id)
);

create table public.football_standings (
  sportmonks_id bigint primary key check (sportmonks_id > 0),
  league_id bigint not null references public.football_leagues(sportmonks_id),
  season_id bigint not null references public.football_seasons(sportmonks_id),
  team_id bigint not null references public.football_teams(sportmonks_id),
  stage_id bigint,
  group_id bigint,
  round_id bigint,
  position smallint not null check (position > 0),
  points smallint not null default 0,
  movement text,
  form text,
  details jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  unique nulls not distinct (season_id, stage_id, group_id, team_id)
);

create index football_standings_table_idx
  on public.football_standings (season_id, stage_id, group_id, position);

create trigger football_leagues_set_updated_at before update on public.football_leagues
for each row execute function app_private.set_updated_at();
create trigger football_seasons_set_updated_at before update on public.football_seasons
for each row execute function app_private.set_updated_at();
create trigger football_teams_set_updated_at before update on public.football_teams
for each row execute function app_private.set_updated_at();
create trigger football_players_set_updated_at before update on public.football_players
for each row execute function app_private.set_updated_at();
create trigger football_fixtures_set_updated_at before update on public.football_fixtures
for each row execute function app_private.set_updated_at();
create trigger football_standings_set_updated_at before update on public.football_standings
for each row execute function app_private.set_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'football_leagues', 'football_seasons', 'football_teams', 'football_players',
    'football_fixtures', 'football_fixture_participants', 'football_fixture_scores',
    'football_fixture_events', 'football_fixture_lineups', 'football_fixture_formations',
    'football_standings'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select on table public.%I to anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      table_name || '_public_read',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.ingest_sportmonks_fixture(payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fixture_id bigint := (payload ->> 'id')::bigint;
  v_league_id bigint := (payload ->> 'league_id')::bigint;
  v_season_id bigint := (payload ->> 'season_id')::bigint;
  item jsonb;
  participant_location text;
  current_home smallint;
  current_away smallint;
begin
  if v_fixture_id is null or v_fixture_id <= 0 or v_league_id is null or v_season_id is null then
    raise exception 'Invalid Sportmonks fixture identity';
  end if;

  insert into public.football_leagues (
    sportmonks_id, country_id, name, short_code, image_url, type, active
  )
  values (
    v_league_id,
    nullif(payload #>> '{league,country_id}', '')::bigint,
    coalesce(nullif(payload #>> '{league,name}', ''), 'League ' || v_league_id),
    nullif(payload #>> '{league,short_code}', ''),
    nullif(payload #>> '{league,image_path}', ''),
    nullif(payload #>> '{league,type}', ''),
    coalesce((payload #>> '{league,active}')::boolean, true)
  )
  on conflict (sportmonks_id) do update set
    country_id = coalesce(excluded.country_id, public.football_leagues.country_id),
    name = case when excluded.name like 'League %' then public.football_leagues.name else excluded.name end,
    short_code = coalesce(excluded.short_code, public.football_leagues.short_code),
    image_url = coalesce(excluded.image_url, public.football_leagues.image_url),
    type = coalesce(excluded.type, public.football_leagues.type),
    active = excluded.active;

  insert into public.football_seasons (
    sportmonks_id, league_id, name, is_current, finished, starts_on, ends_on
  )
  values (
    v_season_id,
    v_league_id,
    coalesce(nullif(payload #>> '{season,name}', ''), 'Season ' || v_season_id),
    coalesce((payload #>> '{season,is_current}')::boolean, false),
    coalesce((payload #>> '{season,finished}')::boolean, false),
    nullif(payload #>> '{season,starting_at}', '')::date,
    nullif(payload #>> '{season,ending_at}', '')::date
  )
  on conflict (sportmonks_id) do update set
    league_id = excluded.league_id,
    name = case when excluded.name like 'Season %' then public.football_seasons.name else excluded.name end,
    is_current = excluded.is_current,
    finished = excluded.finished,
    starts_on = coalesce(excluded.starts_on, public.football_seasons.starts_on),
    ends_on = coalesce(excluded.ends_on, public.football_seasons.ends_on);

  for item in select value from jsonb_array_elements(coalesce(payload -> 'participants', '[]'::jsonb))
  loop
    insert into public.football_teams (
      sportmonks_id, country_id, name, short_code, image_url, gender, team_type, founded, placeholder
    ) values (
      (item ->> 'id')::bigint,
      nullif(item ->> 'country_id', '')::bigint,
      coalesce(nullif(item ->> 'name', ''), 'Team ' || (item ->> 'id')),
      nullif(item ->> 'short_code', ''),
      nullif(item ->> 'image_path', ''),
      nullif(item ->> 'gender', ''),
      nullif(item ->> 'type', ''),
      nullif(item ->> 'founded', '')::smallint,
      coalesce((item ->> 'placeholder')::boolean, false)
    ) on conflict (sportmonks_id) do update set
      country_id = coalesce(excluded.country_id, public.football_teams.country_id),
      name = excluded.name,
      short_code = coalesce(excluded.short_code, public.football_teams.short_code),
      image_url = coalesce(excluded.image_url, public.football_teams.image_url),
      gender = coalesce(excluded.gender, public.football_teams.gender),
      team_type = coalesce(excluded.team_type, public.football_teams.team_type),
      founded = coalesce(excluded.founded, public.football_teams.founded),
      placeholder = excluded.placeholder;
  end loop;

  select (score -> 'score' ->> 'goals')::smallint into current_home
  from jsonb_array_elements(coalesce(payload -> 'scores', '[]'::jsonb)) score
  where score ->> 'description' = 'CURRENT' and score -> 'score' ->> 'participant' = 'home'
  limit 1;
  select (score -> 'score' ->> 'goals')::smallint into current_away
  from jsonb_array_elements(coalesce(payload -> 'scores', '[]'::jsonb)) score
  where score ->> 'description' = 'CURRENT' and score -> 'score' ->> 'participant' = 'away'
  limit 1;

  insert into public.football_fixtures (
    sportmonks_id, league_id, season_id, stage_id, round_id, group_id, venue_id,
    state_id, state_name, state_code, name, starts_at, length_minutes, result_info,
    placeholder, is_live, home_score, away_score, provider_last_processed_at
  ) values (
    v_fixture_id, v_league_id, v_season_id,
    nullif(payload ->> 'stage_id', '')::bigint,
    nullif(payload ->> 'round_id', '')::bigint,
    nullif(payload ->> 'group_id', '')::bigint,
    nullif(payload ->> 'venue_id', '')::bigint,
    (payload ->> 'state_id')::bigint,
    nullif(payload #>> '{state,name}', ''),
    nullif(payload #>> '{state,developer_name}', ''),
    coalesce(nullif(payload ->> 'name', ''), 'Fixture ' || v_fixture_id),
    replace(payload ->> 'starting_at', ' ', 'T')::timestamptz,
    nullif(payload ->> 'length', '')::smallint,
    nullif(payload ->> 'result_info', ''),
    coalesce((payload ->> 'placeholder')::boolean, false),
    coalesce((payload #>> '{state,state}') = 'inplay', false)
      or coalesce((payload #>> '{state,developer_name}') in ('INPLAY', 'HT', 'BREAK'), false),
    current_home, current_away,
    nullif(replace(payload ->> 'last_processed_at', ' ', 'T'), '')::timestamptz
  ) on conflict (sportmonks_id) do update set
    league_id = excluded.league_id,
    season_id = excluded.season_id,
    stage_id = excluded.stage_id,
    round_id = excluded.round_id,
    group_id = excluded.group_id,
    venue_id = excluded.venue_id,
    state_id = excluded.state_id,
    state_name = excluded.state_name,
    state_code = excluded.state_code,
    name = excluded.name,
    starts_at = excluded.starts_at,
    length_minutes = excluded.length_minutes,
    result_info = excluded.result_info,
    placeholder = excluded.placeholder,
    is_live = excluded.is_live,
    home_score = excluded.home_score,
    away_score = excluded.away_score,
    provider_last_processed_at = excluded.provider_last_processed_at;

  delete from public.football_fixture_participants where football_fixture_participants.fixture_id = v_fixture_id;
  for item in select value from jsonb_array_elements(coalesce(payload -> 'participants', '[]'::jsonb))
  loop
    participant_location := item #>> '{meta,location}';
    if participant_location in ('home', 'away') then
      insert into public.football_fixture_participants (fixture_id, team_id, location, winner, position)
      values (
        v_fixture_id,
        (item ->> 'id')::bigint,
        participant_location,
        nullif(item #>> '{meta,winner}', '')::boolean,
        nullif(item #>> '{meta,position}', '')::smallint
      );
    end if;
  end loop;

  delete from public.football_fixture_scores where football_fixture_scores.fixture_id = v_fixture_id;
  for item in select value from jsonb_array_elements(coalesce(payload -> 'scores', '[]'::jsonb))
  loop
    insert into public.football_fixture_scores (
      sportmonks_id, fixture_id, team_id, type_id, description, location, goals
    ) values (
      (item ->> 'id')::bigint, v_fixture_id, nullif(item ->> 'participant_id', '')::bigint,
      (item ->> 'type_id')::bigint, item ->> 'description', item #>> '{score,participant}',
      nullif(item #>> '{score,goals}', '')::smallint
    );
  end loop;

  for item in
    select value from jsonb_array_elements(coalesce(payload -> 'lineups', '[]'::jsonb))
    union all
    select value from jsonb_array_elements(coalesce(payload -> 'events', '[]'::jsonb))
  loop
    if nullif(item ->> 'player_id', '') is not null then
      insert into public.football_players (sportmonks_id, display_name)
      values ((item ->> 'player_id')::bigint, coalesce(nullif(item ->> 'player_name', ''), 'Player ' || (item ->> 'player_id')))
      on conflict (sportmonks_id) do update set
        display_name = case when excluded.display_name like 'Player %' then public.football_players.display_name else excluded.display_name end;
    end if;
    if nullif(item ->> 'related_player_id', '') is not null then
      insert into public.football_players (sportmonks_id, display_name)
      values ((item ->> 'related_player_id')::bigint, coalesce(nullif(item ->> 'related_player_name', ''), 'Player ' || (item ->> 'related_player_id')))
      on conflict (sportmonks_id) do update set
        display_name = case when excluded.display_name like 'Player %' then public.football_players.display_name else excluded.display_name end;
    end if;
  end loop;

  delete from public.football_fixture_events where football_fixture_events.fixture_id = v_fixture_id;
  for item in select value from jsonb_array_elements(coalesce(payload -> 'events', '[]'::jsonb))
  loop
    insert into public.football_fixture_events (
      sportmonks_id, fixture_id, period_id, team_id, player_id, related_player_id,
      type_id, type_name, type_code, section, minute, extra_minute, player_name, related_player_name,
      result, info, sort_order
    ) values (
      (item ->> 'id')::bigint, v_fixture_id, nullif(item ->> 'period_id', '')::bigint,
      nullif(item ->> 'participant_id', '')::bigint,
      nullif(item ->> 'player_id', '')::bigint,
      nullif(item ->> 'related_player_id', '')::bigint,
      (item ->> 'type_id')::bigint,
      nullif(item #>> '{type,name}', ''),
      nullif(item #>> '{type,developer_name}', ''),
      nullif(item ->> 'section', ''),
      nullif(item ->> 'minute', '')::smallint, nullif(item ->> 'extra_minute', '')::smallint,
      nullif(item ->> 'player_name', ''), nullif(item ->> 'related_player_name', ''),
      nullif(item ->> 'result', ''), nullif(item ->> 'info', ''),
      coalesce((item ->> 'sort_order')::integer, 0)
    );
  end loop;

  delete from public.football_fixture_lineups where football_fixture_lineups.fixture_id = v_fixture_id;
  for item in select value from jsonb_array_elements(coalesce(payload -> 'lineups', '[]'::jsonb))
  loop
    insert into public.football_fixture_lineups (
      sportmonks_id, fixture_id, team_id, player_id, position_id, type_id,
      player_name, jersey_number, formation_field, formation_position
    ) values (
      (item ->> 'id')::bigint, v_fixture_id, (item ->> 'team_id')::bigint,
      (item ->> 'player_id')::bigint, nullif(item ->> 'position_id', '')::bigint,
      (item ->> 'type_id')::bigint, item ->> 'player_name',
      nullif(item ->> 'jersey_number', '')::smallint,
      nullif(item ->> 'formation_field', ''), nullif(item ->> 'formation_position', '')::smallint
    );
  end loop;

  delete from public.football_fixture_formations where football_fixture_formations.fixture_id = v_fixture_id;
  for item in select value from jsonb_array_elements(coalesce(payload -> 'formations', '[]'::jsonb))
  loop
    insert into public.football_fixture_formations (
      sportmonks_id, fixture_id, team_id, location, formation
    ) values (
      (item ->> 'id')::bigint, v_fixture_id, (item ->> 'participant_id')::bigint,
      nullif(item ->> 'location', ''), item ->> 'formation'
    );
  end loop;

  return v_fixture_id;
end;
$$;

create or replace function public.ingest_sportmonks_standings(payload jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  ingested integer := 0;
  v_league_id bigint;
  v_season_id bigint;
begin
  for item in select value from jsonb_array_elements(payload)
  loop
    v_league_id := (item ->> 'league_id')::bigint;
    v_season_id := (item ->> 'season_id')::bigint;

    insert into public.football_leagues (
      sportmonks_id, country_id, name, short_code, image_url, type, active
    ) values (
      v_league_id,
      nullif(item #>> '{league,country_id}', '')::bigint,
      coalesce(nullif(item #>> '{league,name}', ''), 'League ' || v_league_id),
      nullif(item #>> '{league,short_code}', ''),
      nullif(item #>> '{league,image_path}', ''),
      nullif(item #>> '{league,type}', ''),
      coalesce((item #>> '{league,active}')::boolean, true)
    ) on conflict (sportmonks_id) do update set
      name = case when excluded.name like 'League %' then public.football_leagues.name else excluded.name end,
      short_code = coalesce(excluded.short_code, public.football_leagues.short_code),
      image_url = coalesce(excluded.image_url, public.football_leagues.image_url);

    insert into public.football_seasons (
      sportmonks_id, league_id, name, is_current, finished, starts_on, ends_on
    ) values (
      v_season_id,
      v_league_id,
      coalesce(nullif(item #>> '{season,name}', ''), 'Season ' || v_season_id),
      coalesce((item #>> '{season,is_current}')::boolean, false),
      coalesce((item #>> '{season,finished}')::boolean, false),
      nullif(item #>> '{season,starting_at}', '')::date,
      nullif(item #>> '{season,ending_at}', '')::date
    ) on conflict (sportmonks_id) do update set
      league_id = excluded.league_id,
      name = case when excluded.name like 'Season %' then public.football_seasons.name else excluded.name end,
      is_current = excluded.is_current,
      finished = excluded.finished,
      starts_on = coalesce(excluded.starts_on, public.football_seasons.starts_on),
      ends_on = coalesce(excluded.ends_on, public.football_seasons.ends_on);

    insert into public.football_teams (
      sportmonks_id, country_id, name, short_code, image_url, gender, team_type, founded, placeholder
    ) values (
      (item ->> 'participant_id')::bigint,
      nullif(item #>> '{participant,country_id}', '')::bigint,
      coalesce(nullif(item #>> '{participant,name}', ''), 'Team ' || (item ->> 'participant_id')),
      nullif(item #>> '{participant,short_code}', ''),
      nullif(item #>> '{participant,image_path}', ''),
      nullif(item #>> '{participant,gender}', ''),
      nullif(item #>> '{participant,type}', ''),
      nullif(item #>> '{participant,founded}', '')::smallint,
      coalesce((item #>> '{participant,placeholder}')::boolean, false)
    ) on conflict (sportmonks_id) do update set
      name = excluded.name,
      short_code = coalesce(excluded.short_code, public.football_teams.short_code),
      image_url = coalesce(excluded.image_url, public.football_teams.image_url);

    insert into public.football_standings (
      sportmonks_id, league_id, season_id, team_id, stage_id, group_id, round_id,
      position, points, movement, form, details
    ) values (
      (item ->> 'id')::bigint, v_league_id,
      v_season_id, (item ->> 'participant_id')::bigint,
      nullif(item ->> 'stage_id', '')::bigint, nullif(item ->> 'group_id', '')::bigint,
      nullif(item ->> 'round_id', '')::bigint, (item ->> 'position')::smallint,
      coalesce((item ->> 'points')::smallint, 0), nullif(item ->> 'result', ''),
      nullif(item ->> 'form', ''), coalesce(item -> 'details', '[]'::jsonb)
    ) on conflict (sportmonks_id) do update set
      league_id = excluded.league_id,
      season_id = excluded.season_id,
      team_id = excluded.team_id,
      stage_id = excluded.stage_id,
      group_id = excluded.group_id,
      round_id = excluded.round_id,
      position = excluded.position,
      points = excluded.points,
      movement = excluded.movement,
      form = excluded.form,
      details = excluded.details;
    ingested := ingested + 1;
  end loop;

  if jsonb_array_length(payload) > 0 then
    delete from public.football_standings standing
    where standing.season_id in (
      select distinct (value ->> 'season_id')::bigint
      from jsonb_array_elements(payload)
    )
    and standing.sportmonks_id not in (
      select (value ->> 'id')::bigint
      from jsonb_array_elements(payload)
    );
  end if;

  return ingested;
end;
$$;

create or replace function public.is_football_sync_processed(
  p_message_id text,
  p_idempotency_key text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists(
    select 1 from app_private.processed_events
    where consumer_name = 'football-sync-v1'
      and (message_id = p_message_id or idempotency_key = p_idempotency_key)
  );
$$;

create or replace function public.record_football_sync_processed(
  p_message_id text,
  p_idempotency_key text,
  p_result jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app_private.processed_events (consumer_name, message_id, idempotency_key, result)
  values ('football-sync-v1', p_message_id, p_idempotency_key, p_result)
  on conflict do nothing;
$$;

create or replace function public.record_football_sync_dead_letter(
  p_message_id text,
  p_idempotency_key text,
  p_payload jsonb,
  p_delivery_count integer,
  p_error_message text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app_private.dead_letter_events (
    topic, consumer_name, message_id, idempotency_key, payload,
    delivery_count, error_code, error_message
  ) values (
    'football-sync', 'football-sync-v1', p_message_id, p_idempotency_key, p_payload,
    p_delivery_count, 'FOOTBALL_SYNC_TERMINAL', left(p_error_message, 2000)
  ) on conflict (consumer_name, message_id) do nothing;
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.ingest_sportmonks_fixture(jsonb)',
    'public.ingest_sportmonks_standings(jsonb)',
    'public.is_football_sync_processed(text, text)',
    'public.record_football_sync_processed(text, text, jsonb)',
    'public.record_football_sync_dead_letter(text, text, jsonb, integer, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end;
$$;
-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260816040000_phase3_hardening.sql
-- -----------------------------------------------------------------------------
create or replace function public.try_acquire_cron_lock(
  p_lock_key text,
  p_owner_token uuid,
  p_ttl_seconds integer
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select app_private.try_acquire_execution_lock(p_lock_key, p_owner_token, p_ttl_seconds);
$$;

create or replace function public.release_cron_lock(
  p_lock_key text,
  p_owner_token uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select app_private.release_execution_lock(p_lock_key, p_owner_token);
$$;

revoke all on function public.try_acquire_cron_lock(text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.release_cron_lock(text, uuid)
  from public, anon, authenticated;
grant execute on function public.try_acquire_cron_lock(text, uuid, integer) to service_role;
grant execute on function public.release_cron_lock(text, uuid) to service_role;

comment on function public.try_acquire_cron_lock(text, uuid, integer) is
  'Service-role-only PostgREST wrapper for short application Cron leases.';
comment on function public.release_cron_lock(text, uuid) is
  'Service-role-only PostgREST wrapper for releasing application Cron leases.';

create or replace function public.get_football_player_recent_fixtures(
  p_player_id bigint,
  p_limit integer default 10
)
returns table (
  fixture_id bigint,
  fixture_name text,
  starts_at timestamptz,
  team_id bigint,
  jersey_number smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    lineup.fixture_id,
    fixture.name,
    fixture.starts_at,
    lineup.team_id,
    lineup.jersey_number
  from public.football_fixture_lineups lineup
  join public.football_fixtures fixture on fixture.sportmonks_id = lineup.fixture_id
  where lineup.player_id = p_player_id
  order by fixture.starts_at desc, fixture.sportmonks_id desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.get_football_player_recent_fixtures(bigint, integer) from public;
grant execute on function public.get_football_player_recent_fixtures(bigint, integer)
  to anon, authenticated, service_role;

comment on function public.get_football_player_recent_fixtures(bigint, integer) is
  'Returns player appearances ordered by fixture start time rather than provider identifiers.';
-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260816050000_ai_match_companion.sql
-- -----------------------------------------------------------------------------
create table public.football_fixture_statistics (
  sportmonks_id bigint primary key check (sportmonks_id > 0),
  fixture_id bigint not null references public.football_fixtures(sportmonks_id) on delete cascade,
  team_id bigint not null references public.football_teams(sportmonks_id),
  type_id bigint not null,
  type_name text,
  type_code text,
  value jsonb
);

create index football_fixture_statistics_fixture_idx
  on public.football_fixture_statistics (fixture_id, team_id, type_id);
alter table public.football_fixture_statistics enable row level security;
alter table public.football_fixture_statistics force row level security;
revoke all on table public.football_fixture_statistics from anon, authenticated;
grant select on table public.football_fixture_statistics to anon, authenticated;
grant all on table public.football_fixture_statistics to service_role;
create policy football_fixture_statistics_public_read on public.football_fixture_statistics
for select to anon, authenticated using (true);

create or replace function public.ingest_sportmonks_fixture_v2(payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_identifier bigint;
  item jsonb;
begin
  fixture_identifier := public.ingest_sportmonks_fixture(payload);
  delete from public.football_fixture_statistics where fixture_id = fixture_identifier;
  for item in select value from jsonb_array_elements(coalesce(payload -> 'statistics', '[]'::jsonb))
  loop
    if nullif(item ->> 'participant_id', '') is not null then
      insert into public.football_fixture_statistics (
        sportmonks_id, fixture_id, team_id, type_id, type_name, type_code, value
      ) values (
        (item ->> 'id')::bigint,
        fixture_identifier,
        (item ->> 'participant_id')::bigint,
        (item ->> 'type_id')::bigint,
        nullif(item #>> '{type,name}', ''),
        nullif(item #>> '{type,developer_name}', ''),
        coalesce(item #> '{data,value}', item -> 'value', 'null'::jsonb)
      );
    end if;
  end loop;
  return fixture_identifier;
end;
$$;

revoke all on function public.ingest_sportmonks_fixture_v2(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_sportmonks_fixture_v2(jsonb) to service_role;

create table public.ai_match_analyses (
  id uuid primary key default gen_random_uuid(),
  fixture_id bigint not null references public.football_fixtures(sportmonks_id) on delete cascade,
  language text not null check (language in ('th', 'en')),
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  source_updated_at timestamptz not null,
  trigger_key text,
  requested_by uuid references auth.users(id) on delete set null,
  model text,
  provider_response_id text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  prompt_version text not null,
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  error_code text,
  generated_at timestamptz,
  expires_at timestamptz not null default (timezone('utc', now()) + interval '30 days'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (fixture_id, language)
);

create index ai_match_analyses_retention_idx on public.ai_match_analyses (expires_at);
create index ai_match_analyses_status_idx on public.ai_match_analyses (status, updated_at);

create table public.ai_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('team', 'player')),
  left_id bigint not null check (left_id > 0),
  right_id bigint not null check (right_id > 0 and right_id <> left_id),
  language text not null check (language in ('th', 'en')),
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  source_fingerprint text not null check (char_length(source_fingerprint) = 32),
  prompt_version text not null,
  model text,
  provider_response_id text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  error_code text,
  expires_at timestamptz not null default (timezone('utc', now()) + interval '30 days'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, entity_type, left_id, right_id, language)
);
create index ai_comparisons_retention_idx on public.ai_comparisons (expires_at);
create trigger ai_comparisons_set_updated_at before update on public.ai_comparisons
for each row execute function app_private.set_updated_at();
alter table public.ai_comparisons enable row level security;
alter table public.ai_comparisons force row level security;
revoke all on table public.ai_comparisons from anon, authenticated;
grant all on table public.ai_comparisons to service_role;

create table public.ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default (timezone('utc', now()))::date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, usage_date)
);

create trigger ai_match_analyses_set_updated_at before update on public.ai_match_analyses
for each row execute function app_private.set_updated_at();
create trigger ai_daily_usage_set_updated_at before update on public.ai_daily_usage
for each row execute function app_private.set_updated_at();

alter table public.ai_match_analyses enable row level security;
alter table public.ai_match_analyses force row level security;
alter table public.ai_daily_usage enable row level security;
alter table public.ai_daily_usage force row level security;
revoke all on table public.ai_match_analyses from anon, authenticated;
revoke all on table public.ai_daily_usage from anon, authenticated;
grant all on table public.ai_match_analyses to service_role;
grant all on table public.ai_daily_usage to service_role;

create or replace function public.reserve_ai_match_analysis(
  p_fixture_id bigint,
  p_user_id uuid,
  p_language text,
  p_prompt_version text,
  p_daily_limit integer
)
returns table (
  analysis_id uuid,
  analysis_status text,
  source_updated_at timestamptz,
  should_enqueue boolean,
  quota_remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_revision timestamptz;
  existing public.ai_match_analyses%rowtype;
  usage_count integer;
begin
  if p_language not in ('th', 'en') or p_daily_limit < 1 then
    raise exception 'Invalid AI analysis request';
  end if;

  select coalesce(provider_last_processed_at, updated_at) into fixture_revision
  from public.football_fixtures
  where sportmonks_id = p_fixture_id;
  if fixture_revision is null then
    raise no_data_found using message = 'Fixture not found';
  end if;

  select * into existing
  from public.ai_match_analyses
  where fixture_id = p_fixture_id and language = p_language
  for update;

  if found and existing.source_updated_at = fixture_revision
    and existing.status in ('queued', 'running', 'completed') then
    select coalesce(request_count, 0) into usage_count
    from public.ai_daily_usage
    where user_id = p_user_id and usage_date = (timezone('utc', now()))::date;
    return query select existing.id, existing.status, fixture_revision, false,
      greatest(p_daily_limit - coalesce(usage_count, 0), 0);
    return;
  end if;

  insert into public.ai_daily_usage (user_id, usage_date, request_count)
  values (p_user_id, (timezone('utc', now()))::date, 1)
  on conflict (user_id, usage_date) do update
  set request_count = public.ai_daily_usage.request_count + 1
  where public.ai_daily_usage.request_count < p_daily_limit
  returning request_count into usage_count;

  if usage_count is null or usage_count > p_daily_limit then
    return query select coalesce(existing.id, gen_random_uuid()), coalesce(existing.status, 'failed'),
      fixture_revision, false, 0;
    return;
  end if;

  insert into public.ai_match_analyses (
    fixture_id, language, status, source_updated_at, requested_by, prompt_version,
    result, error_code, model, generated_at, expires_at
  ) values (
    p_fixture_id, p_language, 'queued', fixture_revision, p_user_id, p_prompt_version,
    null, null, null, null, timezone('utc', now()) + interval '30 days'
  )
  on conflict (fixture_id, language) do update set
    status = 'queued', source_updated_at = excluded.source_updated_at,
    requested_by = excluded.requested_by, prompt_version = excluded.prompt_version,
    result = null, error_code = null, model = null, provider_response_id = null,
    input_tokens = null, output_tokens = null, generated_at = null,
    expires_at = excluded.expires_at
  returning id into analysis_id;

  return query select analysis_id, 'queued'::text, fixture_revision, true,
    greatest(p_daily_limit - usage_count, 0);
end;
$$;

revoke all on function public.reserve_ai_match_analysis(bigint, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_match_analysis(bigint, uuid, text, text, integer)
  to service_role;

create or replace function public.reserve_ai_comparison(
  p_user_id uuid,
  p_entity_type text,
  p_left_id bigint,
  p_right_id bigint,
  p_language text,
  p_prompt_version text,
  p_daily_limit integer
)
returns table (
  comparison_id uuid,
  comparison_status text,
  source_fingerprint text,
  should_enqueue boolean,
  quota_remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  fingerprint text;
  existing public.ai_comparisons%rowtype;
  usage_count integer;
begin
  if p_entity_type not in ('team', 'player') or p_language not in ('th', 'en')
    or p_left_id = p_right_id or p_daily_limit < 1 then
    raise exception 'Invalid AI comparison request';
  end if;
  if p_entity_type = 'team' then
    select md5(string_agg(sportmonks_id::text || ':' || updated_at::text, ',' order by sportmonks_id))
    into fingerprint from public.football_teams where sportmonks_id in (p_left_id, p_right_id);
    if (select count(*) from public.football_teams where sportmonks_id in (p_left_id, p_right_id)) <> 2 then
      raise no_data_found using message = 'Comparison entity not found';
    end if;
  else
    select md5(string_agg(sportmonks_id::text || ':' || updated_at::text, ',' order by sportmonks_id))
    into fingerprint from public.football_players where sportmonks_id in (p_left_id, p_right_id);
    if (select count(*) from public.football_players where sportmonks_id in (p_left_id, p_right_id)) <> 2 then
      raise no_data_found using message = 'Comparison entity not found';
    end if;
  end if;
  select * into existing from public.ai_comparisons
  where user_id = p_user_id and entity_type = p_entity_type and left_id = p_left_id
    and right_id = p_right_id and language = p_language for update;
  if found and existing.source_fingerprint = fingerprint
    and existing.status in ('queued', 'running', 'completed') then
    select coalesce(request_count, 0) into usage_count from public.ai_daily_usage
    where user_id = p_user_id and usage_date = (timezone('utc', now()))::date;
    return query select existing.id, existing.status, fingerprint, false,
      greatest(p_daily_limit - coalesce(usage_count, 0), 0);
    return;
  end if;
  insert into public.ai_daily_usage (user_id, usage_date, request_count)
  values (p_user_id, (timezone('utc', now()))::date, 1)
  on conflict (user_id, usage_date) do update
  set request_count = public.ai_daily_usage.request_count + 1
  where public.ai_daily_usage.request_count < p_daily_limit
  returning request_count into usage_count;
  if usage_count is null then
    return query select coalesce(existing.id, gen_random_uuid()), coalesce(existing.status, 'failed'),
      fingerprint, false, 0;
    return;
  end if;
  insert into public.ai_comparisons (
    user_id, entity_type, left_id, right_id, language, status, source_fingerprint,
    prompt_version, expires_at
  ) values (
    p_user_id, p_entity_type, p_left_id, p_right_id, p_language, 'queued', fingerprint,
    p_prompt_version, timezone('utc', now()) + interval '30 days'
  ) on conflict (user_id, entity_type, left_id, right_id, language) do update set
    status = 'queued', source_fingerprint = excluded.source_fingerprint,
    prompt_version = excluded.prompt_version, model = null, provider_response_id = null,
    input_tokens = null, output_tokens = null, result = null, error_code = null,
    expires_at = excluded.expires_at
  returning id into comparison_id;
  return query select comparison_id, 'queued'::text, fingerprint, true,
    greatest(p_daily_limit - usage_count, 0);
end;
$$;

revoke all on function public.reserve_ai_comparison(uuid, text, bigint, bigint, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_comparison(uuid, text, bigint, bigint, text, text, integer)
  to service_role;

create or replace function public.reserve_system_ai_match_analysis(
  p_fixture_id bigint,
  p_language text,
  p_prompt_version text,
  p_trigger_key text
)
returns table (
  analysis_id uuid,
  source_updated_at timestamptz,
  should_enqueue boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_revision timestamptz;
  existing public.ai_match_analyses%rowtype;
begin
  select coalesce(provider_last_processed_at, updated_at) into fixture_revision from public.football_fixtures
  where sportmonks_id = p_fixture_id;
  if fixture_revision is null or p_language not in ('th', 'en') then
    raise exception 'Invalid system AI analysis request';
  end if;
  select * into existing from public.ai_match_analyses
  where fixture_id = p_fixture_id and language = p_language for update;
  if found and existing.trigger_key = p_trigger_key
    and existing.status in ('queued', 'running', 'completed') then
    return query select existing.id, fixture_revision, false;
    return;
  end if;
  insert into public.ai_match_analyses (
    fixture_id, language, status, source_updated_at, prompt_version, trigger_key, result,
    error_code, model, generated_at, expires_at
  ) values (
    p_fixture_id, p_language, 'queued', fixture_revision, p_prompt_version, p_trigger_key, null,
    null, null, null, timezone('utc', now()) + interval '30 days'
  )
  on conflict (fixture_id, language) do update set
    status = 'queued', source_updated_at = excluded.source_updated_at,
    prompt_version = excluded.prompt_version, trigger_key = excluded.trigger_key,
    result = null, error_code = null,
    model = null, provider_response_id = null, input_tokens = null, output_tokens = null,
    generated_at = null, expires_at = excluded.expires_at
  returning id into analysis_id;
  return query select analysis_id, fixture_revision, true;
end;
$$;

revoke all on function public.reserve_system_ai_match_analysis(bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_system_ai_match_analysis(bigint, text, text, text)
  to service_role;

create or replace function public.record_ai_analysis_dead_letter(
  p_message_id text,
  p_idempotency_key text,
  p_payload jsonb,
  p_delivery_count integer,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app_private.dead_letter_events (
    topic, consumer_name, message_id, idempotency_key, payload,
    delivery_count, error_code, error_message
  ) values (
    'ai-analysis', 'ai-analysis-v1', p_message_id, p_idempotency_key, p_payload,
    p_delivery_count, 'AI_ANALYSIS_FAILED', left(p_error_message, 1000)
  ) on conflict (consumer_name, message_id) do nothing;
end;
$$;

revoke all on function public.record_ai_analysis_dead_letter(text, text, jsonb, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_ai_analysis_dead_letter(text, text, jsonb, integer, text)
  to service_role;

create or replace function public.run_auth_retention(p_scheduled_for timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_id uuid;
  revoked_count integer;
  audit_count integer;
  ai_count integer;
  comparison_count integer;
begin
  insert into app_private.cron_executions (cron_name, scheduled_for, status, started_at)
  values ('auth-retention', p_scheduled_for, 'running', timezone('utc', now()))
  on conflict (cron_name, scheduled_for) do update
  set status = 'running', started_at = timezone('utc', now()), completed_at = null,
      error_message = null
  where app_private.cron_executions.status = 'failed'
  returning id into execution_id;

  if execution_id is null then
    return jsonb_build_object('status', 'duplicate', 'revokedSessionsPurged', 0,
      'auditRowsPurged', 0, 'aiRowsPurged', 0);
  end if;

  delete from public.revoked_auth_sessions
  where expires_at < timezone('utc', now()) - interval '1 day';
  get diagnostics revoked_count = row_count;
  delete from public.account_deletion_audit
  where requested_at < timezone('utc', now()) - interval '180 days';
  get diagnostics audit_count = row_count;
  delete from public.ai_match_analyses where expires_at < timezone('utc', now());
  get diagnostics ai_count = row_count;
  delete from public.ai_comparisons where expires_at < timezone('utc', now());
  get diagnostics comparison_count = row_count;
  ai_count := ai_count + comparison_count;

  update app_private.cron_executions
  set status = 'succeeded', completed_at = timezone('utc', now()) where id = execution_id;
  return jsonb_build_object('status', 'succeeded', 'revokedSessionsPurged', revoked_count,
    'auditRowsPurged', audit_count, 'aiRowsPurged', ai_count);
exception when others then
  if execution_id is not null then
    update app_private.cron_executions
    set status = 'failed', completed_at = timezone('utc', now()), error_message = sqlerrm
    where id = execution_id;
  end if;
  return jsonb_build_object('status', 'failed', 'error', sqlerrm,
    'revokedSessionsPurged', 0, 'auditRowsPurged', 0, 'aiRowsPurged', 0);
end;
$$;

revoke all on function public.run_auth_retention(timestamptz) from public, anon, authenticated;
grant execute on function public.run_auth_retention(timestamptz) to service_role;
-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260816060000_phase4_production_hardening.sql
-- -----------------------------------------------------------------------------
alter table public.ai_match_analyses
  add column analysis_key text,
  add column generation_id uuid not null default gen_random_uuid(),
  add column input_snapshot jsonb check (
    input_snapshot is null or jsonb_typeof(input_snapshot) = 'object'
  );

update public.ai_match_analyses
set analysis_key = coalesce(trigger_key, 'latest');

alter table public.ai_match_analyses
  alter column analysis_key set not null,
  add constraint ai_match_analyses_analysis_key_check
    check (analysis_key in ('latest', 'halftime', 'fulltime'));

alter table public.ai_match_analyses
  drop constraint ai_match_analyses_fixture_id_language_key;

alter table public.ai_match_analyses
  add constraint ai_match_analyses_fixture_language_analysis_key_key
    unique (fixture_id, language, analysis_key);

alter table public.ai_comparisons
  add column generation_id uuid not null default gen_random_uuid(),
  add column left_snapshot jsonb check (
    left_snapshot is null or jsonb_typeof(left_snapshot) = 'object'
  ),
  add column right_snapshot jsonb check (
    right_snapshot is null or jsonb_typeof(right_snapshot) = 'object'
  );

create table public.ai_system_daily_usage (
  usage_date date primary key default (timezone('utc', now()))::date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger ai_system_daily_usage_set_updated_at
before update on public.ai_system_daily_usage
for each row execute function app_private.set_updated_at();

alter table public.ai_system_daily_usage enable row level security;
alter table public.ai_system_daily_usage force row level security;
revoke all on table public.ai_system_daily_usage from anon, authenticated;
grant all on table public.ai_system_daily_usage to service_role;

create or replace function app_private.iso_utc(value timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(value at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

drop function public.reserve_ai_match_analysis(bigint, uuid, text, text, integer);

create function public.reserve_ai_match_analysis(
  p_fixture_id bigint,
  p_user_id uuid,
  p_language text,
  p_prompt_version text,
  p_daily_limit integer,
  p_expected_source_updated_at timestamptz,
  p_input_snapshot jsonb
)
returns table (
  analysis_id uuid,
  analysis_status text,
  source_updated_at timestamptz,
  should_enqueue boolean,
  quota_remaining integer,
  reservation_outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_revision timestamptz;
  existing public.ai_match_analyses%rowtype;
  usage_count integer;
  reserved_id uuid;
  reserved_generation uuid;
  event_key text;
begin
  if p_language not in ('th', 'en') or p_daily_limit < 1
    or jsonb_typeof(p_input_snapshot) <> 'object'
    or nullif(p_input_snapshot ->> 'id', '')::bigint is distinct from p_fixture_id then
    raise exception 'Invalid AI analysis request';
  end if;

  select coalesce(provider_last_processed_at, updated_at)
  into fixture_revision
  from public.football_fixtures
  where sportmonks_id = p_fixture_id;

  if fixture_revision is null then
    raise no_data_found using message = 'Fixture not found';
  end if;
  if fixture_revision is distinct from p_expected_source_updated_at then
    raise exception using errcode = 'P0003', message = 'Fixture changed while reserving AI analysis';
  end if;

  select * into existing
  from public.ai_match_analyses
  where fixture_id = p_fixture_id and language = p_language and analysis_key = 'latest'
  for update;

  if found and existing.source_updated_at = fixture_revision
    and existing.prompt_version = p_prompt_version
    and existing.status in ('queued', 'running', 'completed') then
    select coalesce(request_count, 0) into usage_count
    from public.ai_daily_usage
    where user_id = p_user_id and usage_date = (timezone('utc', now()))::date;
    return query select existing.id, existing.status, fixture_revision, false,
      greatest(p_daily_limit - coalesce(usage_count, 0), 0), 'reused'::text;
    return;
  end if;

  usage_count := null;
  insert into public.ai_daily_usage (user_id, usage_date, request_count)
  values (p_user_id, (timezone('utc', now()))::date, 1)
  on conflict (user_id, usage_date) do update
  set request_count = public.ai_daily_usage.request_count + 1
  where public.ai_daily_usage.request_count < p_daily_limit
  returning request_count into usage_count;

  if usage_count is null then
    return query select existing.id, coalesce(existing.status, 'failed'), fixture_revision, false,
      0, 'quota_exhausted'::text;
    return;
  end if;

  reserved_generation := gen_random_uuid();
  insert into public.ai_match_analyses (
    fixture_id, language, analysis_key, generation_id, status, source_updated_at,
    input_snapshot, requested_by, prompt_version, trigger_key, result, error_code,
    model, generated_at, expires_at
  ) values (
    p_fixture_id, p_language, 'latest', reserved_generation, 'queued', fixture_revision,
    p_input_snapshot, p_user_id, p_prompt_version, null, null, null,
    null, null, timezone('utc', now()) + interval '30 days'
  )
  on conflict (fixture_id, language, analysis_key) do update set
    generation_id = excluded.generation_id, status = 'queued',
    source_updated_at = excluded.source_updated_at, input_snapshot = excluded.input_snapshot,
    requested_by = excluded.requested_by, prompt_version = excluded.prompt_version,
    trigger_key = null, result = null, error_code = null, model = null,
    provider_response_id = null, input_tokens = null, output_tokens = null,
    generated_at = null, expires_at = excluded.expires_at
  returning id into reserved_id;

  event_key := 'ai-analysis:' || reserved_id::text || ':' || reserved_generation::text || ':v1';
  insert into app_private.outbox_events (topic, event_key, schema_version, payload)
  values (
    'ai-analysis', event_key, 1,
    jsonb_build_object(
      'schemaVersion', 1,
      'type', 'analyze-match',
      'analysisId', reserved_id,
      'generationId', reserved_generation,
      'fixtureId', p_fixture_id,
      'language', p_language,
      'sourceUpdatedAt', app_private.iso_utc(fixture_revision),
      'correlationId', gen_random_uuid(),
      'requestedAt', app_private.iso_utc(timezone('utc', now()))
    )
  );

  return query select reserved_id, 'queued'::text, fixture_revision, true,
    greatest(p_daily_limit - usage_count, 0), 'queued'::text;
end;
$$;

drop function public.reserve_ai_comparison(uuid, text, bigint, bigint, text, text, integer);

create function public.reserve_ai_comparison(
  p_user_id uuid,
  p_entity_type text,
  p_left_id bigint,
  p_right_id bigint,
  p_language text,
  p_prompt_version text,
  p_daily_limit integer,
  p_left_snapshot jsonb,
  p_right_snapshot jsonb
)
returns table (
  comparison_id uuid,
  comparison_status text,
  source_fingerprint text,
  should_enqueue boolean,
  quota_remaining integer,
  reservation_outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  fingerprint text;
  existing public.ai_comparisons%rowtype;
  usage_count integer;
  reserved_id uuid;
  reserved_generation uuid;
  event_key text;
begin
  if p_entity_type not in ('team', 'player') or p_language not in ('th', 'en')
    or p_left_id = p_right_id or p_daily_limit < 1
    or jsonb_typeof(p_left_snapshot) <> 'object'
    or jsonb_typeof(p_right_snapshot) <> 'object' then
    raise exception 'Invalid AI comparison request';
  end if;

  if p_entity_type = 'team' then
    if nullif(p_left_snapshot #>> '{team,id}', '')::bigint is distinct from p_left_id
      or nullif(p_right_snapshot #>> '{team,id}', '')::bigint is distinct from p_right_id
      or (select count(*) from public.football_teams
          where sportmonks_id in (p_left_id, p_right_id)) <> 2 then
      raise no_data_found using message = 'Comparison entity not found';
    end if;
  else
    if nullif(p_left_snapshot #>> '{player,id}', '')::bigint is distinct from p_left_id
      or nullif(p_right_snapshot #>> '{player,id}', '')::bigint is distinct from p_right_id
      or (select count(*) from public.football_players
          where sportmonks_id in (p_left_id, p_right_id)) <> 2 then
      raise no_data_found using message = 'Comparison entity not found';
    end if;
  end if;

  fingerprint := md5(
    p_entity_type || ':' || p_prompt_version || ':' ||
    p_left_snapshot::text || ':' || p_right_snapshot::text
  );

  select * into existing from public.ai_comparisons
  where user_id = p_user_id and entity_type = p_entity_type and left_id = p_left_id
    and right_id = p_right_id and language = p_language for update;

  if found and existing.source_fingerprint = fingerprint
    and existing.prompt_version = p_prompt_version
    and existing.status in ('queued', 'running', 'completed') then
    select coalesce(request_count, 0) into usage_count from public.ai_daily_usage
    where user_id = p_user_id and usage_date = (timezone('utc', now()))::date;
    return query select existing.id, existing.status, fingerprint, false,
      greatest(p_daily_limit - coalesce(usage_count, 0), 0), 'reused'::text;
    return;
  end if;

  usage_count := null;
  insert into public.ai_daily_usage (user_id, usage_date, request_count)
  values (p_user_id, (timezone('utc', now()))::date, 1)
  on conflict (user_id, usage_date) do update
  set request_count = public.ai_daily_usage.request_count + 1
  where public.ai_daily_usage.request_count < p_daily_limit
  returning request_count into usage_count;

  if usage_count is null then
    return query select existing.id, coalesce(existing.status, 'failed'), fingerprint, false,
      0, 'quota_exhausted'::text;
    return;
  end if;

  reserved_generation := gen_random_uuid();
  insert into public.ai_comparisons (
    user_id, entity_type, left_id, right_id, language, generation_id, status,
    source_fingerprint, left_snapshot, right_snapshot, prompt_version, expires_at
  ) values (
    p_user_id, p_entity_type, p_left_id, p_right_id, p_language, reserved_generation, 'queued',
    fingerprint, p_left_snapshot, p_right_snapshot, p_prompt_version,
    timezone('utc', now()) + interval '30 days'
  ) on conflict (user_id, entity_type, left_id, right_id, language) do update set
    generation_id = excluded.generation_id, status = 'queued',
    source_fingerprint = excluded.source_fingerprint,
    left_snapshot = excluded.left_snapshot, right_snapshot = excluded.right_snapshot,
    prompt_version = excluded.prompt_version, model = null, provider_response_id = null,
    input_tokens = null, output_tokens = null, result = null, error_code = null,
    expires_at = excluded.expires_at
  returning id into reserved_id;

  event_key := 'ai-comparison:' || reserved_id::text || ':' || reserved_generation::text || ':v1';
  insert into app_private.outbox_events (topic, event_key, schema_version, payload)
  values (
    'ai-analysis', event_key, 1,
    jsonb_build_object(
      'schemaVersion', 1,
      'type', 'compare-entities',
      'comparisonId', reserved_id,
      'generationId', reserved_generation,
      'entityType', p_entity_type,
      'leftId', p_left_id,
      'rightId', p_right_id,
      'language', p_language,
      'sourceFingerprint', fingerprint,
      'correlationId', gen_random_uuid(),
      'requestedAt', app_private.iso_utc(timezone('utc', now()))
    )
  );

  return query select reserved_id, 'queued'::text, fingerprint, true,
    greatest(p_daily_limit - usage_count, 0), 'queued'::text;
end;
$$;

drop function public.reserve_system_ai_match_analysis(bigint, text, text, text);

create function public.reserve_system_ai_match_analysis(
  p_fixture_id bigint,
  p_language text,
  p_prompt_version text,
  p_trigger_key text,
  p_daily_limit integer,
  p_allowed_league_ids bigint[],
  p_expected_source_updated_at timestamptz,
  p_input_snapshot jsonb
)
returns table (
  analysis_id uuid,
  analysis_status text,
  source_updated_at timestamptz,
  should_enqueue boolean,
  budget_remaining integer,
  reservation_outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_revision timestamptz;
  fixture_league_id bigint;
  existing public.ai_match_analyses%rowtype;
  usage_count integer;
  reserved_id uuid;
  reserved_generation uuid;
  event_key text;
begin
  if p_language not in ('th', 'en') or p_trigger_key not in ('halftime', 'fulltime')
    or p_daily_limit < 1 or jsonb_typeof(p_input_snapshot) <> 'object'
    or nullif(p_input_snapshot ->> 'id', '')::bigint is distinct from p_fixture_id then
    raise exception 'Invalid system AI analysis request';
  end if;

  select coalesce(provider_last_processed_at, updated_at), league_id
  into fixture_revision, fixture_league_id
  from public.football_fixtures where sportmonks_id = p_fixture_id;

  if fixture_revision is null then
    raise no_data_found using message = 'Fixture not found';
  end if;
  if coalesce(array_length(p_allowed_league_ids, 1), 0) = 0
    or not (fixture_league_id = any(p_allowed_league_ids)) then
    return query select null::uuid, 'failed'::text, fixture_revision, false,
      p_daily_limit, 'not_eligible'::text;
    return;
  end if;
  if fixture_revision is distinct from p_expected_source_updated_at then
    raise exception using errcode = 'P0003', message = 'Fixture changed while reserving system AI analysis';
  end if;

  select * into existing from public.ai_match_analyses
  where fixture_id = p_fixture_id and language = p_language and analysis_key = p_trigger_key
  for update;

  if found and existing.source_updated_at = fixture_revision
    and existing.prompt_version = p_prompt_version
    and existing.status in ('queued', 'running', 'completed') then
    select coalesce(request_count, 0) into usage_count from public.ai_system_daily_usage
    where usage_date = (timezone('utc', now()))::date;
    return query select existing.id, existing.status, fixture_revision, false,
      greatest(p_daily_limit - coalesce(usage_count, 0), 0), 'reused'::text;
    return;
  end if;

  usage_count := null;
  insert into public.ai_system_daily_usage (usage_date, request_count)
  values ((timezone('utc', now()))::date, 1)
  on conflict (usage_date) do update
  set request_count = public.ai_system_daily_usage.request_count + 1
  where public.ai_system_daily_usage.request_count < p_daily_limit
  returning request_count into usage_count;

  if usage_count is null then
    return query select existing.id, coalesce(existing.status, 'failed'), fixture_revision, false,
      0, 'budget_exhausted'::text;
    return;
  end if;

  reserved_generation := gen_random_uuid();
  insert into public.ai_match_analyses (
    fixture_id, language, analysis_key, generation_id, status, source_updated_at,
    input_snapshot, prompt_version, trigger_key, result, error_code, model,
    generated_at, expires_at
  ) values (
    p_fixture_id, p_language, p_trigger_key, reserved_generation, 'queued', fixture_revision,
    p_input_snapshot, p_prompt_version, p_trigger_key, null, null, null,
    null, timezone('utc', now()) + interval '30 days'
  )
  on conflict (fixture_id, language, analysis_key) do update set
    generation_id = excluded.generation_id, status = 'queued',
    source_updated_at = excluded.source_updated_at, input_snapshot = excluded.input_snapshot,
    prompt_version = excluded.prompt_version, trigger_key = excluded.trigger_key,
    result = null, error_code = null, model = null, provider_response_id = null,
    input_tokens = null, output_tokens = null, generated_at = null,
    expires_at = excluded.expires_at
  returning id into reserved_id;

  event_key := 'ai-analysis:' || reserved_id::text || ':' || reserved_generation::text || ':v1';
  insert into app_private.outbox_events (topic, event_key, schema_version, payload)
  values (
    'ai-analysis', event_key, 1,
    jsonb_build_object(
      'schemaVersion', 1,
      'type', 'analyze-match',
      'analysisId', reserved_id,
      'generationId', reserved_generation,
      'fixtureId', p_fixture_id,
      'language', p_language,
      'sourceUpdatedAt', app_private.iso_utc(fixture_revision),
      'correlationId', gen_random_uuid(),
      'requestedAt', app_private.iso_utc(timezone('utc', now()))
    )
  );

  return query select reserved_id, 'queued'::text, fixture_revision, true,
    greatest(p_daily_limit - usage_count, 0), 'queued'::text;
end;
$$;

create function public.claim_ai_match_analysis(
  p_analysis_id uuid,
  p_generation_id uuid,
  p_source_updated_at timestamptz
)
returns table (input_snapshot jsonb)
language sql
security definer
set search_path = ''
as $$
  update public.ai_match_analyses analysis
  set status = 'running', error_code = null
  where analysis.id = p_analysis_id
    and analysis.generation_id = p_generation_id
    and analysis.source_updated_at = p_source_updated_at
    and (
      analysis.status in ('queued', 'failed')
      or (analysis.status = 'running'
        and analysis.updated_at < timezone('utc', now()) - interval '5 minutes')
    )
  returning analysis.input_snapshot;
$$;

create function public.claim_ai_comparison(
  p_comparison_id uuid,
  p_generation_id uuid,
  p_source_fingerprint text
)
returns table (
  entity_type text,
  language text,
  left_snapshot jsonb,
  right_snapshot jsonb
)
language sql
security definer
set search_path = ''
as $$
  update public.ai_comparisons comparison
  set status = 'running', error_code = null
  where comparison.id = p_comparison_id
    and comparison.generation_id = p_generation_id
    and comparison.source_fingerprint = p_source_fingerprint
    and (
      comparison.status in ('queued', 'failed')
      or (comparison.status = 'running'
        and comparison.updated_at < timezone('utc', now()) - interval '5 minutes')
    )
  returning comparison.entity_type, comparison.language,
    comparison.left_snapshot, comparison.right_snapshot;
$$;

create function public.get_pending_ai_outbox(p_limit integer default 20)
returns table (
  outbox_id uuid,
  event_key text,
  payload jsonb,
  publish_attempts integer
)
language sql
security definer
set search_path = ''
as $$
  select event.id, event.event_key, event.payload, event.publish_attempts
  from app_private.outbox_events event
  where event.topic = 'ai-analysis'
    and event.published_at is null
    and event.available_at <= timezone('utc', now())
  order by event.created_at
  limit least(greatest(p_limit, 1), 100);
$$;

create function public.mark_ai_outbox_published(p_outbox_id uuid, p_message_id text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update app_private.outbox_events
    set published_at = timezone('utc', now()), queue_message_id = p_message_id,
      publish_attempts = publish_attempts + 1, last_error = null
    where id = p_outbox_id and topic = 'ai-analysis' and published_at is null
    returning 1
  )
  select exists(select 1 from marked);
$$;

create function public.record_ai_outbox_publish_failure(p_outbox_id uuid, p_error_message text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update app_private.outbox_events
    set publish_attempts = publish_attempts + 1,
      last_error = left(p_error_message, 1000),
      available_at = timezone('utc', now()) +
        (least(900, greatest(15, power(2, least(publish_attempts + 1, 9))::integer * 5))
          * interval '1 second')
    where id = p_outbox_id and topic = 'ai-analysis' and published_at is null
    returning 1
  )
  select exists(select 1 from marked);
$$;

revoke all on function public.reserve_ai_match_analysis(
  bigint, uuid, text, text, integer, timestamptz, jsonb
) from public, anon, authenticated;
revoke all on function public.reserve_ai_comparison(
  uuid, text, bigint, bigint, text, text, integer, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.reserve_system_ai_match_analysis(
  bigint, text, text, text, integer, bigint[], timestamptz, jsonb
) from public, anon, authenticated;
revoke all on function public.claim_ai_match_analysis(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_ai_comparison(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_pending_ai_outbox(integer)
  from public, anon, authenticated;
revoke all on function public.mark_ai_outbox_published(uuid, text)
  from public, anon, authenticated;
revoke all on function public.record_ai_outbox_publish_failure(uuid, text)
  from public, anon, authenticated;

grant execute on function public.reserve_ai_match_analysis(
  bigint, uuid, text, text, integer, timestamptz, jsonb
) to service_role;
grant execute on function public.reserve_ai_comparison(
  uuid, text, bigint, bigint, text, text, integer, jsonb, jsonb
) to service_role;
grant execute on function public.reserve_system_ai_match_analysis(
  bigint, text, text, text, integer, bigint[], timestamptz, jsonb
) to service_role;
grant execute on function public.claim_ai_match_analysis(uuid, uuid, timestamptz)
  to service_role;
grant execute on function public.claim_ai_comparison(uuid, uuid, text)
  to service_role;
grant execute on function public.get_pending_ai_outbox(integer) to service_role;
grant execute on function public.mark_ai_outbox_published(uuid, text) to service_role;
grant execute on function public.record_ai_outbox_publish_failure(uuid, text) to service_role;

comment on function public.get_pending_ai_outbox(integer) is
  'Service-role-only dispatcher view over durable AI outbox records.';
comment on function public.claim_ai_match_analysis(uuid, uuid, timestamptz) is
  'Atomically claims a generation and returns its immutable canonical input snapshot.';

create or replace function public.run_auth_retention(p_scheduled_for timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_id uuid;
  revoked_count integer;
  audit_count integer;
  ai_count integer;
  comparison_count integer;
  usage_count integer;
  system_usage_count integer;
  outbox_count integer;
  processed_count integer;
  dead_letter_count integer;
begin
  insert into app_private.cron_executions (cron_name, scheduled_for, status, started_at)
  values ('auth-retention', p_scheduled_for, 'running', timezone('utc', now()))
  on conflict (cron_name, scheduled_for) do update
  set status = 'running', started_at = timezone('utc', now()), completed_at = null,
      error_message = null
  where app_private.cron_executions.status = 'failed'
  returning id into execution_id;

  if execution_id is null then
    return jsonb_build_object(
      'status', 'duplicate', 'revokedSessionsPurged', 0, 'auditRowsPurged', 0,
      'aiRowsPurged', 0, 'usageRowsPurged', 0, 'queueRowsPurged', 0
    );
  end if;

  delete from public.revoked_auth_sessions
  where expires_at < timezone('utc', now()) - interval '1 day';
  get diagnostics revoked_count = row_count;

  delete from public.account_deletion_audit
  where requested_at < timezone('utc', now()) - interval '180 days';
  get diagnostics audit_count = row_count;

  delete from public.ai_match_analyses where expires_at < timezone('utc', now());
  get diagnostics ai_count = row_count;
  delete from public.ai_comparisons where expires_at < timezone('utc', now());
  get diagnostics comparison_count = row_count;
  ai_count := ai_count + comparison_count;

  delete from public.ai_daily_usage
  where usage_date < (timezone('utc', now()))::date - 90;
  get diagnostics usage_count = row_count;
  delete from public.ai_system_daily_usage
  where usage_date < (timezone('utc', now()))::date - 90;
  get diagnostics system_usage_count = row_count;
  usage_count := usage_count + system_usage_count;

  delete from app_private.outbox_events
  where published_at < timezone('utc', now()) - interval '7 days';
  get diagnostics outbox_count = row_count;
  delete from app_private.processed_events
  where processed_at < timezone('utc', now()) - interval '90 days';
  get diagnostics processed_count = row_count;
  delete from app_private.dead_letter_events
  where created_at < timezone('utc', now()) - interval '90 days';
  get diagnostics dead_letter_count = row_count;

  update app_private.cron_executions
  set status = 'succeeded', completed_at = timezone('utc', now()) where id = execution_id;
  return jsonb_build_object(
    'status', 'succeeded', 'revokedSessionsPurged', revoked_count,
    'auditRowsPurged', audit_count, 'aiRowsPurged', ai_count,
    'usageRowsPurged', usage_count,
    'queueRowsPurged', outbox_count + processed_count + dead_letter_count
  );
exception when others then
  if execution_id is not null then
    update app_private.cron_executions
    set status = 'failed', completed_at = timezone('utc', now()), error_message = sqlerrm
    where id = execution_id;
  end if;
  return jsonb_build_object(
    'status', 'failed', 'error', sqlerrm, 'revokedSessionsPurged', 0,
    'auditRowsPurged', 0, 'aiRowsPurged', 0, 'usageRowsPurged', 0,
    'queueRowsPurged', 0
  );
end;
$$;

revoke all on function public.run_auth_retention(timestamptz) from public, anon, authenticated;
grant execute on function public.run_auth_retention(timestamptz) to service_role;

comment on function public.run_auth_retention(timestamptz) is
  'Daily retention for auth, AI application data, quota ledgers, and durable queue evidence.';
-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260816070000_phase5_community_notifications.sql
-- -----------------------------------------------------------------------------
create table public.user_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('team', 'player', 'league')),
  entity_id bigint not null check (entity_id > 0),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, entity_type, entity_id)
);

create index user_favorites_entity_idx
  on public.user_favorites (entity_type, entity_id, created_at desc);

create table public.match_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  fixture_id bigint not null references public.football_fixtures(sportmonks_id) on delete cascade,
  notifications_enabled boolean not null default true,
  live_alerts_during_quiet_hours boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, fixture_id)
);

create index match_follows_fixture_idx on public.match_follows (fixture_id, user_id);
create trigger match_follows_set_updated_at before update on public.match_follows
for each row execute function app_private.set_updated_at();

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kickoff_reminder boolean not null default true,
  goal boolean not null default true,
  halftime_fulltime boolean not null default true,
  red_card boolean not null default true,
  lineup boolean not null default true,
  substitution boolean not null default false,
  yellow_card boolean not null default false,
  ai_context boolean not null default true,
  news_breaking boolean not null default false,
  trending_news boolean not null default false,
  quiet_hours_enabled boolean not null default true,
  quiet_hours_start time not null default '22:30',
  quiet_hours_end time not null default '07:30',
  timezone text not null default 'Asia/Bangkok' check (char_length(timezone) between 1 and 64),
  allow_live_during_quiet_hours boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function app_private.set_updated_at();

insert into public.notification_preferences (user_id, timezone)
select user_id, timezone from public.profiles
on conflict (user_id) do nothing;

create function app_private.create_notification_preferences_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_preferences (user_id, timezone)
  values (new.user_id, new.timezone)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger profile_create_notification_preferences
after insert on public.profiles
for each row execute function app_private.create_notification_preferences_for_profile();

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique check (
    expo_push_token ~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$'
  ),
  platform text not null check (platform in ('ios', 'android')),
  device_timezone text not null check (char_length(device_timezone) between 1 and 64),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  invalidated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index push_devices_user_enabled_idx on public.push_devices (user_id) where enabled;
create trigger push_devices_set_updated_at before update on public.push_devices
for each row execute function app_private.set_updated_at();

create table public.fixture_fan_support (
  fixture_id bigint not null references public.football_fixtures(sportmonks_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id bigint not null references public.football_teams(sportmonks_id),
  expires_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (fixture_id, user_id)
);

create index fixture_fan_support_expiry_idx on public.fixture_fan_support (expires_at);
create index fixture_fan_support_fixture_team_idx
  on public.fixture_fan_support (fixture_id, team_id) where expires_at is not null;

create table public.fixture_fan_heatmap_totals (
  fixture_id bigint not null references public.football_fixtures(sportmonks_id) on delete cascade,
  team_id bigint not null references public.football_teams(sportmonks_id),
  supporters integer not null default 0 check (supporters >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (fixture_id, team_id)
);

create index fixture_fan_heatmap_totals_fixture_idx
  on public.fixture_fan_heatmap_totals (fixture_id, supporters desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in (
    'kickoff_reminder', 'goal', 'score_correction', 'halftime', 'fulltime', 'red_card',
    'lineup', 'substitution', 'yellow_card', 'ai_context', 'breaking_news', 'trending_news'
  )),
  fixture_id bigint references public.football_fixtures(sportmonks_id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 500),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  dedup_key text not null check (char_length(dedup_key) between 1 and 256),
  status text not null default 'pending' check (
    status in ('pending', 'queued', 'sending', 'sent', 'failed', 'suppressed')
  ),
  scheduled_for timestamptz not null default timezone('utc', now()),
  attempts integer not null default 0 check (attempts >= 0),
  error_code text,
  sent_at timestamptz,
  read_at timestamptz,
  expires_at timestamptz not null default timezone('utc', now()) + interval '30 days',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, dedup_key)
);

create index notifications_user_history_idx on public.notifications (user_id, created_at desc);
create index notifications_delivery_idx on public.notifications (status, scheduled_for)
  where status in ('pending', 'queued', 'failed');
create index notifications_retention_idx on public.notifications (expires_at);
create trigger notifications_set_updated_at before update on public.notifications
for each row execute function app_private.set_updated_at();

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  device_id uuid not null references public.push_devices(id) on delete cascade,
  expo_ticket_id text,
  ticket_status text not null check (ticket_status in ('ok', 'error')),
  receipt_status text check (receipt_status is null or receipt_status in ('ok', 'error')),
  error_code text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  receipt_checked_at timestamptz,
  unique (notification_id, device_id)
);

create index notification_deliveries_receipt_idx
  on public.notification_deliveries (created_at)
  where expo_ticket_id is not null and receipt_checked_at is null;

alter table public.user_favorites enable row level security;
alter table public.user_favorites force row level security;
alter table public.match_follows enable row level security;
alter table public.match_follows force row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;
alter table public.push_devices enable row level security;
alter table public.push_devices force row level security;
alter table public.fixture_fan_support enable row level security;
alter table public.fixture_fan_support force row level security;
alter table public.fixture_fan_heatmap_totals enable row level security;
alter table public.fixture_fan_heatmap_totals force row level security;
alter table public.notifications enable row level security;
alter table public.notifications force row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_deliveries force row level security;

revoke all on table public.user_favorites, public.match_follows,
  public.notification_preferences, public.push_devices, public.fixture_fan_support,
  public.notifications, public.notification_deliveries from anon, authenticated;
grant all on table public.user_favorites, public.match_follows,
  public.notification_preferences, public.push_devices, public.fixture_fan_support,
  public.notifications, public.notification_deliveries to service_role;

revoke all on table public.fixture_fan_heatmap_totals from anon, authenticated;
grant select on table public.fixture_fan_heatmap_totals to anon, authenticated;
grant all on table public.fixture_fan_heatmap_totals to service_role;

create policy "fixture_fan_heatmap_public_read"
on public.fixture_fan_heatmap_totals for select to anon, authenticated using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'fixture_fan_heatmap_totals'
    ) then
    alter publication supabase_realtime add table public.fixture_fan_heatmap_totals;
  end if;
end;
$$;

create function app_private.assert_favorite_entity(p_entity_type text, p_entity_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_entity_type = 'team' and exists (
    select 1 from public.football_teams where sportmonks_id = p_entity_id
  ) then return;
  elsif p_entity_type = 'player' and exists (
    select 1 from public.football_players where sportmonks_id = p_entity_id
  ) then return;
  elsif p_entity_type = 'league' and exists (
    select 1 from public.football_leagues where sportmonks_id = p_entity_id
  ) then return;
  end if;
  raise no_data_found using message = 'Favorite entity not found';
end;
$$;

create function public.set_user_favorite(
  p_user_id uuid, p_entity_type text, p_entity_id bigint, p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_entity_type not in ('team', 'player', 'league') or p_entity_id < 1 then
    raise exception 'Invalid favorite';
  end if;
  if p_active then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_user_id::text || ':favorites', 7215)
    );
    perform app_private.assert_favorite_entity(p_entity_type, p_entity_id);
    if not exists (
      select 1 from public.user_favorites
      where user_id = p_user_id and entity_type = p_entity_type and entity_id = p_entity_id
    ) and (select count(*) from public.user_favorites where user_id = p_user_id) >= 100 then
      raise exception using errcode = 'P0001', message = 'Favorite limit reached';
    end if;
    insert into public.user_favorites (user_id, entity_type, entity_id)
    values (p_user_id, p_entity_type, p_entity_id)
    on conflict do nothing;
  else
    delete from public.user_favorites
    where user_id = p_user_id and entity_type = p_entity_type and entity_id = p_entity_id;
  end if;
  return p_active;
end;
$$;

create function public.set_match_follow(
  p_user_id uuid,
  p_fixture_id bigint,
  p_active boolean,
  p_notifications_enabled boolean default true,
  p_live_alerts_during_quiet_hours boolean default false
)
returns table (
  fixture_id bigint,
  notifications_enabled boolean,
  live_alerts_during_quiet_hours boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_fixture_id < 1 then raise exception 'Invalid fixture'; end if;
  if p_active then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_user_id::text || ':follows', 7215)
    );
    if not exists (select 1 from public.football_fixtures where sportmonks_id = p_fixture_id) then
      raise no_data_found using message = 'Fixture not found';
    end if;
    if not exists (
      select 1 from public.match_follows existing_follow
      where existing_follow.user_id = p_user_id
        and existing_follow.fixture_id = p_fixture_id
    ) and (
      select count(*) from public.match_follows account_follow
      where account_follow.user_id = p_user_id
    ) >= 200 then
      raise exception using errcode = 'P0001', message = 'Match follow limit reached';
    end if;
    return query
    insert into public.match_follows as saved_follow (
      user_id, fixture_id, notifications_enabled, live_alerts_during_quiet_hours
    ) values (
      p_user_id, p_fixture_id, p_notifications_enabled, p_live_alerts_during_quiet_hours
    )
    on conflict on constraint match_follows_pkey do update set
      notifications_enabled = excluded.notifications_enabled,
      live_alerts_during_quiet_hours = excluded.live_alerts_during_quiet_hours
    returning saved_follow.fixture_id, saved_follow.notifications_enabled,
      saved_follow.live_alerts_during_quiet_hours, saved_follow.created_at,
      saved_follow.updated_at;
  else
    delete from public.match_follows as saved_follow
    where saved_follow.user_id = p_user_id and saved_follow.fixture_id = p_fixture_id;
    return;
  end if;
end;
$$;

create function public.get_personalized_fixture_ids(p_user_id uuid, p_limit integer default 20)
returns table (fixture_id bigint, reasons text[])
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select follow.fixture_id, 'followed_match'::text as reason
    from public.match_follows follow where follow.user_id = p_user_id
    union all
    select participant.fixture_id, 'favorite_team'
    from public.user_favorites favorite
    join public.football_fixture_participants participant
      on favorite.entity_type = 'team' and participant.team_id = favorite.entity_id
    where favorite.user_id = p_user_id
    union all
    select fixture.sportmonks_id, 'favorite_league'
    from public.user_favorites favorite
    join public.football_fixtures fixture
      on favorite.entity_type = 'league' and fixture.league_id = favorite.entity_id
    where favorite.user_id = p_user_id
    union all
    select lineup.fixture_id, 'favorite_player'
    from public.user_favorites favorite
    join public.football_fixture_lineups lineup
      on favorite.entity_type = 'player' and lineup.player_id = favorite.entity_id
    where favorite.user_id = p_user_id
  ), ranked as (
    select fixture.sportmonks_id as fixture_id,
      array_agg(distinct candidate.reason order by candidate.reason) as reasons,
      fixture.is_live, fixture.starts_at
    from candidates candidate
    join public.football_fixtures fixture on fixture.sportmonks_id = candidate.fixture_id
    where fixture.starts_at >= timezone('utc', now()) - interval '24 hours'
      and fixture.starts_at <= timezone('utc', now()) + interval '30 days'
    group by fixture.sportmonks_id, fixture.is_live, fixture.starts_at
  )
  select ranked.fixture_id, ranked.reasons
  from ranked
  order by ranked.is_live desc, ranked.starts_at, ranked.fixture_id
  limit least(greatest(p_limit, 1), 50);
$$;

create function app_private.refresh_fixture_fan_heatmap(p_fixture_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.fixture_fan_heatmap_totals (fixture_id, team_id, supporters, updated_at)
  select participant.fixture_id, participant.team_id,
    count(support.user_id) filter (where support.expires_at > timezone('utc', now()))::integer,
    timezone('utc', now())
  from public.football_fixture_participants participant
  left join public.fixture_fan_support support
    on support.fixture_id = participant.fixture_id and support.team_id = participant.team_id
  where participant.fixture_id = p_fixture_id
  group by participant.fixture_id, participant.team_id
  on conflict (fixture_id, team_id) do update set
    supporters = excluded.supporters, updated_at = excluded.updated_at;
$$;

create function public.cheer_for_fixture(
  p_user_id uuid, p_fixture_id bigint, p_team_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.football_fixture_participants participant
    join public.football_fixtures fixture on fixture.sportmonks_id = participant.fixture_id
    where participant.fixture_id = p_fixture_id and participant.team_id = p_team_id
      and fixture.starts_at between timezone('utc', now()) - interval '12 hours'
        and timezone('utc', now()) + interval '24 hours'
  ) then
    raise no_data_found using message = 'Team does not participate in this fixture';
  end if;
  insert into public.fixture_fan_support (fixture_id, user_id, team_id, expires_at)
  values (p_fixture_id, p_user_id, p_team_id, timezone('utc', now()) + interval '5 minutes')
  on conflict (fixture_id, user_id) do update set
    team_id = excluded.team_id, expires_at = excluded.expires_at,
    updated_at = timezone('utc', now());
  perform app_private.refresh_fixture_fan_heatmap(p_fixture_id);
end;
$$;

create function public.reconcile_fixture_fan_heatmaps()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture record;
  fixture_count integer := 0;
begin
  for fixture in
    select distinct fixture_id from public.fixture_fan_support
    union
    select distinct total.fixture_id
    from public.fixture_fan_heatmap_totals total
    join public.football_fixtures football_fixture
      on football_fixture.sportmonks_id = total.fixture_id
    where football_fixture.starts_at >= timezone('utc', now()) - interval '12 hours'
      and football_fixture.starts_at <= timezone('utc', now()) + interval '24 hours'
  loop
    perform app_private.refresh_fixture_fan_heatmap(fixture.fixture_id);
    fixture_count := fixture_count + 1;
  end loop;
  delete from public.fixture_fan_support where expires_at <= timezone('utc', now());
  delete from public.fixture_fan_heatmap_totals total
  using public.football_fixtures fixture_row
  where fixture_row.sportmonks_id = total.fixture_id
    and fixture_row.starts_at < timezone('utc', now()) - interval '24 hours';
  return fixture_count;
end;
$$;

create function app_private.notification_scheduled_for(
  p_preferences public.notification_preferences,
  p_follow public.match_follows,
  p_is_live boolean,
  p_reference_time timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  local_now timestamp;
  quiet_end_local timestamp;
begin
  if not p_preferences.quiet_hours_enabled
    or (p_is_live and (p_preferences.allow_live_during_quiet_hours
      or p_follow.live_alerts_during_quiet_hours)) then
    return p_reference_time;
  end if;
  local_now := timezone(p_preferences.timezone, p_reference_time);
  if p_preferences.quiet_hours_start < p_preferences.quiet_hours_end then
    if local_now::time >= p_preferences.quiet_hours_start
      and local_now::time < p_preferences.quiet_hours_end then
      quiet_end_local := local_now::date + p_preferences.quiet_hours_end;
    else return p_reference_time; end if;
  elsif local_now::time >= p_preferences.quiet_hours_start then
    quiet_end_local := local_now::date + interval '1 day' + p_preferences.quiet_hours_end;
  elsif local_now::time < p_preferences.quiet_hours_end then
    quiet_end_local := local_now::date + p_preferences.quiet_hours_end;
  else
    return p_reference_time;
  end if;
  return quiet_end_local at time zone p_preferences.timezone;
end;
$$;

create function app_private.notification_to_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app_private.outbox_events (
    topic, event_key, schema_version, payload, available_at
  ) values (
    'notifications',
    'notification:' || new.id::text || ':' || new.generation_id::text,
    1,
    jsonb_build_object(
      'schemaVersion', 1, 'type', 'send-notification',
      'notificationId', new.id, 'generationId', new.generation_id,
      'correlationId', gen_random_uuid(),
      'requestedAt', app_private.iso_utc(timezone('utc', now()))
    ),
    new.scheduled_for
  );
  return new;
end;
$$;

create trigger notification_create_outbox
after insert on public.notifications
for each row execute function app_private.notification_to_outbox();

create function app_private.delete_notification_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from app_private.outbox_events
  where topic = 'notifications' and published_at is null
    and (payload ->> 'notificationId')::uuid = old.id;
  return old;
end;
$$;

create trigger notification_delete_outbox
before delete on public.notifications
for each row execute function app_private.delete_notification_outbox();

create function public.stage_fixture_notifications(
  p_fixture_id bigint, p_user_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
  row_count_value integer;
begin
  insert into public.notifications (
    user_id, category, fixture_id, title, body, data, dedup_key, scheduled_for
  )
  select follow.user_id,
    case
      when upper(coalesce(event.type_code, '')) like '%GOAL%' and exists (
        select 1 from public.notifications previous
        where previous.user_id = follow.user_id
          and previous.fixture_id = fixture.sportmonks_id
          and previous.category in ('goal', 'score_correction')
          and previous.data ->> 'eventId' = event.sportmonks_id::text
          and coalesce(previous.data ->> 'result', '') <> coalesce(event.result, '')
      ) then 'score_correction'
      when upper(coalesce(event.type_code, '')) like '%GOAL%' then 'goal'
      when upper(coalesce(event.type_code, '')) like '%RED%' then 'red_card'
      when upper(coalesce(event.type_code, '')) like '%YELLOW%' then 'yellow_card'
      else 'substitution'
    end,
    fixture.sportmonks_id,
    case
      when upper(coalesce(event.type_code, '')) like '%GOAL%' and exists (
        select 1 from public.notifications previous
        where previous.user_id = follow.user_id
          and previous.fixture_id = fixture.sportmonks_id
          and previous.category in ('goal', 'score_correction')
          and previous.data ->> 'eventId' = event.sportmonks_id::text
          and coalesce(previous.data ->> 'result', '') <> coalesce(event.result, '')
      ) then 'แก้ไขสกอร์ · ' || fixture.name
      when upper(coalesce(event.type_code, '')) like '%GOAL%' then 'GOAL · ' || fixture.name
      when upper(coalesce(event.type_code, '')) like '%RED%' then 'ใบแดง · ' || fixture.name
      when upper(coalesce(event.type_code, '')) like '%YELLOW%' then 'ใบเหลือง · ' || fixture.name
      else 'เปลี่ยนตัว · ' || fixture.name
    end,
    concat_ws(' ', coalesce(event.player_name, event.type_name, 'Match update'),
      case when event.minute is not null then event.minute::text || '''' else null end,
      coalesce(event.result, '')),
    jsonb_build_object(
      'fixtureId', fixture.sportmonks_id, 'eventId', event.sportmonks_id,
      'result', event.result
    ),
    'fixture:' || fixture.sportmonks_id::text || ':event:' || event.sportmonks_id::text ||
      case when upper(coalesce(event.type_code, '')) like '%GOAL%'
        then ':result:' || coalesce(event.result, 'unknown') else '' end,
    app_private.notification_scheduled_for(preference, follow, fixture.is_live)
  from public.match_follows follow
  join public.notification_preferences preference on preference.user_id = follow.user_id
  join public.football_fixtures fixture on fixture.sportmonks_id = follow.fixture_id
  join public.football_fixture_events event on event.fixture_id = fixture.sportmonks_id
  where follow.fixture_id = p_fixture_id and follow.notifications_enabled
    and (p_user_ids is null or follow.user_id = any(p_user_ids))
    and (
      (upper(coalesce(event.type_code, '')) like '%GOAL%' and preference.goal)
      or (upper(coalesce(event.type_code, '')) like '%RED%' and preference.red_card)
      or (upper(coalesce(event.type_code, '')) like '%YELLOW%' and preference.yellow_card)
      or (upper(coalesce(event.type_code, '')) like '%SUBSTITUTION%' and preference.substitution)
    )
  on conflict (user_id, dedup_key) do nothing;
  get diagnostics row_count_value = row_count;
  inserted_count := inserted_count + row_count_value;

  insert into public.notifications (
    user_id, category, fixture_id, title, body, data, dedup_key, scheduled_for
  )
  select follow.user_id,
    case when upper(coalesce(fixture.state_code, '')) = 'HT' then 'halftime' else 'fulltime' end,
    fixture.sportmonks_id,
    case when upper(coalesce(fixture.state_code, '')) = 'HT'
      then 'พักครึ่ง · ' || fixture.name else 'จบเกม · ' || fixture.name end,
    coalesce(fixture.home_score, 0)::text || ' - ' || coalesce(fixture.away_score, 0)::text,
    jsonb_build_object('fixtureId', fixture.sportmonks_id),
    'fixture:' || fixture.sportmonks_id::text || ':state:' || upper(fixture.state_code),
    app_private.notification_scheduled_for(preference, follow, fixture.is_live)
  from public.match_follows follow
  join public.notification_preferences preference on preference.user_id = follow.user_id
  join public.football_fixtures fixture on fixture.sportmonks_id = follow.fixture_id
  where follow.fixture_id = p_fixture_id and follow.notifications_enabled
    and (p_user_ids is null or follow.user_id = any(p_user_ids))
    and preference.halftime_fulltime
    and upper(coalesce(fixture.state_code, '')) in ('HT', 'FT', 'AET', 'FT_PEN')
  on conflict (user_id, dedup_key) do nothing;
  get diagnostics row_count_value = row_count;
  inserted_count := inserted_count + row_count_value;

  insert into public.notifications (
    user_id, category, fixture_id, title, body, data, dedup_key, scheduled_for
  )
  select follow.user_id, 'lineup', fixture.sportmonks_id,
    'รายชื่อผู้เล่นพร้อมแล้ว', fixture.name,
    jsonb_build_object('fixtureId', fixture.sportmonks_id),
    'fixture:' || fixture.sportmonks_id::text || ':lineup',
    app_private.notification_scheduled_for(preference, follow, fixture.is_live)
  from public.match_follows follow
  join public.notification_preferences preference on preference.user_id = follow.user_id
  join public.football_fixtures fixture on fixture.sportmonks_id = follow.fixture_id
  where follow.fixture_id = p_fixture_id and follow.notifications_enabled and preference.lineup
    and (p_user_ids is null or follow.user_id = any(p_user_ids))
    and exists (
      select 1 from public.football_fixture_lineups lineup
      where lineup.fixture_id = fixture.sportmonks_id
    )
  on conflict (user_id, dedup_key) do nothing;
  get diagnostics row_count_value = row_count;
  inserted_count := inserted_count + row_count_value;

  insert into public.notifications (
    user_id, category, fixture_id, title, body, data, dedup_key, scheduled_for
  )
  select follow.user_id, 'kickoff_reminder', fixture.sportmonks_id,
    'อีก 15 นาทีเริ่มแข่ง', fixture.name,
    jsonb_build_object('fixtureId', fixture.sportmonks_id),
    'fixture:' || fixture.sportmonks_id::text || ':kickoff-reminder',
    app_private.notification_scheduled_for(preference, follow, false)
  from public.match_follows follow
  join public.notification_preferences preference on preference.user_id = follow.user_id
  join public.football_fixtures fixture on fixture.sportmonks_id = follow.fixture_id
  where follow.fixture_id = p_fixture_id and follow.notifications_enabled
    and preference.kickoff_reminder
    and (p_user_ids is null or follow.user_id = any(p_user_ids))
    and fixture.starts_at between timezone('utc', now()) + interval '14 minutes'
      and timezone('utc', now()) + interval '16 minutes'
  on conflict (user_id, dedup_key) do nothing;
  get diagnostics row_count_value = row_count;
  return inserted_count + row_count_value;
end;
$$;

create function public.get_due_notification_fanout_fixture_ids()
returns table (fixture_id bigint)
language sql
security definer
set search_path = ''
as $$
  select distinct follow.fixture_id
  from public.match_follows follow
  join public.football_fixtures fixture on fixture.sportmonks_id = follow.fixture_id
  where follow.notifications_enabled
    and fixture.starts_at between timezone('utc', now()) - interval '12 hours'
      and timezone('utc', now()) + interval '24 hours'
  order by follow.fixture_id
  limit 500;
$$;

create function public.stage_ai_context_notifications(
  p_fixture_id bigint,
  p_analysis_id uuid,
  p_body text,
  p_confidence numeric,
  p_user_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if p_confidence < 0.75 or char_length(trim(p_body)) < 1 then return 0; end if;
  insert into public.notifications (
    user_id, category, fixture_id, title, body, data, dedup_key, scheduled_for
  )
  select follow.user_id, 'ai_context', fixture.sportmonks_id,
    'AI Match Context · ' || fixture.name, left(trim(p_body), 500),
    jsonb_build_object('fixtureId', fixture.sportmonks_id, 'analysisId', p_analysis_id),
    'fixture:' || fixture.sportmonks_id::text || ':ai-context:' || p_analysis_id::text,
    app_private.notification_scheduled_for(preference, follow, fixture.is_live)
  from public.match_follows follow
  join public.notification_preferences preference on preference.user_id = follow.user_id
  join public.football_fixtures fixture on fixture.sportmonks_id = follow.fixture_id
  where follow.fixture_id = p_fixture_id and follow.notifications_enabled and preference.ai_context
    and (p_user_ids is null or follow.user_id = any(p_user_ids))
    and not exists (
      select 1 from public.notifications recent
      where recent.user_id = follow.user_id and recent.fixture_id = p_fixture_id
        and recent.category = 'ai_context'
        and recent.created_at >= timezone('utc', now()) - interval '15 minutes'
    )
    and (
      select count(*) from public.notifications per_match
      where per_match.user_id = follow.user_id and per_match.fixture_id = p_fixture_id
        and per_match.category = 'ai_context'
    ) < 3
  on conflict (user_id, dedup_key) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create function public.reconcile_due_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  heatmap_count integer;
begin
  select public.reconcile_fixture_fan_heatmaps() into heatmap_count;
  return jsonb_build_object('heatmaps', heatmap_count);
end;
$$;

create function public.get_pending_notification_outbox(p_limit integer default 100)
returns table (outbox_id uuid, event_key text, payload jsonb, publish_attempts integer)
language sql
security definer
set search_path = ''
as $$
  select event.id, event.event_key, event.payload, event.publish_attempts
  from app_private.outbox_events event
  where event.topic = 'notifications' and event.published_at is null
    and event.available_at <= timezone('utc', now())
  order by event.created_at
  limit least(greatest(p_limit, 1), 100);
$$;

create function public.mark_notification_outbox_published(p_outbox_id uuid, p_message_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_id uuid;
begin
  update app_private.outbox_events
  set published_at = timezone('utc', now()), queue_message_id = p_message_id,
    publish_attempts = publish_attempts + 1, last_error = null
  where id = p_outbox_id and topic = 'notifications' and published_at is null
  returning (payload ->> 'notificationId')::uuid into notification_id;
  if notification_id is null then return false; end if;
  update public.notifications set status = 'queued' where id = notification_id and status = 'pending';
  return true;
end;
$$;

create function public.record_notification_outbox_failure(p_outbox_id uuid, p_error_message text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update app_private.outbox_events
    set publish_attempts = publish_attempts + 1,
      last_error = left(p_error_message, 1000),
      available_at = timezone('utc', now()) +
        least(900, greatest(15, power(2, least(publish_attempts + 1, 9))::integer * 5))
          * interval '1 second'
    where id = p_outbox_id and topic = 'notifications' and published_at is null
    returning 1
  ) select exists(select 1 from marked);
$$;

create function public.claim_notification(p_notification_id uuid, p_generation_id uuid)
returns table (
  notification_id uuid, user_id uuid, category text, fixture_id bigint,
  title text, body text, data jsonb
)
language sql
security definer
set search_path = ''
as $$
  update public.notifications notification
  set status = 'sending', attempts = attempts + 1, error_code = null
  where notification.id = p_notification_id and notification.generation_id = p_generation_id
    and notification.scheduled_for <= timezone('utc', now())
    and (
      notification.status in ('queued', 'failed')
      or (notification.status = 'sending'
        and notification.updated_at < timezone('utc', now()) - interval '2 minutes')
    )
  returning notification.id, notification.user_id, notification.category,
    notification.fixture_id, notification.title, notification.body, notification.data;
$$;

create function public.record_notification_dead_letter(
  p_message_id text, p_idempotency_key text, p_payload jsonb,
  p_delivery_count integer, p_error_message text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app_private.dead_letter_events (
    topic, consumer_name, message_id, idempotency_key, payload,
    delivery_count, error_code, error_message
  ) values (
    'notifications', 'notifications-v1', p_message_id, p_idempotency_key, p_payload,
    p_delivery_count, 'NOTIFICATION_FAILED', left(p_error_message, 1000)
  ) on conflict (consumer_name, message_id) do nothing;
$$;

revoke all on function app_private.create_notification_preferences_for_profile() from public, anon, authenticated;
revoke all on function app_private.assert_favorite_entity(text, bigint) from public, anon, authenticated;
revoke all on function app_private.refresh_fixture_fan_heatmap(bigint) from public, anon, authenticated;
revoke all on function app_private.notification_scheduled_for(
  public.notification_preferences, public.match_follows, boolean, timestamptz
) from public, anon, authenticated;
revoke all on function app_private.notification_to_outbox() from public, anon, authenticated;
revoke all on function app_private.delete_notification_outbox() from public, anon, authenticated;

revoke all on function public.set_user_favorite(uuid, text, bigint, boolean) from public, anon, authenticated;
revoke all on function public.set_match_follow(uuid, bigint, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.get_personalized_fixture_ids(uuid, integer) from public, anon, authenticated;
revoke all on function public.cheer_for_fixture(uuid, bigint, bigint) from public, anon, authenticated;
revoke all on function public.reconcile_fixture_fan_heatmaps() from public, anon, authenticated;
revoke all on function public.stage_fixture_notifications(bigint, uuid[])
  from public, anon, authenticated;
revoke all on function public.get_due_notification_fanout_fixture_ids()
  from public, anon, authenticated;
revoke all on function public.stage_ai_context_notifications(bigint, uuid, text, numeric, uuid[])
  from public, anon, authenticated;
revoke all on function public.reconcile_due_notifications() from public, anon, authenticated;
revoke all on function public.get_pending_notification_outbox(integer) from public, anon, authenticated;
revoke all on function public.mark_notification_outbox_published(uuid, text) from public, anon, authenticated;
revoke all on function public.record_notification_outbox_failure(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_notification(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_notification_dead_letter(text, text, jsonb, integer, text)
  from public, anon, authenticated;

grant execute on function public.set_user_favorite(uuid, text, bigint, boolean) to service_role;
grant execute on function public.set_match_follow(uuid, bigint, boolean, boolean, boolean) to service_role;
grant execute on function public.get_personalized_fixture_ids(uuid, integer) to service_role;
grant execute on function public.cheer_for_fixture(uuid, bigint, bigint) to service_role;
grant execute on function public.reconcile_fixture_fan_heatmaps() to service_role;
grant execute on function public.stage_fixture_notifications(bigint, uuid[]) to service_role;
grant execute on function public.get_due_notification_fanout_fixture_ids() to service_role;
grant execute on function public.stage_ai_context_notifications(bigint, uuid, text, numeric, uuid[])
  to service_role;
grant execute on function public.reconcile_due_notifications() to service_role;
grant execute on function public.get_pending_notification_outbox(integer) to service_role;
grant execute on function public.mark_notification_outbox_published(uuid, text) to service_role;
grant execute on function public.record_notification_outbox_failure(uuid, text) to service_role;
grant execute on function public.claim_notification(uuid, uuid) to service_role;
grant execute on function public.record_notification_dead_letter(text, text, jsonb, integer, text)
  to service_role;

create function public.reschedule_user_notifications(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  with schedule as (
    select notification.id,
      app_private.notification_scheduled_for(preference, follow, fixture.is_live) as available_at
    from public.notifications notification
    join public.notification_preferences preference on preference.user_id = notification.user_id
    join public.match_follows follow
      on follow.user_id = notification.user_id and follow.fixture_id = notification.fixture_id
    join public.football_fixtures fixture on fixture.sportmonks_id = notification.fixture_id
    where notification.user_id = p_user_id
      and notification.status in ('pending', 'queued')
  )
  update public.notifications notification
  set scheduled_for = schedule.available_at, status = 'pending'
  from schedule where notification.id = schedule.id;
  get diagnostics changed_count = row_count;

  update app_private.outbox_events event
  set available_at = notification.scheduled_for
  from public.notifications notification
  where notification.user_id = p_user_id and notification.status = 'pending'
    and event.topic = 'notifications' and event.published_at is null
    and (event.payload ->> 'notificationId')::uuid = notification.id;

  insert into app_private.outbox_events (
    topic, event_key, schema_version, payload, available_at
  )
  select 'notifications',
    'notification:' || notification.id::text || ':' || notification.generation_id::text ||
      ':rescheduled:' || gen_random_uuid()::text,
    1,
    jsonb_build_object(
      'schemaVersion', 1, 'type', 'send-notification',
      'notificationId', notification.id, 'generationId', notification.generation_id,
      'correlationId', gen_random_uuid(),
      'requestedAt', app_private.iso_utc(timezone('utc', now()))
    ),
    notification.scheduled_for
  from public.notifications notification
  where notification.user_id = p_user_id and notification.status = 'pending'
    and not exists (
      select 1 from app_private.outbox_events event
      where event.topic = 'notifications' and event.published_at is null
        and (event.payload ->> 'notificationId')::uuid = notification.id
    );
  return changed_count;
end;
$$;

revoke all on function public.reschedule_user_notifications(uuid) from public, anon, authenticated;
grant execute on function public.reschedule_user_notifications(uuid) to service_role;

create function public.register_push_device(
  p_user_id uuid, p_expo_push_token text, p_platform text, p_timezone text
)
returns table (device_id uuid, device_platform text, device_enabled boolean, device_last_seen_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_device_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 7215)
  );
  insert into public.push_devices as device (
    user_id, expo_push_token, platform, device_timezone, enabled, invalidated_at, last_seen_at
  ) values (
    p_user_id, p_expo_push_token, p_platform, p_timezone, true, null, timezone('utc', now())
  )
  on conflict (expo_push_token) do update set
    user_id = excluded.user_id, platform = excluded.platform,
    device_timezone = excluded.device_timezone, enabled = true, invalidated_at = null,
    last_seen_at = timezone('utc', now())
  returning device.id into saved_device_id;

  update public.push_devices device set
    enabled = false, invalidated_at = timezone('utc', now())
  where device.id in (
    select ranked.id from (
      select candidate.id, row_number() over (
        order by candidate.last_seen_at desc, candidate.id
      ) as position
      from public.push_devices candidate
      where candidate.user_id = p_user_id and candidate.enabled
    ) ranked where ranked.position > 10
  );

  update public.notification_preferences preference
  set timezone = p_timezone
  where preference.user_id = p_user_id and preference.timezone <> p_timezone;
  perform public.reschedule_user_notifications(p_user_id);

  return query
  select device.id, device.platform, device.enabled, device.last_seen_at
  from public.push_devices device where device.id = saved_device_id;
end;
$$;

revoke all on function public.register_push_device(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_push_device(uuid, text, text, text) to service_role;

create or replace function public.run_auth_retention(p_scheduled_for timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_id uuid;
  revoked_count integer;
  audit_count integer;
  ai_count integer;
  comparison_count integer;
  usage_count integer;
  system_usage_count integer;
  outbox_count integer;
  processed_count integer;
  dead_letter_count integer;
  notification_count integer;
  device_count integer;
begin
  insert into app_private.cron_executions (cron_name, scheduled_for, status, started_at)
  values ('auth-retention', p_scheduled_for, 'running', timezone('utc', now()))
  on conflict (cron_name, scheduled_for) do update
  set status = 'running', started_at = timezone('utc', now()), completed_at = null,
      error_message = null
  where app_private.cron_executions.status = 'failed'
  returning id into execution_id;

  if execution_id is null then
    return jsonb_build_object(
      'status', 'duplicate', 'revokedSessionsPurged', 0, 'auditRowsPurged', 0,
      'aiRowsPurged', 0, 'usageRowsPurged', 0, 'queueRowsPurged', 0,
      'notificationRowsPurged', 0, 'deviceRowsPurged', 0
    );
  end if;

  delete from public.revoked_auth_sessions
  where expires_at < timezone('utc', now()) - interval '1 day';
  get diagnostics revoked_count = row_count;
  delete from public.account_deletion_audit
  where requested_at < timezone('utc', now()) - interval '180 days';
  get diagnostics audit_count = row_count;
  delete from public.ai_match_analyses where expires_at < timezone('utc', now());
  get diagnostics ai_count = row_count;
  delete from public.ai_comparisons where expires_at < timezone('utc', now());
  get diagnostics comparison_count = row_count;
  ai_count := ai_count + comparison_count;
  delete from public.ai_daily_usage
  where usage_date < (timezone('utc', now()))::date - 90;
  get diagnostics usage_count = row_count;
  delete from public.ai_system_daily_usage
  where usage_date < (timezone('utc', now()))::date - 90;
  get diagnostics system_usage_count = row_count;
  usage_count := usage_count + system_usage_count;
  delete from public.notifications where expires_at < timezone('utc', now());
  get diagnostics notification_count = row_count;
  delete from public.push_devices
  where not enabled and invalidated_at < timezone('utc', now()) - interval '30 days';
  get diagnostics device_count = row_count;
  perform public.reconcile_fixture_fan_heatmaps();
  delete from app_private.outbox_events
  where published_at < timezone('utc', now()) - interval '7 days';
  get diagnostics outbox_count = row_count;
  delete from app_private.processed_events
  where processed_at < timezone('utc', now()) - interval '90 days';
  get diagnostics processed_count = row_count;
  delete from app_private.dead_letter_events
  where created_at < timezone('utc', now()) - interval '90 days';
  get diagnostics dead_letter_count = row_count;

  update app_private.cron_executions
  set status = 'succeeded', completed_at = timezone('utc', now()) where id = execution_id;
  return jsonb_build_object(
    'status', 'succeeded', 'revokedSessionsPurged', revoked_count,
    'auditRowsPurged', audit_count, 'aiRowsPurged', ai_count,
    'usageRowsPurged', usage_count,
    'queueRowsPurged', outbox_count + processed_count + dead_letter_count,
    'notificationRowsPurged', notification_count, 'deviceRowsPurged', device_count
  );
exception when others then
  if execution_id is not null then
    update app_private.cron_executions
    set status = 'failed', completed_at = timezone('utc', now()), error_message = sqlerrm
    where id = execution_id;
  end if;
  return jsonb_build_object(
    'status', 'failed', 'error', sqlerrm, 'revokedSessionsPurged', 0,
    'auditRowsPurged', 0, 'aiRowsPurged', 0, 'usageRowsPurged', 0,
    'queueRowsPurged', 0, 'notificationRowsPurged', 0, 'deviceRowsPurged', 0
  );
end;
$$;

revoke all on function public.run_auth_retention(timestamptz) from public, anon, authenticated;
grant execute on function public.run_auth_retention(timestamptz) to service_role;

comment on table public.fixture_fan_heatmap_totals is
  'Anonymous five-minute supporter aggregates published through Supabase Realtime.';
comment on table public.notifications is
  'User-visible notification history and durable delivery state retained for 30 days.';
-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260816080000_phase6_news.sql
-- -----------------------------------------------------------------------------
create table public.news_articles (
  id uuid primary key default gen_random_uuid(),
  language text not null check (language in ('th', 'en')),
  topic_key text not null check (char_length(topic_key) between 1 and 160),
  category text not null check (
    category in ('breaking', 'injury', 'lineup', 'match', 'transfer', 'interview', 'general')
  ),
  headline text not null check (char_length(headline) between 1 and 240),
  summary text not null check (char_length(summary) between 1 and 1200),
  summary_bullets jsonb not null check (
    jsonb_typeof(summary_bullets) = 'array'
    and jsonb_array_length(summary_bullets) between 1 and 5
  ),
  primary_url text not null check (primary_url ~ '^https://'),
  source_fingerprint text not null check (char_length(source_fingerprint) = 64),
  source_count integer not null check (source_count between 1 and 10),
  importance integer not null check (importance between 0 and 100),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  is_breaking boolean not null default false,
  status text not null default 'published' check (status in ('published', 'retracted')),
  model text not null,
  search_response_id text not null,
  summary_response_id text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  discovered_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '90 days'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (language, source_fingerprint)
);

create index news_articles_feed_idx
  on public.news_articles (language, discovered_at desc, id desc)
  where status = 'published';
create index news_articles_category_idx
  on public.news_articles (language, category, discovered_at desc)
  where status = 'published';
create index news_articles_retention_idx on public.news_articles (expires_at);
create trigger news_articles_set_updated_at before update on public.news_articles
for each row execute function app_private.set_updated_at();

create table public.news_sources (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles(id) on delete cascade,
  position integer not null check (position between 1 and 10),
  url text not null check (url ~ '^https://'),
  title text not null check (char_length(title) between 1 and 300),
  domain text not null check (char_length(domain) between 1 and 253),
  created_at timestamptz not null default timezone('utc', now()),
  unique (article_id, url),
  unique (article_id, position)
);
create index news_sources_article_idx on public.news_sources (article_id, position);

create table public.news_entity_links (
  article_id uuid not null references public.news_articles(id) on delete cascade,
  entity_type text not null check (entity_type in ('team', 'player', 'league')),
  entity_id bigint not null check (entity_id > 0),
  relevance numeric(4, 3) not null check (relevance between 0 and 1),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (article_id, entity_type, entity_id)
);
create index news_entity_links_lookup_idx
  on public.news_entity_links (entity_type, entity_id, relevance desc, article_id);

create table public.news_engagements (
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references public.news_articles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, article_id)
);
create index news_engagements_article_idx on public.news_engagements (article_id, created_at desc);

create table public.news_system_daily_usage (
  usage_date date primary key default (timezone('utc', now()))::date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);
create trigger news_system_daily_usage_set_updated_at
before update on public.news_system_daily_usage
for each row execute function app_private.set_updated_at();

create table public.news_ingestion_runs (
  correlation_id uuid primary key,
  topic_key text not null check (char_length(topic_key) between 1 and 160),
  language text not null check (language in ('th', 'en')),
  status text not null check (status in ('running', 'completed', 'failed', 'budget_exhausted')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  article_count integer not null default 0 check (article_count >= 0),
  error_code text,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index news_ingestion_runs_status_idx
  on public.news_ingestion_runs (status, updated_at);
create trigger news_ingestion_runs_set_updated_at before update on public.news_ingestion_runs
for each row execute function app_private.set_updated_at();

alter table public.news_articles enable row level security;
alter table public.news_articles force row level security;
alter table public.news_sources enable row level security;
alter table public.news_sources force row level security;
alter table public.news_entity_links enable row level security;
alter table public.news_entity_links force row level security;
alter table public.news_engagements enable row level security;
alter table public.news_engagements force row level security;
alter table public.news_system_daily_usage enable row level security;
alter table public.news_system_daily_usage force row level security;
alter table public.news_ingestion_runs enable row level security;
alter table public.news_ingestion_runs force row level security;

revoke all on table public.news_articles, public.news_sources, public.news_entity_links,
  public.news_engagements, public.news_system_daily_usage, public.news_ingestion_runs
  from anon, authenticated;
grant all on table public.news_articles, public.news_sources, public.news_entity_links,
  public.news_engagements, public.news_system_daily_usage, public.news_ingestion_runs
  to service_role;

create function public.upsert_news_article(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  article_id_value uuid;
  source jsonb;
  entity jsonb;
begin
  if jsonb_typeof(p_payload -> 'sources') <> 'array'
    or jsonb_array_length(p_payload -> 'sources') not between 1 and 10
    or jsonb_typeof(p_payload -> 'summaryBullets') <> 'array'
    or jsonb_array_length(p_payload -> 'summaryBullets') not between 1 and 5 then
    raise exception 'Invalid news article payload';
  end if;

  insert into public.news_articles as article (
    language, topic_key, category, headline, summary, summary_bullets, primary_url,
    source_fingerprint, source_count, importance, confidence, is_breaking,
    model, search_response_id, summary_response_id, input_tokens, output_tokens,
    discovered_at, expires_at
  ) values (
    p_payload ->> 'language', p_payload ->> 'topicKey', p_payload ->> 'category',
    p_payload ->> 'headline', p_payload ->> 'summary', p_payload -> 'summaryBullets',
    p_payload ->> 'primaryUrl', p_payload ->> 'sourceFingerprint',
    jsonb_array_length(p_payload -> 'sources'), (p_payload ->> 'importance')::integer,
    (p_payload ->> 'confidence')::numeric, coalesce((p_payload ->> 'isBreaking')::boolean, false),
    p_payload ->> 'model', p_payload ->> 'searchResponseId', p_payload ->> 'summaryResponseId',
    coalesce((p_payload ->> 'inputTokens')::integer, 0),
    coalesce((p_payload ->> 'outputTokens')::integer, 0),
    coalesce((p_payload ->> 'discoveredAt')::timestamptz, timezone('utc', now())),
    timezone('utc', now()) + interval '90 days'
  )
  on conflict (language, source_fingerprint) do update set
    topic_key = excluded.topic_key, category = excluded.category,
    headline = excluded.headline, summary = excluded.summary,
    summary_bullets = excluded.summary_bullets, primary_url = excluded.primary_url,
    source_count = excluded.source_count, importance = greatest(article.importance, excluded.importance),
    confidence = excluded.confidence, is_breaking = article.is_breaking or excluded.is_breaking,
    status = 'published', model = excluded.model,
    search_response_id = excluded.search_response_id,
    summary_response_id = excluded.summary_response_id,
    input_tokens = article.input_tokens + excluded.input_tokens,
    output_tokens = article.output_tokens + excluded.output_tokens,
    expires_at = excluded.expires_at
  returning id into article_id_value;

  delete from public.news_sources where article_id = article_id_value;
  for source in select value from jsonb_array_elements(p_payload -> 'sources')
  loop
    if coalesce(source ->> 'url', '') !~ '^https://' then
      raise exception 'News sources must use HTTPS';
    end if;
    insert into public.news_sources (article_id, position, url, title, domain)
    values (
      article_id_value, (source ->> 'position')::integer, source ->> 'url',
      source ->> 'title', source ->> 'domain'
    );
  end loop;

  delete from public.news_entity_links where article_id = article_id_value;
  for entity in select value from jsonb_array_elements(coalesce(p_payload -> 'entities', '[]'::jsonb))
  loop
    perform app_private.assert_favorite_entity(entity ->> 'entityType', (entity ->> 'entityId')::bigint);
    insert into public.news_entity_links (article_id, entity_type, entity_id, relevance)
    values (
      article_id_value, entity ->> 'entityType', (entity ->> 'entityId')::bigint,
      (entity ->> 'relevance')::numeric
    );
  end loop;
  return article_id_value;
end;
$$;

create function public.get_personalized_news_ids(
  p_user_id uuid,
  p_language text default 'th',
  p_limit integer default 20
)
returns table (article_id uuid, reasons text[])
language sql
security definer
set search_path = ''
as $$
  with engagement as (
    select item.article_id, count(*)::integer as views
    from public.news_engagements item group by item.article_id
  ), ranked as (
    select article.id as article_id,
      coalesce(
        array_agg(distinct ('favorite_' || link.entity_type)::text)
          filter (where favorite.user_id is not null),
        array['trending']::text[]
      ) as reasons,
      count(favorite.user_id) as affinity,
      article.importance + least(coalesce(engagement.views, 0), 100) as score,
      article.discovered_at
    from public.news_articles article
    left join public.news_entity_links link on link.article_id = article.id
    left join public.user_favorites favorite
      on favorite.user_id = p_user_id and favorite.entity_type = link.entity_type
      and favorite.entity_id = link.entity_id
    left join engagement on engagement.article_id = article.id
    where article.status = 'published'
      and article.language = p_language
      and article.expires_at > timezone('utc', now())
    group by article.id, article.importance, article.discovered_at, engagement.views
  )
  select ranked.article_id, ranked.reasons from ranked
  order by ranked.affinity desc, ranked.score desc, ranked.discovered_at desc, ranked.article_id
  limit least(greatest(p_limit, 1), 50);
$$;

create function public.get_related_news_ids(
  p_fixture_id bigint,
  p_language text default 'th',
  p_limit integer default 8
)
returns table (article_id uuid)
language sql
security definer
set search_path = ''
as $$
  with fixture_entities as (
    select 'league'::text as entity_type, fixture.league_id as entity_id
    from public.football_fixtures fixture where fixture.sportmonks_id = p_fixture_id
    union
    select 'team', participant.team_id from public.football_fixture_participants participant
    where participant.fixture_id = p_fixture_id
    union
    select 'player', lineup.player_id from public.football_fixture_lineups lineup
    where lineup.fixture_id = p_fixture_id
  )
  select article.id
  from public.news_articles article
  join public.news_entity_links link on link.article_id = article.id
  join fixture_entities entity
    on entity.entity_type = link.entity_type and entity.entity_id = link.entity_id
    where article.status = 'published'
      and article.language = p_language
      and article.expires_at > timezone('utc', now())
  group by article.id, article.importance, article.discovered_at
  order by max(link.relevance) desc, article.importance desc, article.discovered_at desc, article.id
  limit least(greatest(p_limit, 1), 20);
$$;

create function public.get_trending_news_ids(p_language text, p_limit integer default 20)
returns table (article_id uuid)
language sql
security definer
set search_path = ''
as $$
  select article.id
  from public.news_articles article
  left join public.news_engagements engagement on engagement.article_id = article.id
  where article.language = p_language and article.status = 'published'
    and article.expires_at > timezone('utc', now())
    and article.discovered_at >= timezone('utc', now()) - interval '7 days'
  group by article.id, article.importance, article.source_count, article.discovered_at
  order by (
    article.importance + article.source_count * 5
    + least(count(engagement.user_id), 100) * 2
    - least(extract(epoch from (timezone('utc', now()) - article.discovered_at)) / 3600, 72)
  ) desc, article.discovered_at desc, article.id
  limit least(greatest(p_limit, 1), 50);
$$;

create function public.record_news_engagement(p_user_id uuid, p_article_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':news-engagement', 7215)
  );
  if not exists (
    select 1 from public.news_articles article
    where article.id = p_article_id and article.status = 'published'
  ) then
    raise no_data_found using message = 'News article not found';
  end if;
  if not exists (
    select 1 from public.news_engagements engagement
    where engagement.user_id = p_user_id and engagement.article_id = p_article_id
  ) and (
    select count(*) from public.news_engagements engagement
    where engagement.user_id = p_user_id
      and engagement.created_at >= date_trunc('day', timezone('utc', now()))
  ) >= 50 then
    raise exception using errcode = 'P0001', message = 'Daily news engagement limit reached';
  end if;
  insert into public.news_engagements (user_id, article_id)
  values (p_user_id, p_article_id) on conflict do nothing;
  return true;
end;
$$;

create function public.get_news_ingestion_topics(p_limit integer default 25)
returns table (
  topic_key text, query_text text, entity_type text, entity_id bigint, entity_name text,
  priority bigint
)
language sql
security definer
set search_path = ''
as $$
  with signals as (
    select favorite.entity_type, favorite.entity_id, count(*)::bigint * 10 as priority
    from public.user_favorites favorite
    group by favorite.entity_type, favorite.entity_id
    union all
    select 'team', participant.team_id, 5::bigint
    from public.football_fixture_participants participant
    join public.football_fixtures fixture on fixture.sportmonks_id = participant.fixture_id
    where fixture.starts_at between timezone('utc', now()) - interval '1 day'
      and timezone('utc', now()) + interval '7 days'
    union all
    select 'league', fixture.league_id, 3::bigint
    from public.football_fixtures fixture
    where fixture.starts_at between timezone('utc', now()) - interval '1 day'
      and timezone('utc', now()) + interval '7 days'
  ), aggregated as (
    select signals.entity_type, signals.entity_id, sum(signals.priority)::bigint as priority
    from signals group by signals.entity_type, signals.entity_id
  ), named as (
    select aggregated.entity_type, aggregated.entity_id, aggregated.priority,
      case aggregated.entity_type
        when 'team' then team.name
        when 'player' then player.display_name
        when 'league' then league.name
      end as entity_name
    from aggregated
    left join public.football_teams team
      on aggregated.entity_type = 'team' and team.sportmonks_id = aggregated.entity_id
    left join public.football_players player
      on aggregated.entity_type = 'player' and player.sportmonks_id = aggregated.entity_id
    left join public.football_leagues league
      on aggregated.entity_type = 'league' and league.sportmonks_id = aggregated.entity_id
  )
  select named.entity_type || ':' || named.entity_id::text,
    named.entity_name || ' football latest news injury transfer lineup interview',
    named.entity_type, named.entity_id, named.entity_name, named.priority
  from named where named.entity_name is not null
  order by named.priority desc, named.entity_type, named.entity_id
  limit least(greatest(p_limit, 1), 50);
$$;

create function public.reserve_news_ingestion(
  p_correlation_id uuid, p_topic_key text, p_language text, p_daily_limit integer
)
returns table (should_process boolean, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.news_ingestion_runs%rowtype;
  usage_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended((timezone('utc', now()))::date::text || ':news-budget', 7215)
  );
  select * into existing from public.news_ingestion_runs
  where correlation_id = p_correlation_id for update;
  if found then
    if existing.status = 'completed' then return query select false, 'completed'::text; return; end if;
    if existing.status = 'budget_exhausted' then
      return query select false, 'budget_exhausted'::text; return;
    end if;
    if existing.status = 'running'
      and existing.updated_at >= timezone('utc', now()) - interval '6 minutes' then
      return query select false, 'in_progress'::text; return;
    end if;
    update public.news_ingestion_runs set status = 'running', attempt_count = attempt_count + 1,
      error_code = null, started_at = timezone('utc', now()), completed_at = null
    where correlation_id = p_correlation_id;
    return query select true, 'retry'::text;
    return;
  end if;

  insert into public.news_system_daily_usage (usage_date, request_count)
  values ((timezone('utc', now()))::date, 1)
  on conflict (usage_date) do update
  set request_count = public.news_system_daily_usage.request_count + 1
  where public.news_system_daily_usage.request_count < p_daily_limit
  returning request_count into usage_count;

  if usage_count is null then
    insert into public.news_ingestion_runs (
      correlation_id, topic_key, language, status, completed_at
    ) values (
      p_correlation_id, p_topic_key, p_language, 'budget_exhausted', timezone('utc', now())
    );
    return query select false, 'budget_exhausted'::text;
    return;
  end if;
  insert into public.news_ingestion_runs (correlation_id, topic_key, language, status)
  values (p_correlation_id, p_topic_key, p_language, 'running');
  return query select true, 'claimed'::text;
end;
$$;

create function public.complete_news_ingestion(p_correlation_id uuid, p_article_count integer)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with completed as (
    update public.news_ingestion_runs set status = 'completed', article_count = p_article_count,
      completed_at = timezone('utc', now()), error_code = null
    where correlation_id = p_correlation_id and status = 'running' returning 1
  ) select exists(select 1 from completed);
$$;

create function public.fail_news_ingestion(p_correlation_id uuid, p_error_code text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with failed as (
    update public.news_ingestion_runs set status = 'failed', error_code = left(p_error_code, 120),
      completed_at = timezone('utc', now())
    where correlation_id = p_correlation_id and status = 'running' returning 1
  ) select exists(select 1 from failed);
$$;

create function public.is_news_ingestion_processed(p_message_id text, p_idempotency_key text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists(
    select 1 from app_private.processed_events event
    where event.consumer_name = 'news-ingestion-v1'
      and (event.message_id = p_message_id or event.idempotency_key = p_idempotency_key)
  );
$$;

create function public.record_news_ingestion_processed(
  p_message_id text, p_idempotency_key text, p_result jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app_private.processed_events (consumer_name, message_id, idempotency_key, result)
  values ('news-ingestion-v1', p_message_id, p_idempotency_key, p_result)
  on conflict do nothing;
$$;

create function public.record_news_ingestion_dead_letter(
  p_message_id text, p_idempotency_key text, p_payload jsonb,
  p_delivery_count integer, p_error_message text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app_private.dead_letter_events (
    topic, consumer_name, message_id, idempotency_key, payload,
    delivery_count, error_code, error_message
  ) values (
    'news-ingestion', 'news-ingestion-v1', p_message_id, p_idempotency_key, p_payload,
    p_delivery_count, 'NEWS_INGESTION_FAILED', left(p_error_message, 1000)
  ) on conflict (consumer_name, message_id) do nothing;
$$;

create function app_private.news_notification_scheduled_for(
  p_preferences public.notification_preferences,
  p_reference_time timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  local_now timestamp;
  quiet_end_local timestamp;
begin
  if not p_preferences.quiet_hours_enabled then return p_reference_time; end if;
  local_now := timezone(p_preferences.timezone, p_reference_time);
  if p_preferences.quiet_hours_start < p_preferences.quiet_hours_end then
    if local_now::time >= p_preferences.quiet_hours_start
      and local_now::time < p_preferences.quiet_hours_end then
      quiet_end_local := local_now::date + p_preferences.quiet_hours_end;
    else return p_reference_time; end if;
  elsif local_now::time >= p_preferences.quiet_hours_start then
    quiet_end_local := local_now::date + interval '1 day' + p_preferences.quiet_hours_end;
  elsif local_now::time < p_preferences.quiet_hours_end then
    quiet_end_local := local_now::date + p_preferences.quiet_hours_end;
  else return p_reference_time;
  end if;
  return quiet_end_local at time zone p_preferences.timezone;
end;
$$;

create function public.get_news_notification_user_ids(
  p_article_id uuid, p_after_user_id uuid default null, p_limit integer default 251
)
returns table (user_id uuid)
language sql
security definer
set search_path = ''
as $$
  select distinct favorite.user_id
  from public.news_articles article
  join public.news_entity_links link on link.article_id = article.id
  join public.user_favorites favorite
    on favorite.entity_type = link.entity_type and favorite.entity_id = link.entity_id
  join public.notification_preferences preference on preference.user_id = favorite.user_id
  where article.id = p_article_id and article.status = 'published'
    and (p_after_user_id is null or favorite.user_id > p_after_user_id)
    and (
      (article.is_breaking and article.importance >= 85 and preference.news_breaking)
      or (article.importance >= 90 and article.source_count >= 3 and preference.trending_news)
    )
  order by favorite.user_id
  limit least(greatest(p_limit, 1), 251);
$$;

create function public.stage_news_notifications(p_article_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  insert into public.notifications (
    user_id, category, fixture_id, title, body, data, dedup_key, scheduled_for
  )
  select candidate.user_id,
    case when article.is_breaking and article.importance >= 85
      then 'breaking_news' else 'trending_news' end,
    null,
    case when article.is_breaking and article.importance >= 85
      then 'ข่าวด่วนฟุตบอล' else 'ข่าวฟุตบอลมาแรง' end,
    article.headline,
    jsonb_build_object('articleId', article.id, 'url', article.primary_url),
    'news:' || article.id::text,
    app_private.news_notification_scheduled_for(preference)
  from public.news_articles article
  join lateral (
    select distinct favorite.user_id
    from public.news_entity_links link
    join public.user_favorites favorite
      on favorite.entity_type = link.entity_type and favorite.entity_id = link.entity_id
    where link.article_id = article.id and favorite.user_id = any(p_user_ids)
  ) candidate on true
  join public.notification_preferences preference on preference.user_id = candidate.user_id
  where article.id = p_article_id and article.status = 'published'
    and (
      (article.is_breaking and article.importance >= 85 and preference.news_breaking)
      or (article.importance >= 90 and article.source_count >= 3 and preference.trending_news)
    )
    and (
      select count(*) from public.notifications recent
      where recent.user_id = candidate.user_id
        and recent.category in ('breaking_news', 'trending_news')
        and recent.created_at >= date_trunc('day', timezone('utc', now()))
    ) < 2
  on conflict (user_id, dedup_key) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create function public.purge_expired_news()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.news_articles where expires_at < timezone('utc', now());
  get diagnostics deleted_count = row_count;
  delete from public.news_engagements
  where created_at < timezone('utc', now()) - interval '90 days';
  delete from public.news_ingestion_runs
  where created_at < timezone('utc', now()) - interval '30 days';
  delete from public.news_system_daily_usage
  where usage_date < (timezone('utc', now()))::date - 90;
  return deleted_count;
end;
$$;

revoke all on function app_private.news_notification_scheduled_for(
  public.notification_preferences, timestamptz
) from public, anon, authenticated;

revoke all on function public.upsert_news_article(jsonb) from public, anon, authenticated;
revoke all on function public.get_personalized_news_ids(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.get_related_news_ids(bigint, text, integer)
  from public, anon, authenticated;
revoke all on function public.get_trending_news_ids(text, integer) from public, anon, authenticated;
revoke all on function public.record_news_engagement(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_news_ingestion_topics(integer) from public, anon, authenticated;
revoke all on function public.reserve_news_ingestion(uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_news_ingestion(uuid, integer) from public, anon, authenticated;
revoke all on function public.fail_news_ingestion(uuid, text) from public, anon, authenticated;
revoke all on function public.is_news_ingestion_processed(text, text) from public, anon, authenticated;
revoke all on function public.record_news_ingestion_processed(text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.record_news_ingestion_dead_letter(text, text, jsonb, integer, text)
  from public, anon, authenticated;
revoke all on function public.get_news_notification_user_ids(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.stage_news_notifications(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.purge_expired_news() from public, anon, authenticated;

grant execute on function public.upsert_news_article(jsonb) to service_role;
grant execute on function public.get_personalized_news_ids(uuid, text, integer) to service_role;
grant execute on function public.get_related_news_ids(bigint, text, integer) to service_role;
grant execute on function public.get_trending_news_ids(text, integer) to service_role;
grant execute on function public.record_news_engagement(uuid, uuid) to service_role;
grant execute on function public.get_news_ingestion_topics(integer) to service_role;
grant execute on function public.reserve_news_ingestion(uuid, text, text, integer) to service_role;
grant execute on function public.complete_news_ingestion(uuid, integer) to service_role;
grant execute on function public.fail_news_ingestion(uuid, text) to service_role;
grant execute on function public.is_news_ingestion_processed(text, text) to service_role;
grant execute on function public.record_news_ingestion_processed(text, text, jsonb) to service_role;
grant execute on function public.record_news_ingestion_dead_letter(text, text, jsonb, integer, text)
  to service_role;
grant execute on function public.get_news_notification_user_ids(uuid, uuid, integer) to service_role;
grant execute on function public.stage_news_notifications(uuid, uuid[]) to service_role;
grant execute on function public.purge_expired_news() to service_role;
-- -----------------------------------------------------------------------------
-- Football lineup query index
-- -----------------------------------------------------------------------------
create index football_fixture_lineups_player_fixture_idx
  on public.football_fixture_lineups (player_id, fixture_id);
-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260817010000_caller_scoped_access.sql
-- -----------------------------------------------------------------------------
-- Expose only owner-scoped data and user-safe RPC wrappers to authenticated callers.
-- Cost-controlled AI reservations, ingestion, queues, retention, and account deletion
-- remain elevated server workflows.

grant select on table public.user_favorites to authenticated;
grant select on table public.match_follows to authenticated;
grant select on table public.notification_preferences to authenticated;
grant update (
  ai_context,
  allow_live_during_quiet_hours,
  goal,
  halftime_fulltime,
  kickoff_reminder,
  lineup,
  news_breaking,
  quiet_hours_enabled,
  quiet_hours_end,
  quiet_hours_start,
  red_card,
  substitution,
  timezone,
  trending_news,
  yellow_card
) on table public.notification_preferences to authenticated;
grant select on table public.notifications to authenticated;
grant select on table public.ai_comparisons to authenticated;

create policy "user_favorites_select_own"
on public.user_favorites for select to authenticated
using ((select auth.uid()) = user_id);

create policy "match_follows_select_own"
on public.match_follows for select to authenticated
using ((select auth.uid()) = user_id);

create policy "notification_preferences_select_own"
on public.notification_preferences for select to authenticated
using ((select auth.uid()) = user_id);

create policy "notification_preferences_update_own"
on public.notification_preferences for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "notifications_select_own"
on public.notifications for select to authenticated
using ((select auth.uid()) = user_id);

create policy "ai_comparisons_select_own"
on public.ai_comparisons for select to authenticated
using ((select auth.uid()) = user_id);

create function app_private.require_authenticated_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
begin
  if request_user_id is null then
    raise insufficient_privilege using message = 'Authenticated user is required';
  end if;
  return request_user_id;
end;
$$;

revoke all on function app_private.require_authenticated_user() from public, anon, authenticated;

create function public.set_my_favorite(
  p_entity_type text,
  p_entity_id bigint,
  p_active boolean
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.set_user_favorite(
    app_private.require_authenticated_user(),
    p_entity_type,
    p_entity_id,
    p_active
  );
$$;

create function public.set_my_match_follow(
  p_fixture_id bigint,
  p_active boolean,
  p_notifications_enabled boolean default true,
  p_live_alerts_during_quiet_hours boolean default false
)
returns table (
  fixture_id bigint,
  notifications_enabled boolean,
  live_alerts_during_quiet_hours boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select *
  from public.set_match_follow(
    app_private.require_authenticated_user(),
    p_fixture_id,
    p_active,
    p_notifications_enabled,
    p_live_alerts_during_quiet_hours
  );
$$;

create function public.get_my_personalized_fixture_ids(p_limit integer default 20)
returns table (fixture_id bigint, reasons text[])
language sql
security definer
set search_path = ''
as $$
  select *
  from public.get_personalized_fixture_ids(
    app_private.require_authenticated_user(),
    p_limit
  );
$$;

create function public.cheer_for_my_fixture(p_fixture_id bigint, p_team_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.cheer_for_fixture(
    app_private.require_authenticated_user(),
    p_fixture_id,
    p_team_id
  );
$$;

create function public.reschedule_my_notifications()
returns integer
language sql
security definer
set search_path = ''
as $$
  select public.reschedule_user_notifications(app_private.require_authenticated_user());
$$;

create function public.register_my_push_device(
  p_expo_push_token text,
  p_platform text,
  p_timezone text
)
returns table (
  device_id uuid,
  device_platform text,
  device_enabled boolean,
  device_last_seen_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select *
  from public.register_push_device(
    app_private.require_authenticated_user(),
    p_expo_push_token,
    p_platform,
    p_timezone
  );
$$;

create function public.disable_my_push_device(p_device_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  disabled_device_id uuid;
begin
  update public.push_devices
  set enabled = false, invalidated_at = timezone('utc', now())
  where id = p_device_id
    and user_id = app_private.require_authenticated_user()
  returning id into disabled_device_id;

  if disabled_device_id is null then
    raise no_data_found using message = 'Push device not found';
  end if;
  return disabled_device_id;
end;
$$;

create function public.get_my_personalized_news_ids(
  p_language text default 'th',
  p_limit integer default 20
)
returns table (article_id uuid, reasons text[])
language sql
security definer
set search_path = ''
as $$
  select *
  from public.get_personalized_news_ids(
    app_private.require_authenticated_user(),
    p_language,
    p_limit
  );
$$;

create function public.record_my_news_engagement(p_article_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.record_news_engagement(
    app_private.require_authenticated_user(),
    p_article_id
  );
$$;

revoke all on function public.set_my_favorite(text, bigint, boolean) from public, anon;
revoke all on function public.set_my_match_follow(bigint, boolean, boolean, boolean)
  from public, anon;
revoke all on function public.get_my_personalized_fixture_ids(integer) from public, anon;
revoke all on function public.cheer_for_my_fixture(bigint, bigint) from public, anon;
revoke all on function public.reschedule_my_notifications() from public, anon;
revoke all on function public.register_my_push_device(text, text, text) from public, anon;
revoke all on function public.disable_my_push_device(uuid) from public, anon;
revoke all on function public.get_my_personalized_news_ids(text, integer) from public, anon;
revoke all on function public.record_my_news_engagement(uuid) from public, anon;

grant execute on function public.set_my_favorite(text, bigint, boolean) to authenticated;
grant execute on function public.set_my_match_follow(bigint, boolean, boolean, boolean)
  to authenticated;
grant execute on function public.get_my_personalized_fixture_ids(integer) to authenticated;
grant execute on function public.cheer_for_my_fixture(bigint, bigint) to authenticated;
grant execute on function public.reschedule_my_notifications() to authenticated;
grant execute on function public.register_my_push_device(text, text, text) to authenticated;
grant execute on function public.disable_my_push_device(uuid) to authenticated;
grant execute on function public.get_my_personalized_news_ids(text, integer) to authenticated;
grant execute on function public.record_my_news_engagement(uuid) to authenticated;
-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260821010000_sportmonks_v3_live_states.sql
-- -----------------------------------------------------------------------------
create or replace function app_private.set_football_fixture_live_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Sportmonks Football API v3 state IDs. Break states remain part of the
  -- ongoing match experience even though the ball is not currently in play.
  new.is_live := new.state_id in (2, 3, 4, 6, 9, 21, 22, 25);
  return new;
end;
$$;

drop trigger if exists football_fixtures_live_state_from_provider
on public.football_fixtures;

create trigger football_fixtures_live_state_from_provider
before insert or update of state_id on public.football_fixtures
for each row execute function app_private.set_football_fixture_live_state();

update public.football_fixtures
set is_live = state_id in (2, 3, 4, 6, 9, 21, 22, 25)
where is_live is distinct from (state_id in (2, 3, 4, 6, 9, 21, 22, 25));

revoke all on function app_private.set_football_fixture_live_state() from public, anon, authenticated;
-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260821011000_sportmonks_advanced_metrics.sql
-- -----------------------------------------------------------------------------
create table public.football_fixture_pressure (
  sportmonks_id bigint primary key check (sportmonks_id > 0),
  fixture_id bigint not null references public.football_fixtures(sportmonks_id) on delete cascade,
  team_id bigint not null references public.football_teams(sportmonks_id),
  period_id bigint,
  minute smallint not null check (minute >= 0),
  extra_minute smallint check (extra_minute is null or extra_minute >= 0),
  pressure numeric not null
);

create index football_fixture_pressure_fixture_idx
  on public.football_fixture_pressure (fixture_id, minute, extra_minute);
alter table public.football_fixture_pressure enable row level security;
alter table public.football_fixture_pressure force row level security;
revoke all on table public.football_fixture_pressure from anon, authenticated;
grant select on table public.football_fixture_pressure to anon, authenticated;
grant all on table public.football_fixture_pressure to service_role;
create policy football_fixture_pressure_public_read on public.football_fixture_pressure
for select to anon, authenticated using (true);

create or replace function public.ingest_sportmonks_fixture_v2(payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_identifier bigint;
  item jsonb;
begin
  fixture_identifier := public.ingest_sportmonks_fixture(payload);

  delete from public.football_fixture_statistics where fixture_id = fixture_identifier;
  for item in select value from jsonb_array_elements(coalesce(payload -> 'statistics', '[]'::jsonb))
  loop
    if nullif(item ->> 'participant_id', '') is not null then
      insert into public.football_fixture_statistics (
        sportmonks_id, fixture_id, team_id, type_id, type_name, type_code, value
      ) values (
        (item ->> 'id')::bigint,
        fixture_identifier,
        (item ->> 'participant_id')::bigint,
        (item ->> 'type_id')::bigint,
        nullif(item #>> '{type,name}', ''),
        nullif(item #>> '{type,developer_name}', ''),
        coalesce(item #> '{data,value}', item -> 'value', 'null'::jsonb)
      );
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(payload -> 'expected', '[]'::jsonb))
  loop
    if nullif(item ->> 'participant_id', '') is not null then
      insert into public.football_fixture_statistics (
        sportmonks_id, fixture_id, team_id, type_id, type_name, type_code, value
      ) values (
        (item ->> 'id')::bigint,
        fixture_identifier,
        (item ->> 'participant_id')::bigint,
        (item ->> 'type_id')::bigint,
        case (item ->> 'type_id')::bigint
          when 5304 then 'Expected Goals (xG)'
          when 5305 then 'Expected Goals on Target (xGoT)'
          else 'Expected metric'
        end,
        case (item ->> 'type_id')::bigint
          when 5304 then 'EXPECTED_GOALS'
          when 5305 then 'EXPECTED_GOALS_ON_TARGET'
          else 'EXPECTED_METRIC'
        end,
        coalesce(item #> '{data,value}', 'null'::jsonb)
      );
    end if;
  end loop;

  delete from public.football_fixture_pressure where fixture_id = fixture_identifier;
  for item in select value from jsonb_array_elements(coalesce(payload -> 'pressure', '[]'::jsonb))
  loop
    if nullif(item ->> 'participant_id', '') is not null then
      insert into public.football_fixture_pressure (
        sportmonks_id, fixture_id, team_id, period_id, minute, extra_minute, pressure
      ) values (
        (item ->> 'id')::bigint,
        fixture_identifier,
        (item ->> 'participant_id')::bigint,
        nullif(item ->> 'period_id', '')::bigint,
        (item ->> 'minute')::smallint,
        nullif(item ->> 'extra_minute', '')::smallint,
        (item ->> 'pressure')::numeric
      );
    end if;
  end loop;

  return fixture_identifier;
end;
$$;

revoke all on function public.ingest_sportmonks_fixture_v2(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_sportmonks_fixture_v2(jsonb) to service_role;
-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260821012000_preserve_pressure_on_live_delta.sql
-- -----------------------------------------------------------------------------
create or replace function public.ingest_sportmonks_fixture_v2(payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_identifier bigint;
  item jsonb;
begin
  fixture_identifier := public.ingest_sportmonks_fixture(payload);

  delete from public.football_fixture_statistics where fixture_id = fixture_identifier;
  for item in select value from jsonb_array_elements(coalesce(payload -> 'statistics', '[]'::jsonb))
  loop
    if nullif(item ->> 'participant_id', '') is not null then
      insert into public.football_fixture_statistics (
        sportmonks_id, fixture_id, team_id, type_id, type_name, type_code, value
      ) values (
        (item ->> 'id')::bigint,
        fixture_identifier,
        (item ->> 'participant_id')::bigint,
        (item ->> 'type_id')::bigint,
        nullif(item #>> '{type,name}', ''),
        nullif(item #>> '{type,developer_name}', ''),
        coalesce(item #> '{data,value}', item -> 'value', 'null'::jsonb)
      );
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(payload -> 'expected', '[]'::jsonb))
  loop
    if nullif(item ->> 'participant_id', '') is not null then
      insert into public.football_fixture_statistics (
        sportmonks_id, fixture_id, team_id, type_id, type_name, type_code, value
      ) values (
        (item ->> 'id')::bigint,
        fixture_identifier,
        (item ->> 'participant_id')::bigint,
        (item ->> 'type_id')::bigint,
        case (item ->> 'type_id')::bigint
          when 5304 then 'Expected Goals (xG)'
          when 5305 then 'Expected Goals on Target (xGoT)'
          else 'Expected metric'
        end,
        case (item ->> 'type_id')::bigint
          when 5304 then 'EXPECTED_GOALS'
          when 5305 then 'EXPECTED_GOALS_ON_TARGET'
          else 'EXPECTED_METRIC'
        end,
        coalesce(item #> '{data,value}', 'null'::jsonb)
      );
    end if;
  end loop;

  if payload ? 'pressure' then
    delete from public.football_fixture_pressure where fixture_id = fixture_identifier;
    for item in select value from jsonb_array_elements(coalesce(payload -> 'pressure', '[]'::jsonb))
    loop
      if nullif(item ->> 'participant_id', '') is not null then
        insert into public.football_fixture_pressure (
          sportmonks_id, fixture_id, team_id, period_id, minute, extra_minute, pressure
        ) values (
          (item ->> 'id')::bigint,
          fixture_identifier,
          (item ->> 'participant_id')::bigint,
          nullif(item ->> 'period_id', '')::bigint,
          (item ->> 'minute')::smallint,
          nullif(item ->> 'extra_minute', '')::smallint,
          (item ->> 'pressure')::numeric
        );
      end if;
    end loop;
  end if;

  return fixture_identifier;
end;
$$;

revoke all on function public.ingest_sportmonks_fixture_v2(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_sportmonks_fixture_v2(jsonb) to service_role;
-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260907100000_ai_compare_sportmonks_source.sql
-- -----------------------------------------------------------------------------
-- Comparison identities are resolved from Sportmonks at request time. The database
-- stores immutable AI evidence and job state, but is not the provider catalog source
-- of truth. Validate server-provided snapshots instead of requiring local catalog rows.
create or replace function public.reserve_ai_comparison(
  p_user_id uuid,
  p_entity_type text,
  p_left_id bigint,
  p_right_id bigint,
  p_language text,
  p_prompt_version text,
  p_daily_limit integer,
  p_left_snapshot jsonb,
  p_right_snapshot jsonb
)
returns table (
  comparison_id uuid,
  comparison_status text,
  source_fingerprint text,
  should_enqueue boolean,
  quota_remaining integer,
  reservation_outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  fingerprint text;
  existing public.ai_comparisons%rowtype;
  usage_count integer;
  reserved_id uuid;
  reserved_generation uuid;
  event_key text;
begin
  if p_entity_type not in ('team', 'player') or p_language not in ('th', 'en')
    or p_left_id = p_right_id or p_daily_limit < 1
    or jsonb_typeof(p_left_snapshot) <> 'object'
    or jsonb_typeof(p_right_snapshot) <> 'object' then
    raise exception 'Invalid AI comparison request';
  end if;

  if p_entity_type = 'team' then
    if nullif(p_left_snapshot #>> '{team,id}', '')::bigint is distinct from p_left_id
      or nullif(p_right_snapshot #>> '{team,id}', '')::bigint is distinct from p_right_id then
      raise no_data_found using message = 'Comparison entity not found';
    end if;
  else
    if nullif(p_left_snapshot #>> '{player,id}', '')::bigint is distinct from p_left_id
      or nullif(p_right_snapshot #>> '{player,id}', '')::bigint is distinct from p_right_id then
      raise no_data_found using message = 'Comparison entity not found';
    end if;
  end if;

  fingerprint := md5(
    p_entity_type || ':' || p_prompt_version || ':' ||
    p_left_snapshot::text || ':' || p_right_snapshot::text
  );

  select * into existing from public.ai_comparisons
  where user_id = p_user_id and entity_type = p_entity_type and left_id = p_left_id
    and right_id = p_right_id and language = p_language for update;

  if found and existing.source_fingerprint = fingerprint
    and existing.prompt_version = p_prompt_version
    and existing.status in ('queued', 'running', 'completed') then
    select coalesce(request_count, 0) into usage_count from public.ai_daily_usage
    where user_id = p_user_id and usage_date = (timezone('utc', now()))::date;
    return query select existing.id, existing.status, fingerprint, false,
      greatest(p_daily_limit - coalesce(usage_count, 0), 0), 'reused'::text;
    return;
  end if;

  usage_count := null;
  insert into public.ai_daily_usage (user_id, usage_date, request_count)
  values (p_user_id, (timezone('utc', now()))::date, 1)
  on conflict (user_id, usage_date) do update
  set request_count = public.ai_daily_usage.request_count + 1
  where public.ai_daily_usage.request_count < p_daily_limit
  returning request_count into usage_count;

  if usage_count is null then
    return query select existing.id, coalesce(existing.status, 'failed'), fingerprint, false,
      0, 'quota_exhausted'::text;
    return;
  end if;

  reserved_generation := gen_random_uuid();
  insert into public.ai_comparisons (
    user_id, entity_type, left_id, right_id, language, generation_id, status,
    source_fingerprint, left_snapshot, right_snapshot, prompt_version, expires_at
  ) values (
    p_user_id, p_entity_type, p_left_id, p_right_id, p_language, reserved_generation, 'queued',
    fingerprint, p_left_snapshot, p_right_snapshot, p_prompt_version,
    timezone('utc', now()) + interval '30 days'
  ) on conflict (user_id, entity_type, left_id, right_id, language) do update set
    generation_id = excluded.generation_id, status = 'queued',
    source_fingerprint = excluded.source_fingerprint,
    left_snapshot = excluded.left_snapshot, right_snapshot = excluded.right_snapshot,
    prompt_version = excluded.prompt_version, model = null, provider_response_id = null,
    input_tokens = null, output_tokens = null, result = null, error_code = null,
    expires_at = excluded.expires_at
  returning id into reserved_id;

  event_key := 'ai-comparison:' || reserved_id::text || ':' || reserved_generation::text || ':v1';
  insert into app_private.outbox_events (topic, event_key, schema_version, payload)
  values (
    'ai-analysis', event_key, 1,
    jsonb_build_object(
      'schemaVersion', 1,
      'type', 'compare-entities',
      'comparisonId', reserved_id,
      'generationId', reserved_generation,
      'entityType', p_entity_type,
      'leftId', p_left_id,
      'rightId', p_right_id,
      'language', p_language,
      'sourceFingerprint', fingerprint,
      'correlationId', gen_random_uuid(),
      'requestedAt', app_private.iso_utc(timezone('utc', now()))
    )
  );

  return query select reserved_id, 'queued'::text, fingerprint, true,
    greatest(p_daily_limit - usage_count, 0), 'queued'::text;
end;
$$;

revoke all on function public.reserve_ai_comparison(
  uuid, text, bigint, bigint, text, text, integer, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.reserve_ai_comparison(
  uuid, text, bigint, bigint, text, text, integer, jsonb, jsonb
) to service_role;

comment on function public.reserve_ai_comparison(
  uuid, text, bigint, bigint, text, text, integer, jsonb, jsonb
) is 'Reserves AI comparison work from server-fetched Sportmonks snapshots without requiring a duplicated local provider catalog.';
-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260907110000_provider_entity_ownership.sql
-- -----------------------------------------------------------------------------
-- Sportmonks owns league/team/player identity. Supabase stores Goal-owned relations
-- and normalized match snapshots, but must not reject valid provider IDs merely
-- because a fixture containing that entity has not been ingested locally yet.

create or replace function public.set_user_favorite(
  p_user_id uuid, p_entity_type text, p_entity_id bigint, p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_entity_type not in ('team', 'player', 'league') or p_entity_id < 1 then
    raise exception 'Invalid favorite';
  end if;
  if p_active then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_user_id::text || ':favorites', 7215)
    );
    if not exists (
      select 1 from public.user_favorites
      where user_id = p_user_id and entity_type = p_entity_type and entity_id = p_entity_id
    ) and (select count(*) from public.user_favorites where user_id = p_user_id) >= 100 then
      raise exception using errcode = 'P0001', message = 'Favorite limit reached';
    end if;
    insert into public.user_favorites (user_id, entity_type, entity_id)
    values (p_user_id, p_entity_type, p_entity_id)
    on conflict do nothing;
  else
    delete from public.user_favorites
    where user_id = p_user_id and entity_type = p_entity_type and entity_id = p_entity_id;
  end if;
  return p_active;
end;
$$;

-- Only the API service may mutate favorites, after it validates IDs against
-- Sportmonks. This prevents a client from bypassing provider validation.
revoke all on function public.set_my_favorite(text, bigint, boolean)
  from public, anon, authenticated;
revoke all on function public.set_user_favorite(uuid, text, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.set_user_favorite(uuid, text, bigint, boolean)
  to service_role;

create or replace function public.get_news_ingestion_topics(p_limit integer default 25)
returns table (
  topic_key text, query_text text, entity_type text, entity_id bigint, entity_name text,
  priority bigint
)
language sql
security definer
set search_path = ''
as $$
  with signals as (
    select favorite.entity_type, favorite.entity_id, count(*)::bigint * 10 as priority
    from public.user_favorites favorite
    group by favorite.entity_type, favorite.entity_id
    union all
    select 'team', participant.team_id, 5::bigint
    from public.football_fixture_participants participant
    join public.football_fixtures fixture on fixture.sportmonks_id = participant.fixture_id
    where fixture.starts_at between timezone('utc', now()) - interval '1 day'
      and timezone('utc', now()) + interval '7 days'
    union all
    select 'league', fixture.league_id, 3::bigint
    from public.football_fixtures fixture
    where fixture.starts_at between timezone('utc', now()) - interval '1 day'
      and timezone('utc', now()) + interval '7 days'
  ), aggregated as (
    select signals.entity_type, signals.entity_id, sum(signals.priority)::bigint as priority
    from signals
    where signals.entity_type in ('team', 'player', 'league') and signals.entity_id > 0
    group by signals.entity_type, signals.entity_id
  )
  select aggregated.entity_type || ':' || aggregated.entity_id::text,
    null::text, aggregated.entity_type, aggregated.entity_id, null::text,
    aggregated.priority
  from aggregated
  order by aggregated.priority desc, aggregated.entity_type, aggregated.entity_id
  limit least(greatest(p_limit, 1), 50);
$$;

create or replace function public.upsert_news_article(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  article_id_value uuid;
  source jsonb;
  entity jsonb;
  entity_type_value text;
  entity_id_value bigint;
  relevance_value numeric;
begin
  if jsonb_typeof(p_payload -> 'sources') <> 'array'
    or jsonb_array_length(p_payload -> 'sources') not between 1 and 10
    or jsonb_typeof(p_payload -> 'summaryBullets') <> 'array'
    or jsonb_array_length(p_payload -> 'summaryBullets') not between 1 and 5
    or jsonb_typeof(coalesce(p_payload -> 'entities', '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid news article payload';
  end if;

  insert into public.news_articles as article (
    language, topic_key, category, headline, summary, summary_bullets, primary_url,
    source_fingerprint, source_count, importance, confidence, is_breaking,
    model, search_response_id, summary_response_id, input_tokens, output_tokens,
    discovered_at, expires_at
  ) values (
    p_payload ->> 'language', p_payload ->> 'topicKey', p_payload ->> 'category',
    p_payload ->> 'headline', p_payload ->> 'summary', p_payload -> 'summaryBullets',
    p_payload ->> 'primaryUrl', p_payload ->> 'sourceFingerprint',
    jsonb_array_length(p_payload -> 'sources'), (p_payload ->> 'importance')::integer,
    (p_payload ->> 'confidence')::numeric, coalesce((p_payload ->> 'isBreaking')::boolean, false),
    p_payload ->> 'model', p_payload ->> 'searchResponseId', p_payload ->> 'summaryResponseId',
    coalesce((p_payload ->> 'inputTokens')::integer, 0),
    coalesce((p_payload ->> 'outputTokens')::integer, 0),
    coalesce((p_payload ->> 'discoveredAt')::timestamptz, timezone('utc', now())),
    timezone('utc', now()) + interval '90 days'
  )
  on conflict (language, source_fingerprint) do update set
    topic_key = excluded.topic_key, category = excluded.category,
    headline = excluded.headline, summary = excluded.summary,
    summary_bullets = excluded.summary_bullets, primary_url = excluded.primary_url,
    source_count = excluded.source_count, importance = greatest(article.importance, excluded.importance),
    confidence = excluded.confidence, is_breaking = article.is_breaking or excluded.is_breaking,
    status = 'published', model = excluded.model,
    search_response_id = excluded.search_response_id,
    summary_response_id = excluded.summary_response_id,
    input_tokens = article.input_tokens + excluded.input_tokens,
    output_tokens = article.output_tokens + excluded.output_tokens,
    expires_at = excluded.expires_at
  returning id into article_id_value;

  delete from public.news_sources where article_id = article_id_value;
  for source in select value from jsonb_array_elements(p_payload -> 'sources')
  loop
    if coalesce(source ->> 'url', '') !~ '^https://' then
      raise exception 'News sources must use HTTPS';
    end if;
    insert into public.news_sources (article_id, position, url, title, domain)
    values (
      article_id_value, (source ->> 'position')::integer, source ->> 'url',
      source ->> 'title', source ->> 'domain'
    );
  end loop;

  delete from public.news_entity_links where article_id = article_id_value;
  for entity in select value from jsonb_array_elements(coalesce(p_payload -> 'entities', '[]'::jsonb))
  loop
    entity_type_value := entity ->> 'entityType';
    entity_id_value := (entity ->> 'entityId')::bigint;
    relevance_value := (entity ->> 'relevance')::numeric;
    if entity_type_value is null or entity_type_value not in ('team', 'player', 'league')
      or entity_id_value is null or entity_id_value < 1
      or relevance_value is null or relevance_value not between 0 and 1 then
      raise exception 'Invalid news entity';
    end if;
    insert into public.news_entity_links (article_id, entity_type, entity_id, relevance)
    values (article_id_value, entity_type_value, entity_id_value, relevance_value);
  end loop;
  return article_id_value;
end;
$$;

revoke all on function public.upsert_news_article(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_news_article(jsonb) to service_role;

-- Retire the former local-catalog search surface and its write-amplifying indexes.
-- The normalized match tables remain because fixtures reference them, but they are
-- no longer queried as a complete discovery catalog.
drop function if exists app_private.assert_favorite_entity(text, bigint);

comment on function public.set_user_favorite(uuid, text, bigint, boolean) is
  'Persists a provider entity reference after the API has validated it against Sportmonks.';
comment on function public.get_news_ingestion_topics(integer) is
  'Returns ranked provider IDs; the API resolves current entity names from Sportmonks.';
comment on table public.football_leagues is
  'Sparse Sportmonks-derived match read-model projection; not the authoritative league catalog.';
comment on table public.football_teams is
  'Sparse Sportmonks-derived match read-model projection; not the authoritative team catalog.';
comment on table public.football_players is
  'Sparse Sportmonks-derived match read-model projection; not the authoritative player catalog.';
