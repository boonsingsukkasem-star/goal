import { ApiRequestError } from "@goal-app/api-client";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { goalApi } from "@/lib/api";

import { MatchCommunityPanel } from "./match-community-panel";
import { MatchHero, MatchWorkspace } from "./match-workspace";
import { LiveRefresh } from "./live-refresh";
import { matchRefreshInterval } from "./match-presentation";
import { RelatedNews } from "./related-news";

export default async function MatchPage({ params }: { params: Promise<{ fixtureId: string }> }) {
  await connection();
  const { fixtureId } = await params;
  const id = Number(fixtureId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let fixture;
  try {
    fixture = await goalApi().getFootballFixture(id);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
  const ai = await goalApi()
    .getAiMatchAnalysis(id, { language: "th" })
    .catch(() => ({ analysis: null, fixtureId: id, status: null, updatedAt: null }) as const);
  const relatedNews = await goalApi()
    .listMatchRelatedNews(id, { language: "th", limit: 4 })
    .then((result) => result.data)
    .catch(() => []);

  return (
    <>
      <LiveRefresh intervalMs={matchRefreshInterval(fixture)} />
      <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-6 md:px-8 md:py-8">
        <MatchHero fixture={fixture} />
        <MatchWorkspace fixture={fixture} initialAi={ai} />

        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <MatchCommunityPanel
              fixtureId={id}
              teams={fixture.participants.map(({ team }) => ({ id: team.id, name: team.name }))}
            />
          </div>
          <div className="lg:col-span-7">
            <RelatedNews articles={relatedNews} />
          </div>
        </div>
      </main>
    </>
  );
}
