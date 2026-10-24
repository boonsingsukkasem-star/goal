import {
  configureGoalApi,
  exploreFootballCatalog,
  getAiMatchAnalysis,
  getFootballFixture,
  getFootballLeague,
  getFootballPlayer,
  getFootballStandings,
  getFootballTeam,
  getMyProfile,
  listFootballComparisonOptions,
  listFootballFixtures,
  listFootballNews,
  listMatchRelatedNews,
  listTrendingFootballNews,
} from "@goal-app/api-client";

export function goalApi() {
  configureGoalApi({
    baseUrl: process.env.GOAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000",
  });
  return {
    exploreFootballCatalog,
    getFootballFixture,
    getFootballLeague,
    getAiMatchAnalysis,
    getFootballPlayer,
    getFootballStandings,
    getFootballTeam,
    getMyProfile,
    listFootballComparisonOptions,
    listFootballFixtures,
    listFootballNews,
    listMatchRelatedNews,
    listTrendingFootballNews,
  };
}
