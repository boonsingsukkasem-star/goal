begin;

select plan(7);

select ok(
  has_schema_privilege('anon', 'public', 'usage'),
  'anonymous Data API callers can resolve public objects'
);
select ok(
  has_schema_privilege('authenticated', 'public', 'usage'),
  'authenticated Data API callers can resolve public objects'
);

select has_schema('app_private', 'app_private schema exists');
select has_function(
  'app_private',
  'set_updated_at',
  array[]::name[],
  'updated-at trigger helper exists'
);
select ok(
  not has_schema_privilege('anon', 'app_private', 'usage'),
  'anon cannot use the private schema'
);
select ok(
  not has_schema_privilege('authenticated', 'app_private', 'usage'),
  'authenticated users cannot use the private schema'
);
select ok(
  has_function_privilege('service_role', 'app_private.set_updated_at()', 'execute'),
  'service role can execute server-only helpers'
);

select * from finish();

rollback;
