# API-Football cutover

## Configuration and migration

- Set `API_FOOTBALL_API_KEY` in `apps/api/.env` and server deployment secrets.
- Remove the old provider token. `API_FOOTBALL_BASE_URL` defaults to the official direct API.
- Keep the existing Supabase Cloud URL, publishable key and server secret key.
- `pnpm db:plan` then `pnpm db:migrate` applies the API-Football cutover and subsequent hardening/review migrations.
- The migration preserves user/Auth data and archived football references, creates separate upstream
  identities and sequences, removes old ingestion routines, and adds coverage, freshness, player
  statistics, quota reservations and derived momentum storage. No Docker or local database is required.
- Run `supabase/tests/database/api_football_ingestion.test.sql` on a Cloud test project. It rolls back.
- Regenerate OpenAPI/SDK with `pnpm orval:generate`; deploy API/workers and both clients together.
  Football queue schema version is 2. Old provider jobs are quarantined, never reinterpreted.

## Automatic ingestion

Standalone development API startup synchronizes to Supabase Cloud. Calendar pages are UTC; the UI
uses Asia/Bangkok and groups early-morning fixtures with the previous football evening. Production
uses the existing daily calendar and minute live Cron/Queue handlers. Opening a league hydrates stale standings and reports plan restrictions; opening a match hydrates stale
or missing details under a per-match lease. The read response remains available on provider failure.

Free plan detection comes from `/status`: new calendar requests are limited to yesterday/today/tomorrow;
`ids` batches are unavailable, so one `id` detail is reconciled hourly. The verified Free key also denies 2026 standings (allows 2022–2024); fixture-date access does not imply standings-season access. Paid plans use batches of at most
20 and a configurable development polling interval (default 60 seconds). Production Cron runs every
minute. Final matches are reconciled from persisted rows after disappearing from the live endpoint.

`API_FOOTBALL_LEAGUE_IDS` optionally limits calendar/catalog/live ingestion using **upstream league IDs**.
`AI_AUTO_LEAGUE_IDS` also uses upstream API-Football league IDs. Change old configured IDs before
turning on automatic AI. Standings jobs are bounded (one free / twenty paid seasons per run), oldest
checked first, only for current seasons advertising standings coverage.

A Cloud quota ledger reserves each provider request across workers and restarts, keeping five daily
requests in reserve. HTTP-200 application errors are failures, never empty successful responses.
Home exposes sync frequency, last update and quota/sync issues. Free is suitable for evaluation;
continuous live detail coverage across many competitions requires a sufficient paid request allowance.
Do not buy or change a subscription automatically.

## Metrics and AI

Store provider `expected_goals` only when supplied for that fixture. Missing xG stays missing; neither
zero nor model-generated numeric xG replaces it. Coverage varies by competition, season and match.

GOAL attacking-activity-v1 uses increments in total shots (weight 1), shots on target (3), and corners
(1.5), normalized per minute, multiplied by 10 and capped at 100. It requires snapshots 30–180 seconds
apart with plausible match-clock progression. Missing inputs, counter corrections and long gaps yield
no point. Raw snapshots are retained for six hours per fixture; derived points keep version/evidence.
This is a heuristic activity score, not vendor Pressure Index or goal probability. Free hourly polling
normally cannot provide enough temporal resolution for this chart. The chart does not connect gaps.
AI observations are text explanations with explicit attribution; they do not become measured points.

Local ingestion does not automatically generate AI or send notifications; those workflows use the
existing production Queue/outbox workers. Do not describe local AI automation as tested until deployed.

## Verification and rollout

Verify one scheduled, live and finished fixture, null/missing fields, empty unsupported sections,
stale responses, event insertions and repeated ingestion. Check cross-provider IDs cannot collide,
anonymous writes fail, and partial details cannot cause the whole fixture to return 503. Confirm
free-plan window, shared quota and hourly scheduling before enabling production traffic.

Historical phase documents describe previous iterations; this runbook and data-ownership document
are the current provider architecture. Roll forward on failures; do not blindly revert schema after
new identities have been referenced by users. Keep existing Cloud backups/PITR policy in place.

## Review corrections (2026-09-19)

- Translate configured upstream league eligibility to GOAL league IDs at AI reservation; system
  half/full-time milestones reuse one generation per prompt version across polling timestamps.
- Cache complete upstream search pages with stable ordered GOAL IDs; subsequent application pages
  no longer truncate results or consume a provider request for every 20 items.
- Standings preserve group names, show canonical played/goal-difference values, and distinguish
  unsupported coverage, plan-limited seasons, errors and genuinely empty results.
- Permanent provider failures go directly to the dead-letter ledger. Calendar bounds merge atomically.
- Archived match records are labeled as archived rather than attributed to API-Football.

Automated local/Cloud tests do not substitute for a deployed Vercel Cron/Queue end-to-end run,
a signed-in real-user AI generation, or a native-device notification test. Those release checks
remain necessary before production use. The original Free-key review did not validate paid-only
capabilities; the subsequent Pro verification is recorded below.

Review evidence on the linked development Cloud project:

- `pnpm check` passed all 36 workspace tasks and the API production-artifact smoke check.
- `pnpm db:test` runs SQL/RLS regressions through the linked Cloud connection, rolls back each
  transaction, and checks every planned pgTAP assertion was captured. It requires no local database.
  All 14 SQL files passed: 247 pgTAP assertions plus three transactional provider regression suites.
- Live refresh at `2026-09-18T17:13:03.542Z` ingested 82 fixtures successfully. The local home API
  subsequently returned HTTP 200 with `issueCode: null` and the same live-update timestamp.
- A real player search returned distinct first and second application pages from the cached provider
  page. The Premier League page reported the verified `plan_limited` standings state in the UI.
- Migration `20260918020000_api_football_review.sql` is applied on the linked Cloud project.

These are point-in-time development checks, not a production deployment or an uptime guarantee.

## Pro upgrade verification (2026-09-22)

The configured key reports an active Pro subscription with 7,500 requests per day. Real requests
successfully loaded 20 Premier League standings rows for season 2026, 155 fixtures on September 29
(outside the Free calendar window), and a two-fixture details batch. These responses were ingested
into the linked Cloud database. A successful live refresh recorded `plan: paid`, a 60-second refresh
interval, and no sync issue.

The September 21–23 calendar refresh ingested 144, 203 and 211 fixtures respectively. Two finished
matches passed the application read contract with events, lineups, player and team statistics all
available. Neither sampled match included `expected_goals`: paid access does not guarantee xG for
every fixture. Missing provider xG continues to remain missing.

The development scheduler now checks the subscription every five minutes and changes both its
polling interval and calendar window when the plan changes, without requiring an API restart.
Previously cached plan-limited standings can retry on paid access without waiting out the Free
24-hour cache or its lease. Paid retries remain throttled by a 15-minute Cloud lease.

API lint, typecheck, build and all 106 API tests passed, including upgrade regression tests.
No additional database migration or API key change is needed for the upgrade. The development
server must be running (`pnpm dev:api`) for continuous local synchronization; one-off verification
does not start that server. Production still requires deployed Cron/Queue workers.
