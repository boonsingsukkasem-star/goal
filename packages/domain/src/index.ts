export const matchStates = [
  "scheduled",
  "live",
  "half-time",
  "finished",
  "postponed",
  "cancelled",
] as const;

export type MatchState = (typeof matchStates)[number];

export function isLiveMatch(state: MatchState): boolean {
  return state === "live" || state === "half-time";
}
