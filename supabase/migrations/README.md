# Supabase migrations

`20260908000000_initial_schema.sql` is the initial database baseline. It replaces the
unreleased development migration history and is intended to run once against an empty Supabase Cloud
test, non-production, or production project.

After this baseline has been applied to any shared environment:

- do not edit or rename the baseline;
- create a new timestamped, forward-only migration for every schema change;
- validate schema and pgTAP tests against a dedicated Supabase Cloud test project;
- review pending migrations with `pnpm db:plan` before applying them with `pnpm db:migrate`.

## Current provider (2026-09-18)

Apply `20260918000000_api_football.sql` for the API-Football cutover. It preserves user data,
archives prior identities and creates separate GOAL/upstream IDs. See
[the cutover runbook](../../docs/runbooks/api-football-cutover.md) for verification and rollout.
Historical migrations remain immutable; there is no local Supabase or Docker workflow.
