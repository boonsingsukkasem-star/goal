begin;

select plan(20);

select has_function(
  'public', 'set_my_favorite', array['text', 'bigint', 'boolean']::name[],
  'owner-scoped favorite RPC exists'
);
select has_function(
  'public', 'set_my_match_follow',
  array['bigint', 'boolean', 'boolean', 'boolean']::name[],
  'owner-scoped match follow RPC exists'
);
select has_function(
  'public', 'get_my_personalized_fixture_ids', array['integer']::name[],
  'owner-scoped personalized fixture RPC exists'
);
select has_function(
  'public', 'cheer_for_my_fixture', array['bigint', 'bigint']::name[],
  'owner-scoped fan heartbeat RPC exists'
);
select has_function(
  'public', 'register_my_push_device', array['text', 'text', 'text']::name[],
  'owner-scoped push registration RPC exists'
);
select has_function(
  'public', 'disable_my_push_device', array['uuid']::name[],
  'owner-scoped push disable RPC exists'
);
select has_function(
  'public', 'get_my_personalized_news_ids', array['text', 'integer']::name[],
  'owner-scoped personalized news RPC exists'
);
select has_function(
  'public', 'record_my_news_engagement', array['uuid']::name[],
  'owner-scoped news engagement RPC exists'
);
select ok(
  not has_function_privilege('authenticated', 'public.set_my_favorite(text, bigint, boolean)', 'execute'),
  'authenticated callers cannot bypass API-side football favorite validation'
);
select ok(
  not has_function_privilege('anon', 'public.set_my_favorite(text, bigint, boolean)', 'execute'),
  'anonymous callers cannot mutate favorites'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.set_user_favorite(uuid, text, bigint, boolean)', 'execute'
  ),
  'authenticated callers still cannot use the impersonation-capable internal RPC'
);
select table_privs_are(
  'public', 'user_favorites', 'authenticated', array['SELECT']::text[],
  'authenticated callers receive read-only favorite table access'
);
select table_privs_are(
  'public', 'match_follows', 'authenticated', array['SELECT']::text[],
  'authenticated callers receive read-only match follow table access'
);
select table_privs_are(
  'public', 'notifications', 'authenticated', array['SELECT']::text[],
  'authenticated callers receive read-only notification history access'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  (
    'aaaaaaaa-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'owner-one@example.com', '', '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, timezone('utc', now()), timezone('utc', now())
  ),
  (
    'bbbbbbbb-2222-4222-8222-222222222222',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'owner-two@example.com', '', '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, timezone('utc', now()), timezone('utc', now())
  );

insert into public.football_teams (id, name)
values (17001, 'Caller Scoped FC'), (17002, 'Other Owner FC');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-1111-4111-8111-111111111111', true);

select throws_ok(
  $$select public.set_my_favorite('team', 17001, true)$$,
  '42501',
  null,
  'direct favorite mutation is unavailable to the authenticated client'
);
select is(
  (select count(*)::integer from public.user_favorites),
  0,
  'a rejected direct mutation writes no favorite'
);
select lives_ok(
  $$update public.notification_preferences
    set quiet_hours_enabled = true
    where user_id = 'aaaaaaaa-1111-4111-8111-111111111111'$$,
  'the owner can update approved notification preference columns'
);

reset role;
set local role service_role;
select public.set_user_favorite(
  'aaaaaaaa-1111-4111-8111-111111111111', 'team', 17001, true
);
select public.set_user_favorite(
  'bbbbbbbb-2222-4222-8222-222222222222', 'team', 17002, true
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-1111-4111-8111-111111111111', true);

select is(
  (select count(*)::integer from public.user_favorites),
  1,
  'favorite RLS hides another owner row'
);
select is(
  (
    select count(*)::integer
    from public.notification_preferences
    where user_id = 'bbbbbbbb-2222-4222-8222-222222222222'
  ),
  0,
  'notification preference RLS hides another owner row'
);
select throws_ok(
  $$select public.set_user_favorite(
    'bbbbbbbb-2222-4222-8222-222222222222', 'team', 17001, true
  )$$,
  '42501',
  null,
  'the original user-id RPC remains unavailable to authenticated callers'
);

select * from finish();
rollback;
