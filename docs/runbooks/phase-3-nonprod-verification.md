# Phase 3 nonprod verification

Use this runbook after deploying the exact locally tested commit to the `nonprod` Vercel, Supabase,
and EAS environments. Never copy production credentials into nonprod.

## Required evidence

Record the deployment ID, commit SHA, tester, UTC timestamp, Sportmonks plan, Supabase region,
Vercel Function/Queue region, EAS build IDs, and links to redacted logs. A gate is incomplete when
evidence is missing, even if the local suite passes.

## API and OpenAPI

1. Confirm `/v1/health` and `/v1/health/ready` return 200.
2. Open `/docs` and download `/docs-json` with Swagger explicitly enabled only in nonprod.
3. Confirm Football fixture, detail, standings, team/player, and `ApiErrorResponse` schemas exist and
   all six fixture filters are visible.
4. Confirm `limit=51`, malformed cursors, unknown queries, missing fixtures, and simulated database
   outages return the documented error envelope and request ID.

## Sportmonks and data reconciliation

1. Confirm the subscribed leagues expose fixtures, livescores, events, event types, lineups,
   formations, and standings includes used by the adapter.
2. Run a controlled one-day backfill through `POST /v1/internal/football/sync-window` using
   `Authorization: Bearer $CRON_SECRET`.
3. Compare scheduled, live, and finished fixtures against the Sportmonks dashboard: participants,
   scores, goals/cards/substitutions, lineup, formation, and timestamps.
4. Confirm a multi-page date produces page 1 then page 2 messages, never one unbounded worker.

## Cron and Queue

1. Trigger two overlapping live Cron requests and capture that one publishes while one reports
   `enqueued: false` because the database lease is held.
2. Confirm the `football-sync` consumer is private, uses `maxConcurrency: 3`, has a 300-second
   Function duration, and a 360-second visibility timeout.
3. Confirm a transient 429/timeout retries with bounded backoff, duplicate and out-of-order page
   delivery is safe, and the eighth terminal delivery writes `app_private.dead_letter_events`
   before acknowledgment.
4. Confirm queue age/failure, Sportmonks 429/5xx, API 5xx/p95, and live freshness alerts use the
   thresholds in `docs/operations/observability.md`.

## Web and mobile

1. Test Match Centre and Match Detail during a real fixture on web, physical iPhone, and physical
   Android device for at least five minutes.
2. Confirm refresh is approximately ten seconds, stale data remains visible during a brief outage,
   retry works, 404 is distinct from 503, and recovery clears the warning.
3. Record nonprod EAS iOS/Android build IDs, runtime version, rollback update, and network traces
   showing no Sportmonks or service-role credential reaches either client.

## Promotion decision

Phase 3 promotion passes only when every item has evidence and no unresolved P0/P1 issue remains.
Local tests prove implementation behavior; they do not replace deployed provider, platform, region,
firewall, or physical-device verification.
