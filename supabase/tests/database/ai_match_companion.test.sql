begin;

select plan(50);

select has_table('public', 'ai_match_analyses', 'AI match analysis table exists');
select has_table('public', 'ai_daily_usage', 'AI daily usage table exists');
select has_table('public', 'football_fixture_statistics', 'fixture statistics table exists');
select has_table('public', 'ai_comparisons', 'AI comparison table exists');
select ok(
  has_table_privilege('anon', 'public.football_fixture_statistics', 'select'),
  'public match readers can read canonical statistics'
);
select ok(
  not has_table_privilege('anon', 'public.football_fixture_statistics', 'insert'),
  'public match readers cannot write statistics'
);
select ok(
  has_function_privilege('service_role', 'public.ingest_api_football_fixture(jsonb,timestamp with time zone)', 'execute'),
  'service role can transactionally ingest fixture statistics'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.ai_match_analyses'::regclass),
  'AI analysis RLS is active'
);
select table_privs_are(
  'public', 'ai_match_analyses', 'authenticated', array[]::text[],
  'clients cannot bypass the AI API to read analysis records'
);
select table_privs_are(
  'public', 'ai_comparisons', 'authenticated', array['SELECT']::text[],
  'clients can read only owned comparison records through RLS'
);
select table_privs_are(
  'public', 'ai_daily_usage', 'authenticated', array[]::text[],
  'clients cannot alter quota counters'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.reserve_ai_match_analysis(bigint, uuid, text, text, integer, timestamp with time zone, jsonb)',
    'execute'
  ),
  'clients cannot reserve quota directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.reserve_ai_match_analysis(bigint, uuid, text, text, integer, timestamp with time zone, jsonb)',
    'execute'
  ),
  'service role can reserve analysis transactionally'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.reserve_ai_comparison(uuid, text, bigint, bigint, text, text, integer, jsonb, jsonb)',
    'execute'
  ),
  'service role can reserve AI comparisons transactionally'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.reserve_system_ai_match_analysis(bigint, text, text, text, integer, bigint[], timestamp with time zone, jsonb)',
    'execute'
  ),
  'clients cannot bypass quota through the automatic analysis function'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.record_ai_analysis_dead_letter(text, text, jsonb, integer, text)',
    'execute'
  ),
  'AI consumer can persist terminal failure evidence'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '44444444-4444-4444-8444-444444444444',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'ai-fan@example.com', '', '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, timezone('utc', now()), timezone('utc', now())
);

insert into public.football_leagues (id, name) values (4001, 'AI League');
insert into public.football_seasons (id, league_id, name)
values (4002, 4001, '2026');
insert into public.football_fixtures (
  id, league_id, season_id, state_id, name, starts_at
) values
  (4003, 4001, 4002, 5, 'Home vs Away', timezone('utc', now())),
  (4004, 4001, 4002, 3, 'Second vs Third', timezone('utc', now()));
insert into public.football_teams (id, name)
values (4101, 'Left FC'), (4102, 'Right FC');

set local role service_role;

create temporary table first_reservation as
select * from public.reserve_ai_match_analysis(
  4003, '44444444-4444-4444-8444-444444444444', 'th', 'match-companion-v1', 2,
  (select coalesce(provider_last_processed_at, updated_at) from public.football_fixtures where id = 4003),
  '{"id":4003}'::jsonb
);

select is((select analysis_status from first_reservation), 'queued', 'first request is queued');
select is((select should_enqueue from first_reservation), true, 'first request publishes work');
select is((select quota_remaining from first_reservation), 1, 'first request reserves one quota unit');
select is((select reservation_outcome from first_reservation), 'queued', 'fresh work has an explicit queued outcome');
select is((select count(*)::integer from app_private.outbox_events), 1, 'reservation commits an outbox event atomically');
select is((select count(*)::integer from public.ai_daily_usage), 1, 'quota row is created');
select is((select request_count from public.ai_daily_usage), 1, 'quota count is incremented once');

create temporary table duplicate_reservation as
select * from public.reserve_ai_match_analysis(
  4003, '44444444-4444-4444-8444-444444444444', 'th', 'match-companion-v1', 2,
  (select coalesce(provider_last_processed_at, updated_at) from public.football_fixtures where id = 4003),
  '{"id":4003}'::jsonb
);

select is((select should_enqueue from duplicate_reservation), false, 'duplicate request is deduplicated');
select is((select quota_remaining from duplicate_reservation), 1, 'duplicate request costs no quota');
select is((select reservation_outcome from duplicate_reservation), 'reused', 'deduplication is explicit');
select is((select request_count from public.ai_daily_usage), 1, 'deduplication preserves quota count');

update public.ai_match_analyses set status = 'failed' where fixture_id = 4003 and language = 'th';
select is(
  (select should_enqueue from public.reserve_ai_match_analysis(
    4003, '44444444-4444-4444-8444-444444444444', 'th', 'match-companion-v1', 2,
    (select coalesce(provider_last_processed_at, updated_at) from public.football_fixtures where id = 4003),
    '{"id":4003}'::jsonb
  )),
  true,
  'failed work may be explicitly retried'
);
select is((select request_count from public.ai_daily_usage), 2, 'retry reserves final quota unit');

update public.ai_match_analyses set status = 'completed' where fixture_id = 4003 and language = 'th';
update public.football_fixtures
set provider_last_processed_at = timezone('utc', now()) + interval '1 second'
where id = 4003;
create temporary table exhausted_reservation as
select * from public.reserve_ai_match_analysis(
  4003, '44444444-4444-4444-8444-444444444444', 'th', 'match-companion-v1', 2,
  (select coalesce(provider_last_processed_at, updated_at) from public.football_fixtures where id = 4003),
  '{"id":4003,"revision":2}'::jsonb
);
select is((select quota_remaining from exhausted_reservation), 0,
  'quota exhaustion is returned without over-incrementing');
select is((select reservation_outcome from exhausted_reservation), 'quota_exhausted',
  'stale completed work never masquerades as a completed reservation');

select is(
  (select should_enqueue from public.reserve_system_ai_match_analysis(
    4003, 'th', 'match-companion-v1', 'fulltime', 2, array[4001]::bigint[],
    (select coalesce(provider_last_processed_at, updated_at) from public.football_fixtures where id = 4003),
    '{"id":4003,"phase":"fulltime"}'::jsonb
  )),
  true,
  'full-time milestone queues an automatic analysis'
);
select is(
  (select should_enqueue from public.reserve_system_ai_match_analysis(
    4003, 'th', 'match-companion-v1', 'fulltime', 2, array[4001]::bigint[],
    (select coalesce(provider_last_processed_at, updated_at) from public.football_fixtures where id = 4003),
    '{"id":4003,"phase":"fulltime"}'::jsonb
  )),
  false,
  'repeated full-time polling does not queue duplicate AI work'
);
select is(
  (select should_enqueue from public.reserve_system_ai_match_analysis(
    4003, 'th', 'match-companion-v1', 'halftime', 2, array[4001]::bigint[],
    (select coalesce(provider_last_processed_at, updated_at) from public.football_fixtures where id = 4003),
    '{"id":4003,"phase":"halftime"}'::jsonb
  )), true, 'half-time and full-time snapshots are stored independently'
);
select is((select count(*)::integer from public.ai_match_analyses
  where fixture_id = 4003 and analysis_key in ('halftime', 'fulltime')), 2,
  'both automatic milestones remain available');
select is(
  (select reservation_outcome from public.reserve_system_ai_match_analysis(
    4004, 'th', 'match-companion-v1', 'halftime', 2, array[4001]::bigint[],
    (select coalesce(provider_last_processed_at, updated_at) from public.football_fixtures where id = 4004),
    '{"id":4004}'::jsonb
  )), 'budget_exhausted', 'automatic generation stops at the transactional daily budget'
);
select is(
  (select reservation_outcome from public.reserve_system_ai_match_analysis(
    4004, 'th', 'match-companion-v1', 'halftime', 3, array[9999]::bigint[],
    (select coalesce(provider_last_processed_at, updated_at) from public.football_fixtures where id = 4004),
    '{"id":4004}'::jsonb
  )), 'not_eligible', 'automatic generation enforces the league allowlist'
);

create temporary table first_comparison as
select * from public.reserve_ai_comparison(
  '44444444-4444-4444-8444-444444444444', 'team', 4101, 4102, 'th',
  'entity-compare-v1', 3, '{"team":{"id":4101},"fixtures":[]}'::jsonb,
  '{"team":{"id":4102},"fixtures":[]}'::jsonb
);
select is((select should_enqueue from first_comparison), true, 'fresh AI comparison queues work');
select is((select quota_remaining from first_comparison), 0, 'comparison shares the daily AI quota');
select is(
  (select should_enqueue from public.reserve_ai_comparison(
    '44444444-4444-4444-8444-444444444444', 'team', 4101, 4102, 'th',
    'entity-compare-v1', 3, '{"team":{"id":4101},"fixtures":[]}'::jsonb,
    '{"team":{"id":4102},"fixtures":[]}'::jsonb
  )),
  false,
  'unchanged comparison is deduplicated'
);
select is((select request_count from public.ai_daily_usage), 3, 'deduplicated comparison costs no extra quota');
select is((select reservation_outcome from public.reserve_ai_comparison(
  '44444444-4444-4444-8444-444444444444', 'team', 4101, 4102, 'th',
  'entity-compare-v1', 4, '{"team":{"id":4101},"fixtures":[{"id":1}]}'::jsonb,
  '{"team":{"id":4102},"fixtures":[]}'::jsonb
)), 'queued', 'comparison fingerprint changes when recent fixture evidence changes');
select ok((select input_snapshot is not null from public.ai_match_analyses
  where fixture_id = 4003 and analysis_key = 'fulltime'), 'automatic analysis retains its immutable input');
select ok((select left_snapshot is not null and right_snapshot is not null from public.ai_comparisons
  where user_id = '44444444-4444-4444-8444-444444444444'), 'comparison retains both immutable inputs');
select is((select reservation_outcome from public.reserve_ai_comparison(
  '44444444-4444-4444-8444-444444444444', 'team', 99001, 99002, 'en',
  'entity-compare-v1', 10, '{"team":{"id":99001},"fixtures":[]}'::jsonb,
  '{"team":{"id":99002},"fixtures":[]}'::jsonb
)), 'queued', 'Football comparison snapshots do not require duplicate local catalog rows');
select ok(has_function_privilege('service_role', 'public.get_pending_ai_outbox(integer)', 'execute'),
  'service role can dispatch durable AI outbox records');
select ok(not has_function_privilege('authenticated', 'public.get_pending_ai_outbox(integer)', 'execute'),
  'clients cannot inspect the AI outbox');

insert into public.ai_daily_usage (user_id, usage_date, request_count)
values ('44444444-4444-4444-8444-444444444444', (timezone('utc', now()))::date - 91, 1);
insert into public.ai_system_daily_usage (usage_date, request_count)
values ((timezone('utc', now()))::date - 91, 1);
update app_private.outbox_events
set published_at = timezone('utc', now()) - interval '8 days'
where id = (select id from app_private.outbox_events order by created_at limit 1);

select lives_ok(
  $$select public.run_auth_retention(date_trunc('day', timezone('utc', now())) - interval '1 second')$$,
  'daily retention processes AI and durable queue evidence'
);
select is(
  (select count(*)::integer from public.ai_daily_usage
    where usage_date < (timezone('utc', now()))::date - 90)
  + (select count(*)::integer from public.ai_system_daily_usage
    where usage_date < (timezone('utc', now()))::date - 90),
  0,
  'retention removes expired user and automatic quota ledgers'
);
select is(
  (select count(*)::integer from app_private.outbox_events
    where published_at < timezone('utc', now()) - interval '7 days'),
  0,
  'retention removes acknowledged outbox evidence after seven days'
);

select * from finish();
rollback;
