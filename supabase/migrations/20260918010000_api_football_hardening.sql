begin;
set local lock_timeout='10s';
-- A missed penalty is not a goal notification; a second yellow is a sending-off.
do $$ declare definition text; begin
 select pg_get_functiondef('public.ingest_api_football_fixture(jsonb,timestamptz)'::regprocedure) into definition;
 definition:=replace(definition,
  'case when v_item->>''type''=''Goal'' then ''GOAL''',
  'case when v_item->>''detail''=''Missed Penalty'' then ''MISSED_PENALTY'' when lower(v_item->>''detail'')=''second yellow card'' then ''REDCARD'' when v_item->>''type''=''Goal'' then ''GOAL''');
 definition:=replace(definition,'round_name=excluded.round_name,elapsed=excluded.elapsed',
  'round_name=case when (payload->''league'')?''round'' then excluded.round_name else football_fixtures.round_name end,elapsed=excluded.elapsed');
 execute definition;
end $$;
create index football_snapshots_retention on public.football_stat_snapshots(captured_at);
create function public.prune_football_snapshots()
returns integer language plpgsql security definer set search_path='' as $$
declare deleted integer; begin
 delete from public.football_stat_snapshots where id in (
  select id from public.football_stat_snapshots where captured_at<now()-interval '6 hours'
  order by captured_at limit 10000
 );
 get diagnostics deleted=row_count;
 return deleted;
end $$;
revoke all on function public.prune_football_snapshots() from public,anon,authenticated;
grant execute on function public.prune_football_snapshots() to service_role;
notify pgrst,'reload schema';
commit;
