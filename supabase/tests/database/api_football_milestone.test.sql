begin;
do $test$ declare fixture_id bigint; league_id bigint; revision timestamptz:=now(); first_run record; second_run record; begin
 fixture_id:=public.ingest_api_football_fixture(jsonb_build_object(
 'fixture',jsonb_build_object('id',999998880,'date',now(),'status',jsonb_build_object('short','FT','long','Finished','elapsed',90)),
 'league',jsonb_build_object('id',999998880,'name','Review League','season',2026),
 'teams',jsonb_build_object('home',jsonb_build_object('id',999998881,'name','Review Home'),'away',jsonb_build_object('id',999998882,'name','Review Away')),
 'goals',jsonb_build_object('home',1,'away',0)),revision);
 select f.league_id into league_id from public.football_fixtures f where id=fixture_id;
 select * into first_run from public.reserve_system_ai_match_analysis(fixture_id,'th','review-test-v1','fulltime',1000000,array[league_id],revision,jsonb_build_object('id',fixture_id));
 if not first_run.should_enqueue then raise exception 'First milestone not reserved'; end if;
 update public.football_fixtures set provider_last_processed_at=revision+interval '1 minute' where id=fixture_id;
 select * into second_run from public.reserve_system_ai_match_analysis(fixture_id,'th','review-test-v1','fulltime',1000000,array[league_id],revision+interval '1 minute',jsonb_build_object('id',fixture_id));
 if second_run.should_enqueue or second_run.analysis_id<>first_run.analysis_id then raise exception 'Polling duplicated a system milestone'; end if;
 if second_run.budget_remaining<>first_run.budget_remaining then raise exception 'Polling spent AI budget twice'; end if;
end $test$;
select 'AI milestone identity and once-per-phase budget passed' as result;
rollback;
