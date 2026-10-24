> Historical phase notes. The API-Football cutover supersedes provider, identity and synchronization details here; see [the current runbook](../runbooks/api-football-cutover.md).

# Phase 4 — AI Football Companion and generated clients

Status: implementation and local gates complete; real-provider evaluation and deployed nonprod
evidence remain external promotion gates.

## Delivered

- Match AI analysis covering tactical shape, strengths/weaknesses, match explanation, key-moment
  summary, momentum timeline, and explainable player ratings in one evidence-grounded structured
  result.
- Automatic Thai analysis at half-time and full-time. Sportmonks live polling reserves each
  milestone once, enforces a production league allowlist and a transactional system-wide UTC daily
  budget, so the 10-second score loop cannot repeatedly call OpenAI or exceed the configured cap.
- Authenticated on-demand refresh with a transactional daily quota shared by match analysis and AI
  Compare. Repeated requests against the same source revision are free and reuse queued/running/
  completed work.
- Team-vs-team and player-vs-player comparison endpoints and responsive Compare screens on Next.js
  and Expo. Work executes asynchronously through the same bounded Vercel Queue and remains visible
  only to the requesting user.
- Canonical fixture statistics ingestion (`statistics;statistics.type`) for stronger tactical
  evidence. The model receives Goal's normalized match contract, never an unvalidated provider
  response.
- OpenAI Responses API structured outputs, explicit low reasoning effort, configurable model,
  120-second provider timeout, no SDK retries inside the queue delivery, and `store: false`.
- Immutable canonical input snapshots and generation IDs prevent delayed or duplicate queue
  deliveries from mixing football revisions. Stale running work is reclaimable after a bounded
  lease.
- AI reservations and durable outbox records commit in the same Supabase transaction. Immediate
  dispatch reduces latency; the authenticated minute Cron recovers unpublished records with stable
  Vercel Queue idempotency keys and bounded publish backoff.
- Token accounting, 30-day analysis/comparison retention, 90-day quota-ledger retention,
  seven-day acknowledged-outbox retention, account-deletion cascade for owned comparisons,
  malformed-message quarantine, bounded retry, terminal dead-letter evidence, and a Queue
  concurrency cap of two.
- A shared Orval Fetch client generated from the committed NestJS OpenAPI 3.1 document. Next.js and
  Expo both use generated operations and models; the handwritten endpoint client was removed.
- A deterministic generation gate (`pnpm orval:check`) in `pnpm check`, stable Swagger operation
  IDs, generated-code formatting, standard API error propagation, and Zod validation of every
  successful generated operation through the shared fetcher. A parity test fails if Swagger gains
  an operation without a runtime response validator.
- Responsive AI Match Companion panels on Next.js and Expo using the cyan AI semantic color, with
  signed-in CTA, queued/running/failed states, bounded polling, confidence disclosure, and an AI
  accuracy notice.

## API

- `GET /v1/ai/matches/:fixtureId/analysis?language=th|en` — public latest-result/status read.
- `POST /v1/ai/matches/:fixtureId/analysis?language=th|en` — authenticated idempotent request.
- `POST /v1/ai/comparisons` — authenticated asynchronous team/player comparison request.
- `GET /v1/ai/comparisons/:comparisonId` — authenticated owner-only status/result read.
- `GET /v1/football/comparison-options` — direct Sportmonks player/team browse and search with
  provider pagination and a five-minute Runtime Cache; no Supabase catalog synchronization.

The comparison request is:

```json
{
  "entityType": "team",
  "leftId": 9,
  "rightId": 14,
  "language": "th"
}
```

The private `api/ai-analysis.ts` function consumes the `ai-analysis` topic. It has a 300-second
function duration, 360-second visibility lease, maximum concurrency of two, exponential retry capped
at 15 minutes, and application dead-letter evidence after delivery eight.

`GET /v1/internal/cron/ai-outbox` runs every minute under `CRON_SECRET` and a Supabase execution
lease. It only dispatches already-committed outbox work; it does not generate AI output inline.

## OpenAPI and Orval workflow

```bash
pnpm openapi:generate
pnpm orval:generate
pnpm orval:check
```

The source of truth is NestJS decorators plus shared Zod response schemas. The generated artifact is
`openapi/goal-api.json`; generated clients and models live in
`packages/api-client/src/generated`. Do not hand-edit generated files.

## Environment

- `OPENAI_API_KEY` — required in production and server-side only.
- `OPENAI_MODEL` — defaults to `gpt-5.6-sol`; select a pinned/approved model in each environment.
- `OPENAI_TIMEOUT_MS` — defaults to 120000.
- `AI_DAILY_REQUEST_LIMIT` — defaults to 20 per authenticated user per UTC day.
- `AI_SYSTEM_DAILY_LIMIT` — defaults to 100 automatic milestone generations per UTC day.
- `AI_AUTO_LEAGUE_IDS` — comma-separated Sportmonks league IDs eligible for automatic generation;
  required and non-empty in production.

Match analysis does not use web search because the authoritative evidence is the live Sportmonks
snapshot normalized in Supabase. Web search and clickable citations remain required for the later
football-news phase.

## Verification completed locally

- OpenAPI generation and Orval regeneration are deterministic.
- Swagger documents success/auth/quota/not-found contracts and stable operation IDs for football,
  match AI, and AI Compare.
- 141 pgTAP assertions cover AI tables, forced RLS, server-only function privileges, shared quota, retry quota,
  request deduplication, automatic milestone deduplication, comparison deduplication, statistics
  access, immutable snapshots, transactional outbox, automatic budget/allowlist, retention, and
  dead-letter function access.
- Unit/type/lint/build gates cover structured-output configuration, queue contracts, server/mobile/
  web generated client use, durable dispatch recovery, runtime response validation, Compare, and the
  Match Companion state UI.

## External release gates

- Add nonprod/prod OpenAI project keys and budgets, then run a representative Thai/English football
  evaluation set for factuality, schema pass rate, latency, token cost, refusals, and sparse-data
  behavior.
- Verify half-time/full-time Vercel Queue triggers, retry timing, terminal dead letters, concurrency,
  and daily spend alerts in deployed nonprod.
- Compare AI output against representative matches with analysts and define the acceptance threshold
  before production promotion.
- Test signed-in CTA and polling on physical iOS/Android devices and the deployed Next.js origin.

Contextual push delivery now consumes high-confidence match-analysis signals in Phase 5; news
summaries and web-search citations remain in the news phase.
