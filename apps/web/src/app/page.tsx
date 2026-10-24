import { connection } from "next/server";

import { getHomeScoreData } from "./home-data";
import { HomeScoreboard } from "./home-scoreboard";

export default async function HomePage() {
  await connection();
  const data = await getHomeScoreData();

  return (
    <HomeScoreboard
      aiInsights={data.aiInsights}
      initialError={data.fixturesError}
      initialFixtures={data.fixtures}
      initialFeed={data.feed}
      initialNextCursor={data.nextCursor}
      initialLiveFixtures={data.liveFixtures}
      initialLiveError={data.liveError}
      news={data.news}
      todayKey={data.todayKey}
    />
  );
}
