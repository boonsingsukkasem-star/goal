import { FixtureScoreRow } from "@/components/football/fixture-score-row";
import { StatePanel } from "@/components/shared/state-panel";

type Fixture = {
  awayScore: number | null;
  homeScore: number | null;
  id: number;
  league: { name: string };
  participants: Array<{ location: "away" | "home"; team: { name: string } }>;
  startsAt: string;
  state: { name: string | null };
};

export function FixtureList({ fixtures }: { fixtures: Fixture[] }) {
  if (fixtures.length === 0)
    return (
      <StatePanel
        className="min-h-40 border-0 bg-transparent"
        description="ระบบจะแสดงการแข่งขันที่กำลังจะมาถึงและผลล่าสุดเมื่อมีข้อมูล"
        title="ยังไม่มีโปรแกรมการแข่งขันในช่วงนี้"
      />
    );
  return (
    <div className="space-y-3">
      {fixtures.map((fixture) => (
        <FixtureScoreRow fixture={fixture} key={fixture.id} variant="compact" />
      ))}
    </div>
  );
}
