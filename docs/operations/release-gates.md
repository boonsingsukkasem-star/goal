# Release gates

## Every change

- Frozen-lockfile install
- `pnpm check`
- `pnpm audit:prod`
- Secret scan through `pnpm test:secrets` (also included in `pnpm check`)
- Node 22 production-artifact initialization (included in `pnpm check` after builds)
- Preview build for affected Vercel project

## Database changes

- Local reset from migrations
- pgTAP database tests
- Dry-run against nonprod, then nonprod smoke test
- Production dry-run and reviewed forward-migration plan

## Vercel platform changes

- Runtime Cache contains no source-of-truth, lock, quota, or authentication data
- Queue producers use stable idempotency keys and versioned payloads
- Queue consumers pass duplicate, out-of-order, retry, timeout, and terminal-failure tests
- Terminal failures persist to Supabase before the queue message is acknowledged
- Cron endpoints validate `CRON_SECRET`, use a database lease, and only enqueue/reconcile work
- Nonprod smoke test confirms the Function, Queue, Runtime Cache, Cron, Supabase, and provider
  regions are aligned
- Vercel Firewall rules protect public API routes before production traffic is enabled

Code-level gates are enforced by repository commands. Platform, provider, regional, and physical
device gates require captured nonprod evidence and cannot be marked successful from local mocks.

## Mobile changes

- Native development build tests on iOS and Android
- Nonprod EAS build/update before prod promotion
- Promote the exact tested update artifact; do not rebuild different code for prod
- Confirm runtime-version compatibility and rollback path
- Verify Email, Google, Facebook, and Sign in with Apple on a physical iOS device
- Verify account linking, provider revocation, and in-app account deletion
- Verify Expo notification permission timing, APNs/FCM delivery, foreground/background/terminated
  behavior, match deep links, token rotation, logout disable, and receipt invalidation

## Community and notifications

- Cross-user favorites, follows, preferences, notification history, fan presence, and device-token
  access remain denied; anonymous users can read only fan aggregate rows
- Queue duplicate/out-of-order/generation-mismatch tests and outbox recovery pass
- Quiet hours are tested across midnight and a DST timezone with global and per-match live overrides
- Real Expo ticket and receipt evidence is captured on physical iOS and Android devices
- Fan Realtime, fallback polling, and fan-out are functionally verified with two physical devices
  and controlled nonprod fixture events

## Authentication changes

- Supabase uses an asymmetric JWT signing key and the API verifies the production JWKS
- Exact web and `goal://auth/callback` allowlists are reviewed in both environments
- Supabase secret and Apple private keys exist only in the API project; the legacy service-role key
  is restricted to local stacks that do not expose a secret key
- Cross-user RLS, expired/revoked JWT, account-linking, and deletion tests pass
- Retention Cron rejects invalid authorization and records success/failure idempotently
- Web session cookies are confirmed Secure, SameSite=Lax, and browser-readable for Supabase refresh
  rotation; refresh and callback responses are private/no-store on the deployed domain

## AI-curated news

- Production trusted-domain allowlist and Thai editorial policy receive explicit approval
- Every rendered summary exposes at least one approved HTTPS citation and no full article body
- Queue duplicate, retry, stale-claim, daily-budget exhaustion, and terminal-dead-letter evidence pass
- Latest, trending, personalized, and match-related ranking are verified with deterministic fixtures
- Breaking/trending alerts require explicit preferences and stay within quiet hours and two/day cap
- Physical iOS and Android verify citation links and News routing from notification taps
- Retraction/correction runbook, copyright review, and 90-day content/engagement retention are approved

## Explore and profiles

- League/team/player discovery and profiles resolve identity through the shared API-Football gateway
- Query/type/page/limit bounds, provider empty-page handling, and runtime response validation pass
- Nonprod provider p50/p95, rate-limit behavior, and Runtime Cache hit-rate evidence are captured
- Keyboard/screen-reader web checks and physical iOS/Android accessibility and deep-link checks pass
- Alerts cover catalog/profile 5xx, provider latency/error, Runtime Cache errors, and zero-result anomalies

Vercel's Git integration may implement these gates from GitHub, GitLab, Bitbucket, or Azure DevOps.
The repository intentionally contains no GitHub Actions workflow, but branch protection must still
require the checks above before production deployment.
