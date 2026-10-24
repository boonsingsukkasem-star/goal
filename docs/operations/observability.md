# Observability and alerting baseline

Goal does not use Sentry or PostHog. Operational capability is provided through structured service
logs, Vercel Observability including Runtime Cache and Queues, Supabase logs/advisors, and EAS
dashboards.

## Required correlation fields

- API: `service`, `timestamp`, `level`, `requestId`, `method`, `path`, `status`, `durationMs`
- Queue consumer: `service`, `timestamp`, `level`, `messageId`, `topic`, `deliveryCount`,
  `correlationId`, `durationMs`
- Provider calls: `provider`, `operation`, `status`, `durationMs`, `quotaUnits`; never API tokens or
  full user payloads

## Launch alerts

- API 5xx rate above 2% for five minutes
- API p95 latency above 1,000 ms for five minutes
- Live fixture freshness older than 60 seconds during an active match
- Queue oldest-job age above 60 seconds or failed jobs above zero for notification/live queues
- Unpublished AI outbox age above 60 seconds or repeated outbox publish attempts above three
- Unpublished notification outbox age above 60 seconds or repeated publish attempts above three
- Expo ticket/receipt error rate above 5%, any sustained `DeviceNotRegistered` spike, or receipt age
  above 30 minutes
- API-Football/OpenAI 429 or 5xx rate above 5%
- Supabase database storage, connection, or CPU above 80%
- Daily AI/provider spend above 80% of its budget
- News ingestion has no completed run for 30 minutes while Cron is enabled, or zero-citation
  rejection/dead-letter count is above zero

Secrets, authorization headers, cookies, provider tokens, raw email addresses, and notification
payload contents must be redacted. Operational logs are retained for 90 days unless an incident
requires a documented legal hold.

## Phase 3 implementation

- Football queue executions log `messageId`, `topic`, `deliveryCount`, `correlationId`, job type,
  status, and duration for success, duplicate, retry, and dead-letter outcomes.
- API-Football calls log only endpoint operation, HTTP status, duration, and quota unit. Query strings
  and API tokens are never logged.
- `/v1/health/ready` rejects traffic when an active fixture has not refreshed in 60 seconds.
- Alert rules and retention are configured during nonprod promotion and require platform evidence;
  they are not simulated as application tests.

## Phase 4 implementation

- AI analysis rows record model, provider response identifier, input tokens, and output tokens for
  spend attribution without retaining raw prompts in operational logs.
- The AI Queue is capped at two concurrent consumers, retries with bounded backoff, and writes
  terminal or malformed deliveries to the application dead-letter store after validation.
- AI reservation/outbox age, publish attempts, user quota, and automatic system budget remain in
  Supabase for operational reconciliation; acknowledged outbox evidence is retained for seven days.
- OpenAI requests use structured outputs and `store: false`; API keys, canonical input payloads, and
  generated analysis bodies are never written to structured logs.

## Phase 5 implementation

- Notification queue work correlates generation ID, notification ID, Vercel message ID, delivery
  count, and topic without logging title/body, Expo token, or user email.
- Outbox attempts, ticket result, receipt result, terminal dead-letter evidence, and token
  invalidation remain queryable in Supabase under service-role access.
- Fan monitoring uses aggregate supporter counts only. Individual heartbeat rows are excluded from
  Realtime and operational logs.

## Phase 6 implementation

- News ingestion records correlation/message IDs, topic key, language, attempt, article count, model,
  response identifiers, and token totals without logging web-search research or summary bodies.
- Alert on News Cron lease failures, queue oldest age above 15 minutes, repeated ingestion failures,
  dead letters, daily budget above 80%, and unexpected periods with no published stories.
- Citation URL, article headline/summary, favorite identities, and engagement identities are excluded
  from structured logs. Editorial inspection uses service-role database access with an audit trail.

## Phase 7 implementation

- Measure Explore request count, latency, status, selected entity types, result count, API-Football
  latency/status/rate-limit guidance, and cache outcome. Never log query text or favorite identities.
- Alert on sustained Explore 5xx, provider p95 latency above the launch SLO, repeated cache failures,
  and unexpected zero-result rates for subscription-covered API-Football endpoints.
- Use hashed request keys only for cache diagnostics. Profile logs may contain public API-Football
  entity IDs but must not be correlated with an authenticated user identity.
