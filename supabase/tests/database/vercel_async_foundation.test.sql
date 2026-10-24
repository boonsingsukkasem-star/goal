begin;

select plan(16);

select has_table('app_private', 'outbox_events', 'transactional outbox exists');
select has_table('app_private', 'processed_events', 'consumer inbox exists');
select has_table('app_private', 'job_executions', 'job execution ledger exists');
select has_table('app_private', 'dead_letter_events', 'application dead-letter table exists');
select has_table('app_private', 'cron_executions', 'cron execution ledger exists');
select has_table('app_private', 'execution_locks', 'execution lease table exists');
select has_function(
  'app_private',
  'try_acquire_execution_lock',
  array['text', 'uuid', 'integer']::name[],
  'lease acquisition function exists'
);
select has_function(
  'app_private',
  'release_execution_lock',
  array['text', 'uuid']::name[],
  'lease release function exists'
);
select ok(
  not has_table_privilege('anon', 'app_private.outbox_events', 'select'),
  'anon cannot read the outbox'
);
select ok(
  not has_table_privilege('authenticated', 'app_private.dead_letter_events', 'select'),
  'authenticated users cannot read dead letters'
);
select ok(
  has_table_privilege('service_role', 'app_private.outbox_events', 'select'),
  'service role can dispatch outbox events'
);
select ok(
  app_private.try_acquire_execution_lock(
    'test:live-sync',
    '0198b135-d9d0-7000-8000-000000000001'::uuid,
    60
  ),
  'first owner acquires a lease'
);
select ok(
  not app_private.try_acquire_execution_lock(
    'test:live-sync',
    '0198b135-d9d0-7000-8000-000000000002'::uuid,
    60
  ),
  'second owner cannot take an active lease'
);
select ok(
  not app_private.release_execution_lock(
    'test:live-sync',
    '0198b135-d9d0-7000-8000-000000000002'::uuid
  ),
  'non-owner cannot release a lease'
);
select ok(
  app_private.release_execution_lock(
    'test:live-sync',
    '0198b135-d9d0-7000-8000-000000000001'::uuid
  ),
  'owner releases its lease'
);
select throws_ok(
  $$
    insert into app_private.outbox_events (topic, event_key, payload)
    values ('invalid topic', 'fixture-42', '{}'::jsonb)
  $$,
  '23514',
  null,
  'outbox rejects invalid Vercel topic names'
);

select * from finish();

rollback;
