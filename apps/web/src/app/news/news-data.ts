import type { FootballFixturePageDataItem, NewsArticlePageDataItem } from "@goal-app/api-client";

import { getFixtureTeams } from "@/components/score/score-components";
import { goalApi } from "@/lib/api";

export type NewsAiContext = {
  awayName: string;
  fixtureId: number;
  homeName: string;
  intensity: number | null;
  isLive: boolean;
  keyFactor: string | null;
  minute: number | null;
  momentumExplanation: string | null;
  momentumTeamName: string | null;
};

export type NewsPageData = {
  aiContext: NewsAiContext | null;
  initialError: boolean;
  latest: NewsArticlePageDataItem[];
  nextCursor: string | null;
  trending: NewsArticlePageDataItem[];
};

function selectAiFixture(fixtures: FootballFixturePageDataItem[]) {
  return (
    fixtures.find((fixture) => fixture.isLive) ??
    fixtures.find((fixture) => fixture.homeScore === null && fixture.awayScore === null) ??
    fixtures[0]
  );
}

export async function getNewsPageData(): Promise<NewsPageData> {
  const api = goalApi();
  const [latestResult, trendingResult, fixturesResult] = await Promise.allSettled([
    api.listFootballNews({ language: "th", limit: 20 }),
    api.listTrendingFootballNews({ language: "th", limit: 10 }),
    api.listFootballFixtures({ limit: 20, order: "asc" }),
  ]);

  const fixtures = fixturesResult.status === "fulfilled" ? fixturesResult.value.data : [];
  const fixture = selectAiFixture(fixtures);
  let aiContext: NewsAiContext | null = null;

  if (fixture) {
    const { away, home } = getFixtureTeams(fixture);
    const analysisResult = await api
      .getAiMatchAnalysis(fixture.id, { language: "th" })
      .catch(() => null);
    const analysis = analysisResult?.analysis ?? null;
    const momentum = analysis?.momentum.at(-1) ?? null;
    const momentumTeam = momentum
      ? momentum.teamId === home.id
        ? home
        : momentum.teamId === away.id
          ? away
          : null
      : null;

    aiContext = {
      awayName: away.name,
      fixtureId: fixture.id,
      homeName: home.name,
      intensity: momentum?.intensity ?? null,
      isLive: fixture.isLive,
      keyFactor: analysis?.explanation.decidingFactors[0] ?? analysis?.summary.short ?? null,
      minute: momentum?.minute ?? null,
      momentumExplanation: momentum?.explanation ?? null,
      momentumTeamName: momentumTeam?.name ?? null,
    };
  }

  return {
    aiContext,
    initialError: latestResult.status === "rejected",
    latest: latestResult.status === "fulfilled" ? latestResult.value.data : [],
    nextCursor:
      latestResult.status === "fulfilled" ? (latestResult.value.nextCursor ?? null) : null,
    trending: trendingResult.status === "fulfilled" ? trendingResult.value.data : [],
  };
}
