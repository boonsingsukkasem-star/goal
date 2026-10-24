begin;

select plan(12);

select has_function(
  'public',
  'try_acquire_cron_lock',
  array['text', 'uuid', 'integer']::name[],
  'Cron lease acquisition RPC exists'
);
select has_function(
  'public',
  'release_cron_lock',
  array['text', 'uuid']::name[],
  'Cron lease release RPC exists'
);
select ok(
  not has_function_privilege('anon', 'public.try_acquire_cron_lock(text, uuid, integer)', 'execute'),
  'anonymous clients cannot acquire Cron leases'
);
select ok(
  not has_function_privilege('authenticated', 'public.release_cron_lock(text, uuid)', 'execute'),
  'authenticated clients cannot release Cron leases'
);
select has_function(
  'public',
  'get_football_player_recent_fixtures',
  array['bigint', 'integer']::name[],
  'player recent fixtures RPC exists'
);
select ok(
  has_function_privilege(
    'anon',
    'public.get_football_player_recent_fixtures(bigint, integer)',
    'execute'
  ),
  'anonymous clients can read bounded public player history'
);

set local role service_role;

select ok(
  public.try_acquire_cron_lock(
    'cron:football-live:test',
    '0198b135-d9d0-7000-8000-000000000011'::uuid,
    60
  ),
  'service role acquires a Cron lease'
);
select ok(
  not public.try_acquire_cron_lock(
    'cron:football-live:test',
    '0198b135-d9d0-7000-8000-000000000012'::uuid,
    60
  ),
  'overlapping Cron execution cannot acquire the lease'
);
select ok(
  public.release_cron_lock(
    'cron:football-live:test',
    '0198b135-d9d0-7000-8000-000000000011'::uuid
  ),
  'lease owner releases the Cron lease'
);
select ok(
  public.try_acquire_cron_lock(
    'cron:football-live:test',
    '0198b135-d9d0-7000-8000-000000000012'::uuid,
    60
  ),
  'next Cron execution acquires the released lease'
);

insert into public.football_leagues (id, name) values (8801, 'Test League');
insert into public.football_seasons (id, league_id, name)
values (8802, 8801, '2026');
insert into public.football_teams (id, name) values (8803, 'Test Team');
insert into public.football_players (id, display_name) values (8804, 'Test Player');
insert into public.football_fixtures (
  id, league_id, season_id, state_id, name, starts_at
) values
  (9902, 8801, 8802, 1, 'Newer fixture with lower ID', '2026-08-20T12:00:00Z'),
  (9903, 8801, 8802, 1, 'Older fixture with higher ID', '2026-08-10T12:00:00Z');
insert into public.football_fixture_lineups (
  id, fixture_id, team_id, player_id, type_id, player_name
) values
  (9911, 9902, 8803, 8804, 11, 'Test Player'),
  (9912, 9903, 8803, 8804, 11, 'Test Player');

select is(
  (
    select fixture_id
    from public.get_football_player_recent_fixtures(8804, 10)
    limit 1
  ),
  9902::bigint,
  'player history is ordered by start time instead of fixture ID'
);
select is(
  (
    select count(*)
    from public.get_football_player_recent_fixtures(8804, 1)
  ),
  1::bigint,
  'player history enforces its bounded limit'
);

select * from finish();

rollback;
