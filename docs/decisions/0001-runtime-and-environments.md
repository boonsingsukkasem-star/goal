# ADR 0001 — Runtime and environments

Status: accepted

## Decision

- `goal.co.th` and the Next.js web app run on Vercel.
- The NestJS API runs on Vercel Functions with Fluid compute.
- Sportmonks remains the authoritative upstream source for football provider data. Supabase provides
  Postgres, Auth, Realtime, and Storage and is the durable source for Goal-owned state plus the
  normalized football read model; it is not a replacement team/player provider catalog.
- Vercel Runtime Cache stores reproducible query results and computed values only.
- Vercel Queues provides asynchronous delivery, retries, delayed delivery, and fan-out.
- Vercel Cron starts scheduled work and publishes queue commands; it does not process long jobs.
- Vercel Firewall supplies IP/route rate limiting. Supabase enforces authenticated business quotas.
- The repository does not use Redis, BullMQ, or an always-on worker.
- Shared infrastructure has exactly two isolation boundaries: `nonprod` and `prod`; local
  development is not a shared environment.

Every environment uses separate Vercel projects/environments, Supabase projects, queue topics,
provider credentials, EAS channels, and OpenAI budgets. Production secrets are not exposed to
preview deployments.

## Reliability rules

Runtime Cache is ephemeral and never stores locks, rate-limit counters, job state, user state, or
any value that cannot be recreated. Cache keys include a schema version; live entries use short TTLs
and fixture/league tags, while stable reference data may use longer TTLs.

Queue consumers assume at-least-once and out-of-order delivery. Every producer supplies a stable
idempotency key, every payload has a schema version and correlation ID, and each consumer records
completion in `app_private.processed_events`. Domain changes publish through the transactional
outbox. Exhausted jobs are recorded in `app_private.dead_letter_events` before acknowledgment.

Cron endpoints require `CRON_SECRET`, a unique scheduled execution record, and a short database
lease. A failed Cron invocation is recovered by the next reconciliation run rather than relying on
Cron retries.

Vercel Queues is isolated behind the queue publisher/consumer boundary. Domain services depend on
job contracts rather than the Vercel SDK so another delivery provider can be introduced without
rewriting football, news, notification, or AI domain logic.
