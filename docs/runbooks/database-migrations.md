# Database migration runbook

Goal uses migrations under `supabase/migrations` as the source of truth for database
structure. All environments use Supabase Cloud. Dashboard schema edits must be
captured in a reviewed migration before promotion between environments.

## Connect and inspect

1. Sign in with `pnpm exec supabase login`.
2. Link the intended hosted project with
   `pnpm exec supabase link --project-ref <PROJECT_REF>`.
3. Run `pnpm db:migrations` to compare repository and remote migration history.
4. Run `pnpm db:plan` to preview pending migrations.

The linked CLI project and the application environment variables must point to the
same project. Changing the CLI link does not update application environment files.
Hosted Auth, redirects, SMTP, and Storage are configured in the Supabase Dashboard;
`supabase/config.toml` only contains CLI migration metadata.

## Isolated cloud validation

Use a separate, disposable Supabase Cloud test project with an empty application
schema. SQL tests assume an isolated database and must not run on the populated
application project.

1. Link a separate repository checkout to the test project.
2. Inspect the plan and apply the repository migrations with `pnpm db:migrate`.
3. Enable the pgTAP extension on that test project. Execute the SQL suites in
   `supabase/tests/database` with a native PostgreSQL connection and a pgTAP test
   runner such as `pg_prove`; inspect both SQL errors and failed TAP assertions.
4. Confirm all RLS, privilege, and ingestion tests pass.
5. Generate and review TypeScript database types after schema changes.

Use the hosted connection details from the Dashboard, keep credentials out of
committed files, and verify the destination before running tests. This workflow
requires no containerized database. Do not reset the populated application project.

## Nonprod promotion

1. Link the CLI to the intended nonprod Supabase Cloud project.
2. Run `pnpm db:migrations` and `pnpm db:plan`.
3. Apply the reviewed changes with `pnpm db:migrate`.
4. Run API readiness and feature smoke tests against nonprod.

## Production promotion

1. Back up the production database and confirm restore access.
2. Link the intended production project, run `pnpm db:plan`, and archive the output.
3. Prefer backward-compatible expand/migrate/contract changes. Never combine a
   destructive schema change with code that still depends on the old shape.
4. Apply `pnpm db:migrate` from the exact reviewed commit.
5. Verify health, key queries, RLS policies, and replication after deployment.

Do not reset or load test data into production. Rollback normally means a new
forward migration; restore from backup is reserved for data-loss incidents.
