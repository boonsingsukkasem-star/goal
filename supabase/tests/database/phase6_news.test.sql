begin;

select plan(33);

select has_table('public', 'news_articles', 'news article clusters exist');
select has_table('public', 'news_sources', 'news citations exist');
select has_table('public', 'news_entity_links', 'news entities exist');
select has_table('public', 'news_engagements', 'news engagement signals exist');
select has_table('public', 'news_ingestion_runs', 'news ingestion evidence exists');
select has_table('public', 'news_system_daily_usage', 'news system budget exists');
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.news_articles'::regclass),
  'news article RLS is forced'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.news_engagements'::regclass),
  'news engagement RLS is forced'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.news_ingestion_runs'::regclass),
  'news ingestion RLS is forced'
);
select ok(
  not has_table_privilege('anon', 'public.news_articles', 'select'),
  'anonymous clients cannot bypass the news API'
);
select ok(
  not has_table_privilege('authenticated', 'public.news_engagements', 'select'),
  'authenticated clients cannot inspect engagement identities'
);
select ok(
  has_function_privilege('service_role', 'public.upsert_news_article(jsonb)', 'execute'),
  'service role can publish validated news'
);
select ok(
  not has_function_privilege('authenticated', 'public.upsert_news_article(jsonb)', 'execute'),
  'clients cannot publish news through the trusted RPC'
);
select ok(
  has_function_privilege('service_role', 'public.get_trending_news_ids(text, integer)', 'execute'),
  'service role can rank trending news'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '66666666-6666-4666-8666-666666666666',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'news-reader@example.com', '', '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, timezone('utc', now()), timezone('utc', now())
);
insert into public.football_leagues (id, name) values (6001, 'News League');
insert into public.football_seasons (id, league_id, name)
values (6002, 6001, '2026');
insert into public.football_teams (id, name) values (6101, 'News FC'), (6102, 'Away FC');
insert into public.football_fixtures (
  id, league_id, season_id, state_id, state_code, state_name,
  name, starts_at, is_live
) values (
  6003, 6001, 6002, 1, 'NS', 'Not Started', 'News FC vs Away FC',
  timezone('utc', now()) + interval '1 day', false
);
insert into public.football_fixture_participants (fixture_id, team_id, location)
values (6003, 6101, 'home'), (6003, 6102, 'away');

set local role service_role;

select lives_ok(
  $$select public.upsert_news_article(jsonb_build_object(
    'language', 'th', 'topicKey', 'team:6101', 'category', 'breaking',
    'headline', 'News FC appoints a new head coach',
    'summary', 'News FC ยืนยันการแต่งตั้งหัวหน้าโค้ชคนใหม่อย่างเป็นทางการ',
    'summaryBullets', jsonb_build_array('สโมสรยืนยันผ่านช่องทางอย่างเป็นทางการ'),
    'primaryUrl', 'https://bbc.com/sport/football/news-fc',
    'sourceFingerprint', repeat('a', 64), 'importance', 95, 'confidence', 0.91,
    'isBreaking', true, 'model', 'gpt-5.6-sol', 'searchResponseId', 'resp_search_1',
    'summaryResponseId', 'resp_summary_1', 'inputTokens', 100, 'outputTokens', 50,
    'discoveredAt', timezone('utc', now()),
    'sources', jsonb_build_array(
      jsonb_build_object('position', 1, 'url', 'https://bbc.com/sport/football/news-fc',
        'title', 'News FC appoint coach', 'domain', 'bbc.com'),
      jsonb_build_object('position', 2, 'url', 'https://reuters.com/sports/news-fc',
        'title', 'News FC confirms appointment', 'domain', 'reuters.com')
    ),
    'entities', jsonb_build_array(
      jsonb_build_object('entityType', 'team', 'entityId', 6101, 'relevance', 1),
      jsonb_build_object('entityType', 'player', 'entityId', 6199, 'relevance', 0.5)
    )
  ))$$,
  'a cited AI summary can be published atomically'
);
select is((select count(*)::integer from public.news_sources), 2, 'all visible citations persist');
select is(
  (select count(*)::integer from public.news_entity_links),
  2,
  'provider entity links persist without requiring duplicated local catalog rows'
);

select public.set_user_favorite(
  '66666666-6666-4666-8666-666666666666', 'team', 6101, true
);
select ok(
  (select reasons @> array['favorite_team']::text[]
   from public.get_personalized_news_ids(
     '66666666-6666-4666-8666-666666666666', 'th', 20
   ) limit 1),
  'personalized news explains the favorite-team signal'
);
select is(
  (select count(*)::integer from public.get_related_news_ids(6003, 'th', 8)),
  1,
  'match-related news uses canonical fixture entities'
);
select is(
  (select count(*)::integer from public.get_trending_news_ids('th', 20)),
  1,
  'fresh important news appears in trending ranking'
);
select ok(
  public.record_news_engagement(
    '66666666-6666-4666-8666-666666666666', (select id from public.news_articles limit 1)
  ),
  'an authenticated news open is recorded'
);
select is(
  (select count(*)::integer from public.news_engagements),
  1,
  'repeated engagement is idempotent per user and article'
);

select is(
  (select outcome from public.reserve_news_ingestion(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'global:test', 'th', 1
  )),
  'claimed',
  'the first ingestion atomically reserves daily budget'
);
select is(
  (select outcome from public.reserve_news_ingestion(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'global:test', 'th', 1
  )),
  'in_progress',
  'a concurrent duplicate cannot consume budget twice'
);
select is(
  (select outcome from public.reserve_news_ingestion(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'global:second', 'th', 1
  )),
  'budget_exhausted',
  'system-wide daily news cost is bounded'
);

update public.notification_preferences set
  news_breaking = true,
  quiet_hours_enabled = true,
  quiet_hours_start = (timezone(timezone, now()) - interval '1 minute')::time,
  quiet_hours_end = (timezone(timezone, now()) + interval '1 hour')::time
where user_id = '66666666-6666-4666-8666-666666666666';
select is(
  (select count(*)::integer from public.get_news_notification_user_ids(
    (select id from public.news_articles limit 1), null, 251
  )),
  1,
  'breaking news fan-out targets only interested users'
);
select is(
  public.stage_news_notifications(
    (select id from public.news_articles limit 1),
    array['66666666-6666-4666-8666-666666666666'::uuid]
  ),
  1,
  'eligible news notification is staged once'
);
select cmp_ok(
  (select scheduled_for from public.notifications where dedup_key like 'news:%'),
  '>', now() + interval '30 minutes',
  'quiet hours defer news rather than dropping it'
);
select is(
  (select count(*)::integer from app_private.outbox_events where topic = 'notifications'),
  1,
  'news notification and durable outbox commit together'
);
select lives_ok(
  $$select public.record_news_ingestion_processed(
    'message-news-1', 'news-ingestion:one', '{"articleCount":1}'::jsonb
  )$$,
  'news consumer can retain idempotency evidence'
);
select ok(
  public.is_news_ingestion_processed('message-news-1', 'news-ingestion:one'),
  'news consumer detects already processed work'
);
update public.news_articles set expires_at = timezone('utc', now()) - interval '1 minute';
select is(public.purge_expired_news(), 1, 'expired summaries are purged by retention');
select is((select count(*)::integer from public.news_articles), 0, 'news retention cascades safely');

select * from finish();
rollback;
