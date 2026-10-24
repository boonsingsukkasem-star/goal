-- Retain provider stage/round names for calendar grouping. Existing records are
-- populated on the next fixture sync. No invented labels for unknown rounds.
alter table public.football_fixtures
  add column stage_name text,
  add column round_name text;

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
    sportmonks_id, league_id, season_id, stage_id, round_id, stage_name, round_name, group_id, venue_id,
    state_id, state_name, state_code, name, starts_at, length_minutes, result_info,
    placeholder, is_live, home_score, away_score, provider_last_processed_at
  ) values (
    v_fixture_id, v_league_id, v_season_id,
    nullif(payload ->> 'stage_id', '')::bigint,
    nullif(payload ->> 'round_id', '')::bigint,
    nullif(payload #>> '{stage,name}', ''),
    nullif(payload #>> '{round,name}', ''),
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
    stage_name = case
      when payload ? 'stage' or football_fixtures.stage_id is distinct from excluded.stage_id
      then excluded.stage_name else football_fixtures.stage_name end,
    round_name = case
      when payload ? 'round' or football_fixtures.round_id is distinct from excluded.round_id
      then excluded.round_name else football_fixtures.round_name end,
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

revoke all on function public.ingest_sportmonks_fixture(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_sportmonks_fixture(jsonb) to service_role;
