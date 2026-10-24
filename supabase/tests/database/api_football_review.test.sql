begin;

do $check$ declare a bigint; b bigint; ids bigint[]; source text; begin
 perform public.store_football_catalog_page('review-test','player',1,true,'[{"player":{"id":999998881,"name":"Review A"}},{"player":{"id":999998882,"name":"Review B"}}]');
 select entity_ids into ids from public.football_catalog_searches where cache_key='review-test';
 if cardinality(ids)<>2 or ids[1]=999998881 then raise exception 'Search identity invariant failed'; end if;
 a:=ids[1]; b:=ids[2];
 perform public.store_football_catalog_page('review-test','player',2,false,'[{"player":{"id":999998882,"name":"Review B"}},{"player":{"id":999998883,"name":"Review C"}}]');
 select entity_ids into ids from public.football_catalog_searches where cache_key='review-test';
 if cardinality(ids)<>3 or ids[1]<>a or ids[2]<>b then raise exception 'Search pagination lost stable identities'; end if;
 if has_function_privilege('anon','public.store_football_catalog_page(text,text,integer,boolean,jsonb)','execute') then raise exception 'Search write privilege leak'; end if;
 perform public.record_football_calendar_date('2026-09-16'); perform public.record_football_calendar_date('2026-09-22'); perform public.record_football_calendar_date('2026-09-18');
 if exists(select 1 from public.football_feed_status where calendar_from>'2026-09-16' or calendar_to<'2026-09-22') then raise exception 'Calendar bounds regressed'; end if;
 select pg_get_functiondef('public.reserve_system_ai_match_analysis(bigint,text,text,text,integer,bigint[],timestamptz,jsonb)'::regprocedure) into source;
 if source like '%if found and existing.source_updated_at = fixture_revision%' then raise exception 'AI milestones would be repeated each poll'; end if;
end $check$;
select 'review migration assertions passed' as result;
rollback;
