begin;

select plan(31);

select has_table('public', 'profiles', 'profiles table exists');
select has_column('public', 'profiles', 'user_id', 'profile has an owner');
select col_is_pk('public', 'profiles', 'user_id', 'user_id is the profile primary key');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles RLS is active'
);
select policies_are(
  'public',
  'profiles',
  array['profiles_select_own', 'profiles_update_own'],
  'profiles expose only explicit owner policies'
);
select table_privs_are(
  'public',
  'profiles',
  'anon',
  array[]::text[],
  'anonymous users have no profile table privileges'
);
select table_privs_are(
  'public',
  'profiles',
  'authenticated',
  array['SELECT', 'UPDATE'],
  'authenticated users can only read and update profiles'
);
select has_trigger('public', 'profiles', 'profiles_set_updated_at', 'profile timestamps are maintained');
select has_trigger('auth', 'users', 'auth_user_create_profile', 'new users receive a profile');
select has_table('public', 'revoked_auth_sessions', 'revocation denylist exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.revoked_auth_sessions'::regclass),
  'revocation denylist has RLS'
);
select table_privs_are(
  'public',
  'revoked_auth_sessions',
  'authenticated',
  array[]::text[],
  'clients cannot inspect or modify the revocation denylist'
);
select has_table('public', 'account_deletion_audit', 'deletion audit exists');
select table_privs_are(
  'public',
  'account_deletion_audit',
  'authenticated',
  array[]::text[],
  'clients cannot inspect deletion audit records'
);
select has_function(
  'public',
  'delete_authenticated_user',
  array['uuid', 'timestamp with time zone', 'text', 'text'],
  'transactional account deletion function exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.delete_authenticated_user(uuid, timestamptz, text, text)',
    'execute'
  ),
  'clients cannot invoke server-only account deletion'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'first@example.com',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"First Fan"}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'second@example.com',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Second Fan"}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now())
  );

select is(
  (select count(*)::integer from public.profiles),
  2,
  'new auth users automatically receive profiles'
);
select is(
  (select display_name from public.profiles where user_id = '11111111-1111-4111-8111-111111111111'),
  'First Fan',
  'verified profile metadata is copied by the trigger'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select is((select count(*)::integer from public.profiles), 1, 'RLS exposes only the current profile');
select lives_ok(
  $$update public.profiles set display_name = 'Updated Fan' where user_id = '11111111-1111-4111-8111-111111111111'$$,
  'the owner can update their profile'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  0,
  'the owner cannot read another profile'
);

reset role;

select has_function(
  'public',
  'run_auth_retention',
  array['timestamp with time zone'],
  'auth retention cron function exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.run_auth_retention(timestamptz)',
    'execute'
  ),
  'clients cannot invoke retention cleanup'
);

set local role service_role;
select lives_ok(
  $$select public.delete_authenticated_user(
    '22222222-2222-4222-8222-222222222222',
    timezone('utc', now()) + interval '1 hour',
    repeat('a', 64),
    'not_applicable'
  )$$,
  'service role can delete an account transactionally'
);
reset role;

select is(
  (select count(*)::integer from auth.users where id = '22222222-2222-4222-8222-222222222222'),
  0,
  'transactional deletion removes the auth user'
);
select is(
  (select count(*)::integer from public.profiles where user_id = '22222222-2222-4222-8222-222222222222'),
  0,
  'transactional deletion cascades to the profile'
);
select is(
  (select count(*)::integer from public.revoked_auth_sessions where user_id = '22222222-2222-4222-8222-222222222222'),
  1,
  'transactional deletion immediately denylists outstanding JWTs'
);

insert into public.revoked_auth_sessions (user_id, expires_at)
values ('33333333-3333-4333-8333-333333333333', timezone('utc', now()) - interval '2 days');
insert into public.account_deletion_audit (
  user_reference,
  provider_revocation,
  requested_at,
  completed_at
)
values (
  repeat('b', 64),
  'not_applicable',
  timezone('utc', now()) - interval '181 days',
  timezone('utc', now()) - interval '181 days'
);

set local role service_role;
select lives_ok(
  $$select public.run_auth_retention(date_trunc('day', timezone('utc', now())))$$,
  'service role can run retention cleanup'
);
reset role;

select is(
  (select count(*)::integer from public.revoked_auth_sessions where user_id = '33333333-3333-4333-8333-333333333333'),
  0,
  'retention cleanup purges expired denylist rows'
);
select is(
  (select count(*)::integer from public.account_deletion_audit where user_reference = repeat('b', 64)),
  0,
  'retention cleanup purges audit evidence after 180 days'
);
select is(
  (
    select status::text
    from app_private.cron_executions
    where cron_name = 'auth-retention'
  ),
  'succeeded',
  'retention cleanup records a successful execution'
);

select * from finish();

rollback;
