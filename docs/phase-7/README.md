> Historical phase notes. The API-Football cutover supersedes provider, identity and synchronization details here; see [the current runbook](../runbooks/api-football-cutover.md).

# Phase 7 — Explore and football discovery

Status: implementation and local application gates complete; nonprod provider-plan, accessibility,
and physical-device evidence remain external promotion gates.

## Delivered

- A public discovery journey for leagues, teams, and players from Sportmonks.
- Search and browse share the official provider pagination model, enforce a 2–80 character query,
  cap provider pages at 50 items, and cache reproducible responses for five minutes.
- League, team, and player profiles resolve current identity from Sportmonks. League standings,
  team fixtures, and player appearances use Goal's normalized match read model as contextual data.
- Stable Swagger operation IDs and Zod-derived response schemas. Next.js and Expo consume only the
  Orval-generated client with runtime response validation.
- Loading, outage, empty-result, short-query, and deleted-entity states, plus profile and match links.

## API

- `GET /v1/football/explore?q=&types=&limit=` — `types` accepts a comma-separated subset of
  `league,team,player`. Mixed results are round-robin merged so no entity type starves another.
- `GET /v1/football/comparison-options?entityType=&q=&page=&perPage=` — provider-native lazy pages
  for comparison dropdowns.
- `GET /v1/football/leagues/:leagueId` — provider identity plus selected season, standings, and up
  to 20 contextual fixtures.
- `GET /v1/football/teams/:teamId` and `GET /v1/football/players/:playerId` — provider identity plus
  contextual normalized match data.

## Data ownership and security invariants

- Sportmonks is authoritative for league/team/player identity. Clients never receive its API token
  and never call it directly.
- Vercel Runtime Cache stores only disposable provider responses for 300 seconds. Cache failures fail
  open to Sportmonks; cache entries are never used for quotas, authorization, or durable state.
- Supabase stores fixture/event/lineup/standing snapshots needed for live-score reads, plus Goal-owned
  user, AI, queue, notification, and news state. It is not used as the complete entity catalog.
- Favorites store only provider entity type/ID. The NestJS API validates additions against Sportmonks,
  performs the privileged write, and hydrates current display fields from the shared gateway.
- News scheduling ranks entity IDs in Supabase but resolves current names through Sportmonks before
  constructing a search topic. News entity links do not require duplicated local catalog rows.

## Verification

- Unit tests cover official league/team/player endpoints, provider pagination, caching, 404 versus
  outage semantics, mixed-result fairness, favorite validation, and provider-name news topics.
- pgTAP verifies least-privilege favorite/news writes and permits provider IDs not present in the
  normalized fixture read model.
- Repository formatting, lint, typecheck, unit, build, artifact, secret, and production dependency
  gates remain required by `pnpm check` and `pnpm audit:prod`.

## External release gates

- Verify nonprod Sportmonks subscription access for leagues, teams, players, search, profiles,
  fixtures, standings, and optional enrichments.
- Record provider latency, Vercel Runtime Cache hit rate, rate-limit behavior, and empty-page behavior.
- Complete keyboard/screen-reader checks on web and VoiceOver/TalkBack tests on physical devices.
- Complete nonprod EAS builds and profile/match deep-link tests before promotion.
