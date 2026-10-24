# Goal

Production-grade football live score, AI companion, community, and news platform.

## Workspace

- `apps/web` — Next.js web application
- `apps/mobile` — Expo/React Native application for iOS and Android
- `apps/api` — NestJS HTTP API plus Vercel Queue and Runtime Cache adapters
- `packages/*` — shared contracts, domain logic, API client, configuration, and design tokens
- `supabase` — database migrations, RLS policies, functions, and database tests

## Prerequisites

Install these tools before running the project:

- Node.js `22.22.0` or newer in the Node 22 release line (`.nvmrc` is provided)
- pnpm `10.17.1` or compatible `10.x`
- A Supabase Cloud project for development/nonprod
- Xcode and iOS Simulator when developing iOS on macOS
- Android Studio and an Android Emulator when developing Android

Verify the main runtime versions:

```bash
node --version
pnpm --version
```

If `pnpm` is unavailable, enable Corepack and activate the repository version:

```bash
corepack enable
corepack prepare pnpm@10.17.1 --activate
```

## Local setup

Run all commands from the repository root unless a section says otherwise.

### 1. Install dependencies

```bash
pnpm install --frozen-lockfile
```

Use `pnpm install` without `--frozen-lockfile` only when intentionally changing dependencies and the
lockfile.

### 2. Connect Supabase Cloud

All environments use hosted Supabase projects. The API and frontend can run on your
computer while the database, Auth, Realtime, and Storage run in Supabase Cloud.

Link the CLI to the intended development/nonprod project, then inspect and apply migrations:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <PROJECT_REF>
pnpm db:migrations
pnpm db:plan
pnpm db:migrate
```

Configure Auth providers, Site URL, redirect allowlists, SMTP, and Storage in that
project's Dashboard. For development, allow `http://localhost:3000/auth/callback`,
`http://127.0.0.1:3000/auth/callback`, and `goal://auth/callback` as appropriate.
`supabase/config.toml` contains CLI migration metadata; it does not configure hosted Auth.

### 3. Create local environment files

Copy the committed examples. These files are ignored by Git:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Copy the project URL and keys from the Supabase Dashboard into these variables:

| Supabase Cloud value                   | API                        | Web                                    | Mobile                                 |
| -------------------------------------- | -------------------------- | -------------------------------------- | -------------------------------------- |
| Project URL                            | `SUPABASE_URL`             | `NEXT_PUBLIC_SUPABASE_URL`             | `EXPO_PUBLIC_SUPABASE_URL`             |
| Publishable key (`sb_publishable_...`) | `SUPABASE_PUBLISHABLE_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Secret key (`sb_secret_...`)           | `SUPABASE_SECRET_KEY`      | Never expose                           | Never expose                           |

Use the same project URL and publishable key across API, Web, and Mobile for each
environment. The secret key is server-only. Development/nonprod and production
should use separate hosted projects and credentials.

The example files already point Web and Mobile to the local API:

```text
Web:    http://localhost:3000 -> http://localhost:4000
Mobile: Expo app             -> http://localhost:4000
API:    http://localhost:4000 -> https://<PROJECT_REF>.supabase.co
```

Provider keys are optional for starting the local applications, but the corresponding feature will
return a configuration error until its key is supplied:

- `API_FOOTBALL_API_KEY` — live football, fixtures, standings, teams, and players
- `OPENAI_API_KEY` — AI match analysis, comparison, and news summaries
- `EXPO_PUSH_ACCESS_TOKEN` — protected Expo push delivery
- `APPLE_*` — Sign in with Apple token revocation during account deletion

Do not add production secrets to local example files or commit any `.env` file.

### 4. Run the applications

The recommended development setup uses a separate terminal for each long-running process so logs and
Expo keyboard controls remain readable.

Terminal 1 — API:

```bash
pnpm dev:api
```

To enqueue today's news research in Thai and English, keep the API running and use another
terminal:

```bash
pnpm news:run
```

This reads `CRON_SECRET` from `apps/api/.env` and calls the local News Cron endpoint. The scheduled
production Cron runs automatically after deployment; each topic is queued once per UTC day.

Terminal 2 — Web:

```bash
pnpm dev:web
```

Terminal 3 — Mobile:

```bash
pnpm dev:mobile
```

You can alternatively start API, Web, and Mobile together through Turborepo:

```bash
pnpm dev
```

### Local football auto sync

When the standalone API starts with `NODE_ENV=development` and `APP_ENV=nonprod`,
it automatically syncs API-Football fixtures into the configured Supabase Cloud database.
“Local” here refers to the API process on your computer, not the database.
Set `API_FOOTBALL_API_KEY`, `SUPABASE_URL`, and a server-side Supabase key first,
and apply pending database migrations. Starting Web alone does not start the sync.

- Paid plans: yesterday/today/tomorrow first, then the previous seven days and next 27 days.
- Free plans: newly requested dates are limited to yesterday/today/tomorrow, with hourly
  live/detail polling and calendar refresh every six hours to respect the 100/day allowance.
  Opening a match can refresh its details, subject to the shared daily budget and cache.
- While running: live scores every 60 seconds; recent fixtures every five minutes;
  the full calendar every six hours. Games leaving the live feed are fetched again
  to save their final score. Pagination, retry backoff, and a database lease are included.
- No Vercel queue is needed for local football ingestion. This worker only syncs
  football data; it does not send notifications or generate AI analyses automatically.
- Stop the API to stop syncing, or set `FOOTBALL_LOCAL_AUTO_SYNC=false` in
  `apps/api/.env`. Vercel deployments continue using the existing Cron/Queue workers.

Look for `FootballLocalSync` / `local_football_page_synced` in API logs. If the log
reports a missing migration, apply it once (use `pnpm exec supabase db push --linked`
for the intended linked project). The runner retries after the migration is applied.
Home shows the plan, refresh frequency, last live update, and sync/quota issues.
An empty date can still mean there are no fixtures available under the API-Football plan;
refreshing the UI alone does not import fixtures.

### 5. Open and verify the services

| Application             | Address                                                       |
| ----------------------- | ------------------------------------------------------------- |
| Web                     | `http://localhost:3000`                                       |
| API health              | `http://localhost:4000/v1/health`                             |
| API readiness           | `http://localhost:4000/v1/health/ready`                       |
| Swagger UI              | `http://localhost:4000/docs`                                  |
| Expo development server | Shown in the `pnpm dev:mobile` terminal, normally port `8081` |

Quick API checks:

```bash
curl -fsS http://localhost:4000/v1/health
curl -fsS http://localhost:4000/v1/health/ready
```

Swagger is enabled by default in the local/nonprod environment. It is disabled by production
configuration.

## Running Mobile

After `pnpm dev:mobile` starts, use the Expo terminal controls to open the app:

- Press `i` for iOS Simulator
- Press `a` for Android Emulator
- Scan the QR code for a physical device on the same network

You may also start a platform directly:

```bash
pnpm --filter @goal-app/mobile ios
pnpm --filter @goal-app/mobile android
```

`localhost` inside a physical phone refers to that phone, not the development computer. For a physical
device, replace the API and Web hosts in `apps/mobile/.env` with the computer's LAN IP, for
example `http://192.168.1.20:4000`, and allow those ports through the local firewall. Keep the
Supabase URL pointing to the hosted project.

For the standard Android Emulator, use `10.0.2.2` instead of `localhost`. The iOS Simulator can normally
reach services through `localhost`.

Expo Go is sufficient for basic screen development. Push credentials, Sign in with Apple, deep-link
behavior, and other native production capabilities must be verified with an EAS development/nonprod
build on physical devices.

## Database commands

These commands operate on the linked Supabase Cloud project:

```bash
# Compare repository migrations with the connected project's history
pnpm db:migrations

# Preview pending changes without applying them
pnpm db:plan

# Apply pending migrations
pnpm db:migrate
```

For isolated SQL/RLS validation, use a dedicated Supabase Cloud test project and the
procedure in `docs/runbooks/database-migrations.md`.

## Generated API client

Web and Mobile consume the Swagger/OpenAPI contract through the shared Orval client. Regenerate it after
changing API controllers, DTOs, or shared contracts:

```bash
pnpm orval:generate
```

Verify that committed generated files are current:

```bash
pnpm orval:check
```

## Quality checks

Before handing off or deploying a change, run:

```bash
pnpm format:check
pnpm check
pnpm audit:prod
```

`pnpm check` runs security regression checks, secret scanning, Orval drift detection, lint, type checking,
tests, production builds, and the API production-artifact smoke test across the monorepo.

Useful focused commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Common problems

### Supabase connection fails or football data is empty

Check that the cloud project is available and that the project URL and API keys
match it. Use `pnpm db:migrations` / `pnpm db:plan` to check schema state. A DNS error
such as `ENOTFOUND` must be resolved before migrations or data queries can work.
For empty football data, check the API's `FootballLocalSync` logs and API-Football
configuration; starting the frontend alone does not import data.

### API starts but a feature reports that it is not configured

Check the relevant provider variable in `apps/api/.env`, then restart the API. Football requires
API-Football, AI/news requires OpenAI, and authenticated data requires all three Supabase variables.

### Web or Mobile cannot reach the API

Confirm `/v1/health` responds first. Check `NEXT_PUBLIC_API_URL`/`GOAL_API_URL` for Web and
`EXPO_PUBLIC_API_URL` for Mobile. Restart the dev server after changing environment variables.

### Generated client is out of date

Run `pnpm orval:generate`, review the generated diff, then run `pnpm orval:check` and `pnpm check`.

## Architecture and delivery documentation

- System architecture: [`docs/architecture/system.md`](docs/architecture/system.md)
- Football data ownership: [`docs/architecture/data-ownership.md`](docs/architecture/data-ownership.md)
- Phase 0 decisions and production inputs: [`docs/phase-0/README.md`](docs/phase-0/README.md)
- Phase 2 authentication: [`docs/phase-2/README.md`](docs/phase-2/README.md)
- Phase 3 football data and Match Centre: [`docs/phase-3/README.md`](docs/phase-3/README.md)
- Phase 4 AI Match Companion and Orval: [`docs/phase-4/README.md`](docs/phase-4/README.md)
- Phase 5 community and notifications: [`docs/phase-5/README.md`](docs/phase-5/README.md)
- Phase 6 football news: [`docs/phase-6/README.md`](docs/phase-6/README.md)
- Phase 7 discovery and profiles: [`docs/phase-7/README.md`](docs/phase-7/README.md)
- Phase 8 fixtures and complete match detail: [`docs/phase-8/README.md`](docs/phase-8/README.md)
- Phase 9 deployment and Store launch: [`docs/phase-9/README.md`](docs/phase-9/README.md)

## API-Football cutover

See [the cutover runbook](docs/runbooks/api-football-cutover.md) for schema, identity, quota,
xG, momentum, and rollout details. Supabase URL and API keys are application credentials.
Schema migrations use the existing Supabase CLI login; a personal access token is only an
alternative CLI login method and is not required in the application environment.

Run Cloud database regressions with `pnpm db:test` (or `pnpm db:test api_football` for the provider tests). The runner uses the linked project and rolls back every test, including its temporary pgTAP extension. No Docker is used.
