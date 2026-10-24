import type { Metadata } from "next";
import { connection } from "next/server";

import { getHomeScoreData } from "../home-data";
import { HomeScoreboard } from "../home-scoreboard";

export const metadata: Metadata = {
  description: "ผลฟุตบอลสด โปรแกรมวันนี้ และบริบทการแข่งขันจาก AI แบบเรียลไทม์",
  title: "Live Scores",
};

export default async function LivePage() {
  await connection();
  const data = await getHomeScoreData();

  return (
    <HomeScoreboard
      aiInsights={data.aiInsights}
      initialError={data.fixturesError}
      initialFixtures={data.fixtures}
      news={data.news}
      todayKey={data.todayKey}
    />
  );
}
