begin;

select plan(53);

select has_table('public', 'user_favorites', 'favorites table exists');
select has_table('public', 'match_follows', 'match follows table exists');
select has_table('public', 'notification_preferences', 'notification preferences table exists');
select has_table('public', 'push_devices', 'push devices table exists');
select has_table('public', 'fixture_fan_support', 'private fan presence table exists');
select has_table('public', 'fixture_fan_heatmap_totals', 'public fan aggregate table exists');
select has_table('public', 'notifications', 'notification history table exists');
select has_table('public', 'notification_deliveries', 'push delivery evidence table exists');

select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'fixture_fan_heatmap_totals'
  ),
  'fan aggregates publish through Supabase Realtime'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.notification_preferences'::regclass),
  'notification preference RLS is forced'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.notifications'::regclass),
  'notification history RLS is forced'
);
select table_privs_are(
  'public', 'user_favorites', 'authenticated', array['SELECT']::text[],
  'authenticated clients can read only the favorites admitted by owner RLS'
);
select ok(
  has_table_privilege('anon', 'public.fixture_fan_heatmap_totals', 'select'),
  'anonymous users can read aggregate fan totals'
);
select ok(
  not has_table_privilege('anon', 'public.fixture_fan_support', 'select'),
  'anonymous users cannot inspect individual fan presence'
);
select ok(
  has_function_privilege(
    'service_role', 'public.set_user_favorite(uuid, text, bigint, boolean)', 'execute'
  ),
  'service role can change favorites transactionally'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.set_user_favorite(uuid, text, bigint, boolean)', 'execute'
  ),
  'clients cannot impersonate another user through favorite RPC'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '55555555-5555-4555-8555-555555555555',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'community-fan@example.com', '', '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, timezone('utc', now()), timezone('utc', now())
);

insert into public.football_leagues (id, name) values (5001, 'Community League');
insert into public.football_seasons (id, league_id, name)
values (5002, 5001, '2026');
insert into public.football_teams (id, name)
values (5101, 'Gold FC'), (5102, 'Cyan FC');
insert into public.football_players (id, display_name)
values (5201, 'Community Player');
insert into public.football_fixtures (
  id, league_id, season_id, state_id, state_code, state_name,
  name, starts_at, is_live, home_score, away_score
) values (
  5003, 5001, 5002, 3, 'LIVE', 'Live', 'Gold FC vs Cyan FC',
  timezone('utc', now()) + interval '1 hour', true, 1, 0
);
insert into public.football_fixture_participants (fixture_id, team_id, location)
values (5003, 5101, 'home'), (5003, 5102, 'away');
insert into public.football_fixture_lineups (
  id, fixture_id, team_id, player_id, type_id, player_name
) values (5301, 5003, 5101, 5201, 11, 'Community Player');
insert into public.football_fixture_events (
  id, fixture_id, team_id, player_id, type_id, type_name,
  type_code, minute, player_name, result
) values (5401, 5003, 5101, 5201, 14, 'Goal', 'GOAL', 23, 'Community Player', '1-0');

select is(
  (select kickoff_reminder from public.notification_preferences
    where user_id = '55555555-5555-4555-8555-555555555555'),
  true,
  'new profiles receive the approved default notification preferences'
);

set local role service_role;

select lives_ok(
  $$select public.set_user_favorite(
    '55555555-5555-4555-8555-555555555555', 'team', 5101, true
  )$$,
  'a valid football entity can be favorited'
);
select is(
  (select count(*)::integer from public.user_favorites
    where user_id = '55555555-5555-4555-8555-555555555555'),
  1,
  'favorite is persisted once'
);
select lives_ok(
  $$select public.set_user_favorite(
    '55555555-5555-4555-8555-555555555555', 'player', 999999, true
  )$$,
  'the database accepts a GOAL ID that the API validated against the catalog'
);

select lives_ok(
  $$select * from public.set_match_follow(
    '55555555-5555-4555-8555-555555555555', 5003, true, true, false
  )$$,
  'a known fixture can be followed'
);
select is(
  (select count(*)::integer from public.match_follows
    where user_id = '55555555-5555-4555-8555-555555555555'),
  1,
  'match follow is persisted once'
);
select ok(
  (select reasons @> array['favorite_team', 'followed_match']::text[]
    from public.get_personalized_fixture_ids(
      '55555555-5555-4555-8555-555555555555', 20
    ) where fixture_id = 5003),
  'personalized feed explains favorite and follow signals'
);

select lives_ok(
  $$select public.cheer_for_fixture(
    '55555555-5555-4555-8555-555555555555', 5003, 5101
  )$$,
  'fan presence heartbeat accepts a participating team'
);
select is(
  (select supporters from public.fixture_fan_heatmap_totals
    where fixture_id = 5003 and team_id = 5101),
  1,
  'fan aggregate reflects active support'
);
select ok(
  not has_table_privilege('authenticated', 'public.fixture_fan_support', 'select'),
  'authenticated clients also cannot enumerate supporter identities'
);

update public.notification_preferences
set quiet_hours_enabled = false
where user_id = '55555555-5555-4555-8555-555555555555';

select is(
  public.stage_fixture_notifications(5003),
  2,
  'goal and lineup notifications are staged from canonical fixture data'
);
select is(
  (select count(*)::integer from public.notifications
    where user_id = '55555555-5555-4555-8555-555555555555'),
  2,
  'notification history contains one row per enabled event category'
);
select is(
  (select count(*)::integer from app_private.outbox_events where topic = 'notifications'),
  2,
  'notification and outbox records commit atomically'
);
select is(
  public.stage_fixture_notifications(5003),
  0,
  'reconciliation is idempotent across repeated live polling'
);
update public.football_fixture_events set result = '2-0' where id = 5401;
select is(
  public.stage_fixture_notifications(5003),
  1,
  'a changed goal result stages one score-correction notification'
);
select is(
  (select category from public.notifications where category = 'score_correction' limit 1),
  'score_correction',
  'score corrections are distinct from the original goal alert'
);
select is(
  public.stage_ai_context_notifications(
    5003, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Gold FC เริ่มกดดันหนักขึ้นในช่วง 10 นาทีล่าสุด', 0.82
  ),
  1,
  'high-confidence AI context is staged for followers'
);
select is(
  public.stage_ai_context_notifications(
    5003, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Low confidence context', 0.60
  ),
  0,
  'low-confidence AI context is suppressed before delivery'
);
select ok(
  has_function_privilege(
    'service_role', 'public.get_pending_notification_outbox(integer)', 'execute'
  ),
  'service role can dispatch notification outbox records'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.get_pending_notification_outbox(integer)', 'execute'
  ),
  'clients cannot inspect notification outbox records'
);

update public.notifications set status = 'queued'
where id = (select id from public.notifications order by created_at limit 1);
select is(
  (select count(*)::integer from public.claim_notification(
    (select id from public.notifications where status = 'queued' limit 1),
    (select generation_id from public.notifications where status = 'queued' limit 1)
  )),
  1,
  'consumer atomically claims the expected generation'
);
select is(
  (select count(*)::integer from public.claim_notification(
    (select id from public.notifications order by created_at limit 1), gen_random_uuid()
  )),
  0,
  'consumer cannot claim a mismatched generation'
);

set local role postgres;
alter table public.notifications disable trigger notifications_set_updated_at;
update public.notifications set updated_at = timezone('utc', now()) - interval '3 minutes'
where status = 'sending';
alter table public.notifications enable trigger notifications_set_updated_at;
set local role service_role;
select is(
  (select count(*)::integer from public.claim_notification(
    (select id from public.notifications where status = 'sending' limit 1),
    (select generation_id from public.notifications where status = 'sending' limit 1)
  )),
  1,
  'a message is reclaimable after consumer crash and queue visibility expiry'
);

update public.notifications set status = 'queued' where category = 'score_correction';
update app_private.outbox_events set published_at = timezone('utc', now())
where (payload ->> 'notificationId')::uuid = (
  select id from public.notifications where category = 'score_correction'
);
update public.notification_preferences set
  quiet_hours_enabled = true,
  quiet_hours_start = (timezone(timezone, now()) - interval '1 minute')::time,
  quiet_hours_end = (timezone(timezone, now()) + interval '1 hour')::time
where user_id = '55555555-5555-4555-8555-555555555555';
select cmp_ok(
  public.reschedule_user_notifications('55555555-5555-4555-8555-555555555555'),
  '>=',
  1,
  'a preference change also reschedules an already queued notification'
);
select is(
  (select status from public.notifications where category = 'score_correction'),
  'pending',
  'a rescheduled queued notification returns to pending until its new delivery time'
);
select is(
  (select count(*)::integer from app_private.outbox_events event
    where event.published_at is null
      and (event.payload ->> 'notificationId')::uuid = (
        select id from public.notifications where category = 'score_correction'
      )),
  1,
  'rescheduling recreates exactly one unpublished outbox message'
);

delete from public.notifications
where category = 'score_correction';
select is(
  (select count(*)::integer from app_private.outbox_events event
    where event.topic = 'notifications'
      and event.published_at is null
      and (event.payload ->> 'notificationId')::uuid not in (select id from public.notifications)),
  0,
  'deleting a notification removes its unpublished orphan outbox record'
);
select ok(
  has_function_privilege('service_role', 'public.run_auth_retention(timestamptz)', 'execute'),
  'daily retention covers notification and device data'
);
select ok(
  has_function_privilege('service_role', 'public.reschedule_user_notifications(uuid)', 'execute'),
  'preference changes can reschedule pending notifications'
);
select ok(
  has_function_privilege(
    'service_role', 'public.register_push_device(uuid, text, text, text)', 'execute'
  ),
  'service role can atomically register and cap push devices'
);
select lives_ok(
  $$select * from public.register_push_device(
    '55555555-5555-4555-8555-555555555555', 'ExpoPushToken[phase5DeviceToken]',
    'ios', 'Europe/London'
  )$$,
  'an Expo device can be registered transactionally'
);
select is(
  (select timezone from public.notification_preferences
    where user_id = '55555555-5555-4555-8555-555555555555'),
  'Europe/London',
  'latest device timezone becomes the account notification timezone'
);
update public.notification_preferences set
  quiet_hours_enabled = true, quiet_hours_start = '22:30', quiet_hours_end = '07:30'
where user_id = '55555555-5555-4555-8555-555555555555';
set local role postgres;
select is(
  (select app_private.notification_scheduled_for(preference, follow, false,
      '2026-03-29 00:30:00+00'::timestamptz)
    from public.notification_preferences preference
    join public.match_follows follow on follow.user_id = preference.user_id
    where preference.user_id = '55555555-5555-4555-8555-555555555555'
      and follow.fixture_id = 5003),
  '2026-03-29 06:30:00+00'::timestamptz,
  'quiet-hours scheduling observes the Europe/London DST transition'
);
set local role service_role;

insert into public.football_teams (id, name)
select id, 'Favorite cap team ' || id::text from generate_series(6001, 6100) id;
insert into public.user_favorites (user_id, entity_type, entity_id)
select '55555555-5555-4555-8555-555555555555', 'team', id
from generate_series(6001, 6099) id;
select throws_ok(
  $$select public.set_user_favorite(
    '55555555-5555-4555-8555-555555555555', 'team', 6100, true
  )$$,
  'P0001',
  'Favorite limit reached',
  'favorites are capped per account'
);

insert into public.football_fixtures (
  id, league_id, season_id, state_id, state_code, state_name,
  name, starts_at, is_live
)
select id, 5001, 5002, 1, 'NS', 'Not Started', 'Follow cap fixture ' || id::text,
  timezone('utc', now()) + interval '40 days', false
from generate_series(6000, 6198) id;
insert into public.football_fixtures (
  id, league_id, season_id, state_id, state_code, state_name,
  name, starts_at, is_live
) values (
  6200, 5001, 5002, 1, 'NS', 'Not Started', 'Follow cap target',
  timezone('utc', now()) + interval '40 days', false
);
insert into public.match_follows (user_id, fixture_id)
select '55555555-5555-4555-8555-555555555555', id from generate_series(6000, 6198) id;
select throws_ok(
  $$select * from public.set_match_follow(
    '55555555-5555-4555-8555-555555555555', 6200, true, true, false
  )$$,
  'P0001',
  'Match follow limit reached',
  'match follows are capped per account'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.record_notification_dead_letter(text, text, jsonb, integer, text)',
    'execute'
  ),
  'notification consumer can persist terminal failures'
);
select ok(
  (select relforcerowsecurity from pg_class
    where oid = 'public.fixture_fan_heatmap_totals'::regclass),
  'public aggregate access still runs under forced RLS'
);

select * from finish();
rollback;
