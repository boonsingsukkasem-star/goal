> Historical phase notes. The API-Football cutover supersedes provider, identity and synchronization details here; see [the current runbook](../runbooks/api-football-cutover.md).

# Phase 5 — Community, personalization, and contextual notifications

Status: implementation and local gates complete; deployed Vercel, Supabase Realtime, Expo, and
physical-device evidence remain external promotion gates.

## Delivered

- Authenticated favorites for teams, players, and leagues with Sportmonks entity validation, plus
  match follows with per-match notification and quiet-hour overrides. Transactional account caps
  allow at most 100 favorites and 200 match follows, including under concurrent writes.
- A personalized fixture feed that combines followed matches and favorite team/league/player
  signals. Every result carries explicit recommendation reasons; no opaque behavior profile is
  required.
- A five-minute Fan Heatmap heartbeat. Individual support rows are private and forced-RLS; only
  fixture/team aggregate counts are exposed anonymously through API and Supabase Realtime.
- Notification preferences with approved defaults, IANA timezone validation, 22:30–07:30 quiet
  hours, explicit live-alert override, and rescheduling of unpublished work after preference
  changes.
- Contextual alerts for kickoff, lineup, goal, score correction, cards, substitution, half-time,
  full-time, and high-confidence AI match context. AI alerts are limited to one per 15 minutes and
  three per user/match.
- Durable notification/outbox writes in one transaction, generation-aware queue claims,
  at-least-once idempotency, 250-user cursor-based fixture and AI fan-out batches, crash reclaim,
  bounded publish recovery, terminal dead-letter evidence, and an authenticated minute
  reconciliation Cron.
- Expo push tickets and receipt processing, automatic `DeviceNotRegistered` invalidation, a maximum
  of ten active devices per account, and 30-day history/delivery retention.
- Permission is requested only after a native user follows a match. Native device registration is
  refreshed without prompting on authenticated app startup/foreground, rotated tokens disable the
  previous device, Android creates its notification channel before prompting, notification taps
  deep-link to the match, and denial does not block core football features.
- Next.js and Expo community dashboards, favorite/follow management, personalized feed,
  notification history/preferences, and match-page Follow/Fan Heatmap controls. Both clients use
  the Orval-generated Fetch client; there are no handwritten endpoint calls.

## API

- `GET /v1/community/me/favorites`
- `PUT|DELETE /v1/community/me/favorites/:entityType/:entityId`
- `GET /v1/community/me/follows`
- `PUT|DELETE /v1/community/me/follows/:fixtureId`
- `GET /v1/community/feed`
- `GET /v1/community/matches/:fixtureId/heatmap` — public aggregate only
- `PUT /v1/community/matches/:fixtureId/cheer`
- `GET|PUT /v1/notifications/preferences`
- `POST /v1/notifications/devices`
- `DELETE /v1/notifications/devices/:deviceId`
- `GET /v1/notifications`

The private `api/notifications.ts` function consumes the `notifications` Vercel Queue topic with
maximum concurrency five. `GET /v1/internal/cron/notifications` runs every minute under
`CRON_SECRET`; it reconciles followed-fixture events, kickoff reminders, and fan expiry, recovers
unpublished outbox rows, queues bounded fan-out work, and schedules outstanding Expo receipt
checks. This recovery path keeps a notification dependency outage from blocking core live-score
ingestion.

## Privacy and lifecycle invariants

- NestJS verifies the caller JWT. Favorite additions are validated through the shared Sportmonks
  gateway, then written by a service-role-only RPC as an entity type/ID reference; clients cannot
  bypass validation or choose another user's ID. Owner reads and other user-safe RPCs use a
  per-request Supabase client with forced RLS. Individual fan support, push tokens, delivery
  evidence, internal RPCs, and elevated workflows remain inaccessible to clients.
- Public Realtime contains only `fixture_id`, `team_id`, supporter count, and aggregate update time.
- A notification is rechecked against current category preferences, current match follow, and
  current device state immediately before delivery.
- Quiet hours are calculated in the saved IANA timezone. They apply to live alerts unless the user
  explicitly overrides them globally or for one followed match. Preference changes reschedule both
  pending and already-queued deliveries through a fresh durable outbox message.
- Logout disables the current native device where possible; invalid or disabled tokens are purged
  after 30 days. Account deletion cascades community and notification data immediately.

## Environment and platform configuration

- `EXPO_PUSH_ACCESS_TOKEN` — required in production and server-side only.
- `EXPO_PUSH_BASE_URL` — defaults to the Expo push service; override only for controlled tests.
- `EXPO_PUSH_TIMEOUT_MS` — bounded server timeout.
- EAS `projectId`, APNs credentials, and FCM credentials must be configured for nonprod and prod.
- Vercel must bind the `notifications` queue trigger and minute Cron to the API project.
- Supabase Realtime must publish `fixture_fan_heatmap_totals` in both environments.

## Verification completed locally

- Clean migration replay and pgTAP assertions cover forced RLS, grants, defaults, provider-reference
  validation, personalization reasons, anonymous fan aggregates, Realtime publication, event/score
  correction/AI staging, account caps, quiet-hour/DST scheduling, queued-work rescheduling, consumer
  crash reclaim, durable outbox, generation claims, retention, and dead-letter access.
- Swagger publishes stable Phase 5 operation IDs and response schemas; Orval regeneration and
  runtime Zod validator parity protect both frontends from contract drift.
- Unit/type/lint/build gates cover queue payload bounds, durable dispatch recovery, public aggregate
  mapping, OpenAPI contracts, native registration/deep-link paths, and responsive client surfaces.

## External release gates

- Send real pushes through nonprod Expo to physical iOS and Android devices; verify foreground,
  background, terminated-app tap routing, permission denial, logout cleanup, and token rotation.
- Capture Vercel evidence for queue retry, duplicate delivery, receipt recovery, terminal dead
  letter, Cron authorization/lease, and alert thresholds.
- Verify Supabase Realtime fan updates and 15-second fallback polling under two signed-in devices;
  confirm no individual supporter identity is observable.
- Verify quiet hours across Asia/Bangkok, a DST timezone, midnight crossing, global live override,
  and per-match override using controlled fixture events.
- Verify bounded fan heartbeat, Realtime, polling fallback, and goal fan-out behavior with two
  physical devices and controlled nonprod fixture events before production promotion.

Football News, AI summaries, personalized/related/trending ranking, citations, and news alerts are
delivered in Phase 6; see [`../phase-6/README.md`](../phase-6/README.md).
