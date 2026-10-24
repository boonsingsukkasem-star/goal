# Football data ownership

API-Football is the source of fixture and catalog facts. GOAL owns its identifiers and derived metrics.
Supabase Cloud is the durable read model and operational database. No local Supabase/Docker is used.

| Data | Authority | Persistence |
| --- | --- | --- |
| League/team/player/fixture identity | GOAL internal ID, unique API-Football upstream ID | Normalized catalog and fixtures |
| Scores/events/lineups/statistics/standings | API-Football | Atomic ingestion RPCs; omitted detail sections preserve prior data |
| xG | API-Football, when actually returned | Statistic with source attribution; missing values are not zero |
| Attacking momentum | GOAL attacking-activity-v1 | Versioned metric, inputs, timestamps, short-lived statistics snapshots |
| AI explanation | Model interpretation of recorded evidence | Immutable AI input snapshots, generation and quota ledgers |
| Favorites/follows/news entity links | GOAL user/system | GOAL IDs, never upstream IDs |

Catalog browsing reads synchronized entities. Search misses can query API-Football and persist the
returned identity before exposing its GOAL route. This is a partial catalog, not a claim to cover all
players or teams. League/season coverage comes from the provider and may change.

The cutover archives prior football identities by leaving their upstream API-Football ID null.
Those IDs remain valid for existing user references; they are excluded from new calendars/catalogs.
User/Auth data is retained. Historical migration files remain immutable; old provider write routines
are removed by the cutover migration. Pending old football queue messages fail version validation.

Only server-side service-role operations ingest football data, reserve upstream quota or calculate
momentum. Public clients can read approved projections, never call the provider with server keys.
