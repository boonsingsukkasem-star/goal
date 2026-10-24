import { describe, expect, it } from "vitest";
import { calculateMomentum, type StatSnapshot } from "./football-momentum";
function snapshot(minute: number, total = 10): StatSnapshot {
  return {
    captured_at: new Date(Date.UTC(2026, 8, 18, 12, minute)).toISOString(),
    minute,
    extra: 0,
    statistics: [1, 2].flatMap((teamId) =>
      ["TOTAL_SHOTS", "SHOTS_ON_GOAL", "CORNER_KICKS"].map((type) => ({
        teamId,
        type,
        value: total,
      })),
    ),
  };
}
describe("GOAL attacking activity", () => {
  it("is deterministic and explains score contributions", () => {
    const result = calculateMomentum(snapshot(1), snapshot(2, 11));
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      value: 55,
      evidence: { intervalSeconds: 60, deltas: { TOTAL_SHOTS: 1 } },
    });
  });
  it("does not turn missing measurements into zero pressure", () => {
    const next = snapshot(2);
    next.statistics[0]!.value = null;
    expect(calculateMomentum(snapshot(1), next)).toHaveLength(1);
  });
  it("does not bridge outages, halftime or clock corrections", () => {
    expect(calculateMomentum(snapshot(1), snapshot(8))).toEqual([]);
    expect(calculateMomentum(snapshot(1), { ...snapshot(2), minute: 1 })).toEqual([]);
    expect(calculateMomentum(snapshot(2), snapshot(1))).toEqual([]);
  });
  it("does not interpret corrected cumulative totals as negative attacks", () => {
    expect(calculateMomentum(snapshot(1), snapshot(2, 9))).toEqual([]);
  });
});
