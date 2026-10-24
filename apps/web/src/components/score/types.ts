export type MatchCardInsight = {
  fixtureId: number;
  keyFactor: string | null;
  momentum: {
    intensity: number;
    teamId: number | null;
  } | null;
};
