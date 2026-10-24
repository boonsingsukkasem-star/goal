> Historical phase notes. The API-Football cutover supersedes provider, identity and synchronization details here; see [the current runbook](../runbooks/api-football-cutover.md).

# Phase 8 — Core football UX completion

Status: implementation complete.

## Delivered

- First-class Fixtures & Results screens on Next.js and Expo with three bounded views: the previous 30 days, today, and the next 30 days.
- Cursor pagination remains canonical and now binds the cursor to ascending or descending chronology. Results request descending order so the newest completed match appears first; today and upcoming fixtures remain chronological.
- Clear loading, dependency-error, retry, empty, live, scheduled, and scored states without treating an API outage as an empty fixture window.
- Complete Match Detail presentation for events, cards/substitutions, related players, formations, lineups, match statistics, and score breakdowns on web and mobile.
- League, team, player, and match links connect Match Detail, Fixtures & Results, and the Phase 7 discovery/profile journey.
- Contextual favorite controls on League, Team, and Player Profile screens. Signed-out users are directed to authentication; signed-in users receive current add/remove state and recoverable mutation errors.
- Community favorite management no longer accepts raw Sportmonks IDs. Users discover an entity, favorite it from its profile, and see a hydrated canonical name linked back to that profile.
- Swagger documents fixture ordering and Orval regenerates the shared web/mobile client. Existing runtime response validation continues to cover every successful operation.

## API contract changes

- `GET /v1/football/fixtures` accepts `order=asc|desc`, defaulting to `asc`.
- Fixture cursors include their chronology and are rejected when reused with a different requested order.
- `GET /v1/community/me/favorites` now includes canonical `name` and nullable `imageUrl` for every returned entity; missing canonical records are not exposed as broken favorites.

## Explicitly excluded by product direction

- No test-coverage initiative or coverage-percentage target was added.
- No load test was created or executed.
- No release checklist was created.
- No incident or outage runbook was created for football data, AI, or news dependencies.

Normal repository lint, typecheck, existing unit/integration tests, generated-client drift checks, production builds, artifact smoke checks, secret scanning, and dependency auditing remain unchanged quality gates for implementation work.
