import { z } from "zod";

const id = z.number().int().positive();
const team = z
  .object({
    id,
    name: z.string().min(1),
    logo: z.string().nullish(),
    winner: z.boolean().nullish(),
  })
  .passthrough();
export const apiFootballFixtureSchema = z
  .object({
    fixture: z
      .object({
        id,
        date: z.string().datetime({ offset: true }),
        timestamp: z.number(),
        status: z
          .object({
            short: z.string(),
            long: z.string(),
            elapsed: z.number().nullish(),
            extra: z.number().nullish(),
          })
          .passthrough(),
      })
      .passthrough(),
    league: z
      .object({
        id,
        name: z.string(),
        season: z.number().int(),
        round: z.string().nullish(),
        logo: z.string().nullish(),
      })
      .passthrough(),
    teams: z.object({ home: team, away: team }),
    goals: z.object({ home: z.number().nullish(), away: z.number().nullish() }),
    score: z
      .record(z.string(), z.object({ home: z.number().nullish(), away: z.number().nullish() }))
      .optional(),
    // Omitted sections are deliberately distinct from successfully fetched empty arrays.
    events: z.array(z.record(z.string(), z.unknown())).optional(),
    lineups: z.array(z.record(z.string(), z.unknown())).optional(),
    statistics: z
      .array(
        z.object({
          team,
          statistics: z.array(
            z.object({ type: z.string(), value: z.union([z.string(), z.number(), z.null()]) }),
          ),
        }),
      )
      .optional(),
    players: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();
export type ApiFootballFixture = z.infer<typeof apiFootballFixtureSchema>;
export const apiFootballEnvelopeSchema = z.object({
  errors: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]),
  results: z.number().int().nonnegative(),
  paging: z
    .object({ current: z.number().int().positive(), total: z.number().int().positive() })
    .optional(),
  response: z.array(z.unknown()),
});
export const liveStatusCodes = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);
export const finishedStatusCodes = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
