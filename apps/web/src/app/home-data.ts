import type {
  FootballFixturePage,
  FootballFixturePageDataItem,
  NewsArticlePageDataItem,
} from "@goal-app/api-client";
import { getDateKey } from "@goal-app/config";

import { homeFixtureQuery, liveHomeQuery } from "./home-fixture-model";
import { isFixtureUpcoming } from "@/lib/fixture-status";

import { goalApi } from "@/lib/api";
import type { MatchCardInsight } from "@/components/score/types";

export type HomeScoreData = {
  aiInsights: Record<number, MatchCardInsight>;
  fixtures: FootballFixturePageDataItem[];
  fixturesError: boolean;
  feed: FootballFixturePage["feed"];
  nextCursor: string | null;
  liveFixtures: FootballFixturePageDataItem[];
  liveError: boolean;
  news: NewsArticlePageDataItem[];
  todayKey: string;
};

export async function getHomeScoreData(): Promise<HomeScoreData> {
  const todayKey = getDateKey();
  const api = goalApi();
  const [fixturesResult, newsResult, liveResult] = await Promise.allSettled([
    api.listFootballFixtures(homeFixtureQuery(todayKey, "all")),
    api.listTrendingFootballNews({ language: "th", limit: 4 }),
    api.listFootballFixtures(liveHomeQuery()),
  ]);
  const fixtures = fixturesResult.status === "fulfilled" ? fixturesResult.value.data : [];
  const liveFixtures = liveResult.status === "fulfilled" ? liveResult.value.data : [];
  const featuredFixture = liveFixtures[0] ?? fixtures.find(isFixtureUpcoming) ?? fixtures[0];
  const analysisIds = [
    ...liveFixtures.slice(0, 2).map((fixture) => fixture.id),
    ...(featuredFixture ? [featuredFixture.id] : []),
  ].filter((id, index, values) => values.indexOf(id) === index);
  const analysisResults = await Promise.allSettled(
    analysisIds.map((fixtureId) => api.getAiMatchAnalysis(fixtureId, { language: "th" })),
  );
  const aiInsights = Object.fromEntries(
    analysisResults.flatMap((result) => {
      if (result.status !== "fulfilled" || !result.value.analysis) return [];
      const analysis = result.value.analysis;
      const momentum = analysis.momentum.at(-1);
      const insight: MatchCardInsight = {
        fixtureId: result.value.fixtureId,
        keyFactor: analysis.explanation.decidingFactors[0] ?? analysis.summary.short ?? null,
        momentum: momentum ? { intensity: momentum.intensity, teamId: momentum.teamId } : null,
      };
      return [[result.value.fixtureId, insight] as const];
    }),
  );

  return {
    aiInsights,
    feed: fixturesResult.status === "fulfilled" ? fixturesResult.value.feed : null,
    fixtures,
    nextCursor: fixturesResult.status === "fulfilled" ? fixturesResult.value.nextCursor : null,
    liveFixtures,
    liveError: liveResult.status === "rejected",
    fixturesError: fixturesResult.status === "rejected",
    news: newsResult.status === "fulfilled" ? newsResult.value.data : [],
    todayKey,
  };
}
