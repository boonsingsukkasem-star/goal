> Historical phase notes. The API-Football cutover supersedes provider, identity and synchronization details here; see [the current runbook](../runbooks/api-football-cutover.md).

# Phase 0 — Product and technical decisions

Status: foundation approved; external production inputs remain open.

## Locked decisions

- Product: football live score, AI football companion, community features, and football news.
- Navigation: Home → Live → Match → AI Analysis → News → Explore.
- Web: Next.js and shadcn/ui, deployed to Vercel.
- Native mobile: Expo, Expo Router, NativeWind, and React Native Reusables.
- Mobile delivery: Expo Notifications, EAS Build, EAS Submit, and EAS Update.
- API: NestJS.
- Data/auth/realtime/storage: Supabase.
- Football data: Sportmonks Football API plus xG and Pressure Index.
- AI and news: OpenAI Responses API with web search and clickable source citations.
- Cache and jobs: Vercel Runtime Cache, Vercel Queues, and Vercel Cron. Supabase stores outbox,
  idempotency, execution, lease, and dead-letter state.
- Repository: pnpm workspaces and Turborepo.
- Explicitly excluded: Sentry, PostHog, GitHub Actions, Railway, and Render.
- Product name: Goal.
- Primary domain: `goal.co.th`.
- Environments: `nonprod` and `prod` (plus local development).
- Authentication delivered in Phase 2: email/password, Facebook, Google, and Sign in with Apple on
  iOS. Public football and news browsing remains available without an account.

## Brand foundation

- Primary: `#FFD700`
- Secondary: `#121212`
- Tertiary: `#00F1FF`
- Neutral: `#000000`
- Headline and label: Archivo Narrow
- Body: Hanken Grotesk
- Theme: dark-first; semantic color tokens are shared by web and mobile.

## Open production inputs

These do not block repository development, but they block a production launch:

1. Legal entity name and postal address for the final privacy notice and terms.
2. Launch competitions and verified Sportmonks data coverage for each competition.
3. Sportmonks plan and API token.
4. Nonprod/prod Supabase project references and publishable/secret keys.
5. Nonprod/prod Vercel projects on Pro, queue regions aligned with Supabase, Cron secrets, and
   reviewed Firewall rate-limit rules.
6. OpenAI project and API key.
7. Apple Developer and Google Play Console accounts, including Apple Sign in capability and keys.
8. Trusted news-domain allowlist and editorial policy.
9. Explicit production acceptance of Vercel Queues' current public-beta lifecycle, with the
   provider adapter and Supabase durability records kept as the exit strategy.

## Provisional values

- Mobile scheme: `goal`
- Bundle identifiers: `th.co.goal.app`
- Default locale: Thai (`th-TH`), with data models prepared for additional locales.

Linking the app with `eas init` will write the real EAS project ID and update URL; OTA updates
remain intentionally unlinked until that production input exists.
