/** GOAL attacking activity v1. A heuristic, not a goal probability or vendor Pressure Index. */
export const momentumModelVersion = "attacking-activity-v1";
export type StatSnapshot = {
  captured_at: string;
  minute: number;
  extra: number;
  statistics: { teamId: number; type: string; value: number | string | null }[];
};
export function calculateMomentum(previous: StatSnapshot, current: StatSnapshot) {
  const seconds = (Date.parse(current.captured_at) - Date.parse(previous.captured_at)) / 1000;
  const minuteDelta = current.minute + current.extra - previous.minute - previous.extra;
  // Do not bridge a collection outage, halftime break, or a provider clock correction.
  if (seconds < 30 || seconds > 180 || minuteDelta <= 0 || minuteDelta > 3) return [];
  const weights = { SHOTS_ON_GOAL: 3, TOTAL_SHOTS: 1, CORNER_KICKS: 1.5 };
  const teams = [...new Set(current.statistics.map((s) => s.teamId))];
  if (teams.length !== 2) return [];
  return teams.flatMap((teamId) => {
    const deltas: Record<string, number> = {};
    for (const [type] of Object.entries(weights)) {
      const before = previous.statistics.find((s) => s.teamId === teamId && s.type === type)?.value;
      const after = current.statistics.find((s) => s.teamId === teamId && s.type === type)?.value;
      if (
        before == null ||
        after == null ||
        !Number.isFinite(Number(before)) ||
        !Number.isFinite(Number(after))
      )
        return [];
      const delta = Number(after) - Number(before);
      if (delta < 0) return []; // Provider correction, not negative attacking activity.
      deltas[type] = delta;
    }
    const weighted = Object.entries(weights).reduce(
      (sum, [type, weight]) => sum + deltas[type]! * weight,
      0,
    );
    return [
      {
        teamId,
        minute: current.minute,
        extraMinute: current.extra,
        value: Math.round(Math.min(100, (weighted * 10 * 60) / seconds)),
        evidence: {
          deltas,
          intervalSeconds: seconds,
          from: previous.captured_at,
          to: current.captured_at,
        },
      },
    ];
  });
}
