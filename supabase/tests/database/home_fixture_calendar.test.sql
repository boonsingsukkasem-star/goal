begin;
select plan(4);
create temporary table calendar_payload(payload jsonb);
insert into calendar_payload values ('{
 "fixture":{"id":999990002,"date":"2026-09-17T19:00:00Z","status":{"short":"NS","long":"Not Started","elapsed":null}},
 "league":{"id":99999001,"name":"Calendar test league","season":2026,"round":"League Stage - 1"},
 "teams":{"home":{"id":99999001,"name":"Home"},"away":{"id":99999002,"name":"Away"}},
 "goals":{"home":null,"away":null}
}');
select public.ingest_api_football_fixture(payload,'2026-09-17T00:00:00Z') from calendar_payload;
select is((select round_name from public.football_fixtures where api_football_id=999990002),'League Stage - 1','Provider round label retained');
select is((select starts_at from public.football_fixtures where api_football_id=999990002),'2026-09-17T19:00:00Z'::timestamptz,'UTC kickoff retained');
select is((select is_live from public.football_fixtures where api_football_id=999990002),false,'Scheduled game is not live');
select is((select home_score from public.football_fixtures where api_football_id=999990002),null::smallint,'Missing scores stay null');
select * from finish();
rollback;
