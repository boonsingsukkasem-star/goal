begin;

select plan(5);

select hasnt_extension('pg_trgm', 'unused local catalog search extension is not installed');
select hasnt_index(
  'public', 'football_leagues', 'football_leagues_name_trgm_idx',
  'unused local league-catalog index is retired'
);
select hasnt_index(
  'public', 'football_teams', 'football_teams_name_trgm_idx',
  'unused local team-catalog index is retired'
);
select hasnt_index(
  'public', 'football_players', 'football_players_name_trgm_idx',
  'unused local player-catalog index is retired'
);
select hasnt_function(
  'public', 'discover_football_catalog', array['text', 'text[]', 'integer']::name[],
  'discovery no longer exposes a Supabase catalog RPC'
);

select * from finish();
rollback;
