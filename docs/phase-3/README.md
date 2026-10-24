> Historical phase notes. The API-Football cutover supersedes provider, identity and synchronization details here; see [the current runbook](../runbooks/api-football-cutover.md).

# Phase 3 — Core football data

Status: code hardening complete; provider-account, deployed nonprod, and physical-device verification
remain external promotion gates.

## Delivered

- Provider-isolated Sportmonks adapter with runtime response validation, bounded request timeouts,
  explicit 429 retry guidance, pagination, and server-only API credentials.
- Canonical Supabase schema for leagues, seasons, teams, players, fixtures, participants, scores,
  typed events, lineups, formations, and standings. Provider payloads never become the public API
  contract.
- Transactional, snapshot-style fixture and standings ingestion. All public football tables use
  forced RLS: anonymous and authenticated clients can read; only the service role can write or call
  ingestion functions.
- Vercel Queue consumer with versioned job contracts, at-least-once idempotency, bounded backoff,
  poison-payload quarantine, and application-owned dead-letter evidence after eight deliveries.
- Minute watchdog using `/livescores/inplay`, followed by deduplicated 10-second delta jobs using
  `/livescores/latest` while a match remains active. This avoids the data-loss gap caused by polling
  the ten-second `latest` window only once per minute.
- Fixture synchronization uses the documented `xGFixture` include. The minute live watchdog enriches
  active matches through the batch Fixture-by-IDs endpoint (maximum 50 IDs per request) with the
  `pressure` include. Team xG is normalized into canonical fixture statistics and Pressure Index
  points are stored as an ordered time series for the match API and AI context; ten-second livescore
  deltas preserve the latest pressure snapshot.
- Daily fixture-window coordination fans out into bounded one-day, 50-fixture page jobs. Consumer
  concurrency is capped at three and the queue visibility lease exceeds the Function duration. An
  authorized operations endpoint supports controlled historical backfills up to 31 days.
- Every Football Cron uses a short Supabase-backed execution lease in addition to deterministic
  queue idempotency keys, preventing overlapping invocation fan-out.
- Public NestJS read endpoints and validated shared client contracts for fixtures/results, match
  details, league tables, and team/player profiles.
- OpenAPI 3.1 publishes the shared Zod football contracts, all filters, success schemas, and standard
  error responses. A generated-document test prevents Swagger regressions.
- Responsive Next.js and Expo Match Centre and Match Detail screens using the approved GOAL theme.
  Live lists and active match details refresh every 10 seconds.

## Public API

- `GET /v1/football/fixtures?from=&to=&leagueId=&teamId=&limit=&cursor=`
- `GET /v1/football/fixtures/:fixtureId`
- `GET /v1/football/leagues/:leagueId/standings?seasonId=`
- `GET /v1/football/teams/:teamId`
- `GET /v1/football/players/:playerId`

All list responses use a canonical cursor and are independent of Sportmonks pagination.

## Scheduled and private routes

- Every minute: `GET /v1/internal/cron/football-live`
- Daily at 00:15 UTC: `GET /v1/internal/cron/football-fixtures`
- Daily at 00:45 UTC: `GET /v1/internal/cron/football-standings`
- Controlled backfill: `POST /v1/internal/football/sync-window`
- Private Vercel Queue function: `api/football-sync.ts`, triggered only by the `football-sync` topic

Cron and operations routes require `Authorization: Bearer $CRON_SECRET`. Example backfill body:

```json
{ "startDate": "2026-07-01", "endDate": "2026-07-31" }
```

Run multiple non-overlapping requests for older history. The endpoint deliberately rejects windows
longer than 31 days so one queue delivery cannot accidentally become an unbounded provider import.

## Environment and deployment

The API additionally requires `SPORTMONKS_API_TOKEN`. `SPORTMONKS_BASE_URL` and
`SPORTMONKS_TIMEOUT_MS` have production-safe defaults. The web server uses `GOAL_API_URL`; browser
refreshes use `NEXT_PUBLIC_API_URL`; Expo uses `EXPO_PUBLIC_API_URL`.

Deploy the API with `apps/api` as the Vercel project root. Keep its queue region aligned with the
Supabase project region, configure the three Crons, and verify the `queue/v2beta` trigger in nonprod.

## Verification completed locally

- Full migration reset against PostgreSQL.
- 92 pgTAP assertions covering all prior phases plus football tables, RLS, function privileges,
  transactional ingestion, Cron leases, chronological player history, typed events, and safe
  re-ingestion.
- Provider contract, bounded pagination, 429, malformed response, duplicate/out-of-order delivery,
  timeout retry, terminal dead-letter, Cron lease, Swagger contract, shared client, API, web, and
  mobile tests/type checks/builds through the repository release gates.
- Public football reads use the Supabase publishable client and therefore remain under RLS. Live
  readiness fails when an active fixture has not refreshed for 60 seconds. Web and mobile
  distinguish empty, not-found, stale, and retryable dependency states.

## External release gates

- Enter the real nonprod Sportmonks token and confirm the subscribed leagues and include access.
- Run an initial fixture backfill and compare representative scores, events, lineups, formations,
  and standings against the Sportmonks dashboard.
- Deploy nonprod and verify Vercel Cron authorization, Queue trigger delivery, ten-second delayed
  messages, retry behavior, dead-letter evidence, function duration, and provider rate-limit usage.
- Exercise web and physical iOS/Android Match Centre refresh behavior on a real live fixture.

Capture evidence using the [Phase 3 nonprod verification runbook](../runbooks/phase-3-nonprod-verification.md).

AI analysis, news, community, favorites, personalized feeds, and notifications are intentionally not
part of Phase 3.
