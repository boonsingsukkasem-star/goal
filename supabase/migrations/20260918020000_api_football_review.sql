begin;
set local lock_timeout='10s';
alter table public.football_seasons add column standings_status text not null default 'pending'
 check(standings_status in ('pending','available','empty','unsupported','plan_limited','error'));

-- System milestones are once per half/full time and prompt version, not once per poll timestamp.
do $$ declare definition text; begin
 select pg_get_functiondef('public.reserve_system_ai_match_analysis(bigint,text,text,text,integer,bigint[],timestamptz,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'if found and existing.source_updated_at = fixture_revision','if found');
 execute definition;
 select pg_get_functiondef('public.ingest_api_football_league(jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'for item in select value from jsonb_array_elements(payload->''seasons'') loop',
 'update public.football_seasons set is_current=false where league_id=v_id; for item in select value from jsonb_array_elements(payload->''seasons'') loop');
 execute definition;
end $$;

-- Every successful date update merges atomically, even when calendar workers finish out of order.
create function public.record_football_calendar_date(p_date date)
returns void language sql security definer set search_path='' as $$
 update public.football_feed_status set calendar_from=least(calendar_from,p_date),
 calendar_to=greatest(calendar_to,p_date),calendar_updated_at=now(),updated_at=now() where id=true;
$$;
revoke all on function public.record_football_calendar_date(date) from public,anon,authenticated;
grant execute on function public.record_football_calendar_date(date) to service_role;

create table public.football_catalog_searches (
 cache_key text primary key,
 kind text not null check(kind in ('league','team','player')),
 entity_ids bigint[] not null default '{}',
 next_page integer not null,
 has_more boolean not null,
 updated_at timestamptz not null default now()
);
alter table public.football_catalog_searches enable row level security;
revoke all on public.football_catalog_searches from public,anon,authenticated;
grant all on public.football_catalog_searches to service_role;
create function public.store_football_catalog_page(p_key text,p_kind text,p_page integer,p_more boolean,p_items jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare ids bigint[]; item jsonb; entity jsonb; identifier bigint; previous public.football_catalog_searches%rowtype; begin
 if p_page<1 or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>1000 then raise exception 'Invalid catalog page'; end if;
 perform pg_advisory_xact_lock(hashtextextended('catalog:'||p_key,0));
 select * into previous from public.football_catalog_searches where cache_key=p_key for update;
 if p_page>1 and (previous.cache_key is null or previous.next_page<>p_page or previous.kind<>p_kind) then raise exception 'Catalog page out of sequence'; end if;
 ids:=case when p_page=1 then '{}'::bigint[] else previous.entity_ids end;
 for item in select value from jsonb_array_elements(p_items) loop
  entity:=item->p_kind;
  identifier:=public.upsert_api_football_entity(p_kind,entity);
  if not identifier=any(ids) then ids:=array_append(ids,identifier); end if;
 end loop;
 insert into public.football_catalog_searches(cache_key,kind,entity_ids,next_page,has_more)
 values(p_key,p_kind,ids,p_page+1,p_more) on conflict(cache_key) do update set
 entity_ids=excluded.entity_ids,next_page=excluded.next_page,has_more=excluded.has_more,updated_at=now();
 delete from public.football_catalog_searches where updated_at<now()-interval '1 day';
end $$;
revoke all on function public.store_football_catalog_page(text,text,integer,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.store_football_catalog_page(text,text,integer,boolean,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
