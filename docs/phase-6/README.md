> Historical phase notes. The API-Football cutover supersedes provider, identity and synchronization details here; see [the current runbook](../runbooks/api-football-cutover.md).

# Phase 6 — AI-curated football news

Status: implementation and local gates complete; nonprod editorial, provider, queue, and store-review
evidence remain external promotion gates.

## Delivered

- AI-curated football story clusters from OpenAI Responses API web search. Search is restricted to a
  configurable HTTPS domain allowlist, uses `store: false`, and never copies full source articles.
- A second structured-output pass produces Thai or English headline, concise summary, one-to-five
  key points, category, importance, breaking status, and confidence. A story is rejected unless it
  retains at least one approved citation.
- Durable source provenance with canonical URL, title, domain, source position, OpenAI response IDs,
  model, token usage, and a deterministic source fingerprint. Repeated ingestion updates the same
  story cluster rather than creating duplicates.
- Global topics plus bounded team/player/league topics derived from aggregate favorite demand and
  upcoming canonical fixtures. Supabase ranks only provider IDs; NestJS resolves the current entity
  name from Sportmonks before constructing the topic. No user ID or favorite relationship is sent
  to OpenAI.
- Vercel Cron schedules at most the configured topic budget every 15 minutes. A Vercel Queue worker
  performs search and summarization with retry, daily system quota, stale-claim recovery, inbox
  idempotency, and terminal dead-letter evidence in Supabase.
- Latest, trending, personalized, and match-related ranking. Personalized results include explicit
  favorite-team/player/league or trending reasons; related news uses fixture league, teams, and
  lineup players; trending combines importance, citation count, distinct authenticated opens, and
  freshness.
- Breaking/trending push fan-out through the existing notification queue in 250-user cursor batches.
  Alerts require an explicit preference, relevant favorite, editorial thresholds, quiet-hour
  scheduling, per-story deduplication, and a hard maximum of two news alerts per user per day.
- Responsive Next.js and Expo news surfaces with latest/trending/for-you tabs, loading/error/empty
  states, pagination, AI disclosure, visible clickable citations, and related news on every match
  page. Notification taps route to News. Both apps call the Orval-generated client.

## API and platform

- `GET /v1/news`
- `GET /v1/news/trending`
- `GET /v1/news/me` — authenticated personalized feed
- `GET /v1/news/related/matches/:fixtureId`
- `POST /v1/news/:articleId/engagement` — authenticated, idempotent, 50 unique opens/day maximum

Swagger owns all schemas and stable operation IDs. `openapi/goal-api.json` and
`packages/api-client/src/generated` are regenerated from NestJS and protected by the Orval drift
gate.

The private `api/news-ingestion.ts` function consumes the `news-ingestion` queue with maximum
concurrency two and bounded exponential retry. `GET /v1/internal/cron/news` is protected by
`CRON_SECRET`, obtains a database lease, enqueues deterministic 15-minute topic buckets, and runs
retention; it does not call OpenAI inline. The same pass idempotently reconciles important news
notification fan-outs from the previous 24 hours, so a transient Queue outage cannot lose alerts.

## Data, security, and lifecycle invariants

- Every news table uses forced RLS and grants no direct access to `anon` or `authenticated`. NestJS
  maps only the public article contract and never exposes model response IDs, token counts, raw
  research output, or engagement identities.
- Source URLs must be HTTPS and pass the server allowlist before persistence. The clients show every
  retained citation as an external link and label summaries as AI-generated.
- Public story clusters expire after 90 days. Authenticated engagement signals expire after 90 days,
  ingestion runs after 30 days, and daily cost ledgers after 90 days. Account deletion immediately
  cascades that user's engagements.
- Daily OpenAI quota reservation, uniqueness, ranking signals, notification caps, quiet hours,
  leases, inbox records, and dead-letter evidence live in Supabase—not Runtime Cache.
- News links store Sportmonks entity type/ID references and do not require that an entity already
  exists in Goal's normalized fixture read model.
- Runtime Cache holds only 60-second reproducible trending responses and is invalidated after a
  successful ingestion. Cache reads and writes fail open, and staleness is bounded by that TTL.
- Web-search research and structured summaries are not logged. Operational logging must contain only
  message/correlation IDs, outcome, duration, provider status, and token totals.

## Environment configuration

- `NEWS_ALLOWED_DOMAINS` — one to 100 trusted bare domains; production editorial approval required.
- `NEWS_GLOBAL_TOPICS` — one to ten bounded football topics.
- `NEWS_INGESTION_LANGUAGES` — `th`, `en`, or both.
- `NEWS_MAX_TOPICS_PER_RUN` — 1–50 topics per Cron execution.
- `NEWS_SYSTEM_DAILY_LIMIT` — 1–1,000 successful first-time OpenAI reservations per UTC day.
- `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_TIMEOUT_MS` remain server-side.
- Vercel must bind the `news-ingestion` queue and 15-minute News Cron to the API project.

## Verification completed locally

- Clean migration replay and pgTAP cover forced RLS/grants, atomic cited publication,
  personalization reasons, match relation, trending eligibility, engagement idempotency, atomic
  budget reservation, duplicate claims, cost exhaustion, notification eligibility, quiet-hour
  deferral, durable notification outbox, consumer inbox evidence, and retention.
- Unit tests cover queue schema bounds, incomplete entity rejection, approved-domain citation
  filtering, tracking-parameter removal, absent-key failure, structured output, ingestion budget
  short-circuit, cache invalidation, notification fan-out, and stable OpenAPI operation IDs.
- Repository gates verify formatting, lint, type safety, generated-client drift, unit tests,
  production builds, artifact initialization, secret scan, and production dependency audit.

## External release gates

- Editorially approve the production domain allowlist and test confirmed, disputed, transfer-rumor,
  correction, and retraction cases in Thai before enabling Cron.
- Capture nonprod evidence for OpenAI web-search citations, daily quota exhaustion, 429/5xx retry,
  duplicate delivery, stale claim, queue terminal dead letter, cache invalidation, and Cron lease.
- Confirm all rendered citations open the intended source on web, physical iOS, and physical Android;
  validate News routing from foreground, background, and terminated notification taps.
- Validate copyright/editorial review: no full article body or paywalled text is stored or rendered,
  rumor language is qualified, and a retraction can be applied through a controlled service-role
  operation.
- Verify public feed/trending pagination and notification fan-out with controlled nonprod data, then
  configure alerts for ingestion age, zero-citation rejection, OpenAI errors, budget use, queue age,
  and dead letters.
