"use client";

import type {
  FootballFixturePage,
  FootballFixturePageDataItem,
  NewsArticlePageDataItem,
} from "@goal-app/api-client";
import { AntennaSignal as Radio } from "iconoir-react";
import { useCallback, useEffect, useState } from "react";

import { AiMatchSpotlight, FeaturedNews, LiveMatchCard } from "@/components/score/score-components";
import type { MatchCardInsight } from "@/components/score/types";
import { SectionHeading } from "@/components/shared/section-heading";
import { StatePanel } from "@/components/shared/state-panel";
import { Button } from "@/components/ui/button";
import { goalApi } from "@/lib/api";
import { isFixtureUpcoming } from "@/lib/fixture-status";
import { HomeFixtureBoard } from "./home-fixture-board";
import { liveHomeQuery } from "./home-fixture-model";

type HomeScoreboardProps = {
  aiInsights?: Record<number, MatchCardInsight>;
  initialError?: boolean;
  initialFixtures: FootballFixturePageDataItem[];
  initialNextCursor?: string | null;
  initialFeed?: FootballFixturePage["feed"];
  initialLiveFixtures?: FootballFixturePageDataItem[];
  initialLiveError?: boolean;
  news: NewsArticlePageDataItem[];
  todayKey: string;
};

export function HomeScoreboard({
  aiInsights = {},
  initialError = false,
  initialFixtures,
  initialNextCursor = null,
  initialFeed,
  initialLiveFixtures,
  initialLiveError = false,
  news,
  todayKey,
}: HomeScoreboardProps) {
  const [liveFixtures, setLiveFixtures] = useState(
    initialLiveFixtures ?? initialFixtures.filter((fixture) => fixture.isLive),
  );
  const [error, setError] = useState(initialLiveError);
  const [loading, setLoading] = useState(false);
  const loadLive = useCallback(async () => {
    setLoading(true);
    try {
      const result = await goalApi().listFootballFixtures(liveHomeQuery());
      setLiveFixtures(result.data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let pending = false;
    const timer = window.setInterval(async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const result = await goalApi().listFootballFixtures(liveHomeQuery());
        if (active) {
          setLiveFixtures(result.data);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      } finally {
        pending = false;
      }
    }, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const featuredFixture =
    liveFixtures[0] ?? initialFixtures.find(isFixtureUpcoming) ?? initialFixtures[0];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-4 py-6 md:px-8 md:py-12">
      <h1 className="sr-only">ฟุตบอลวันนี้</h1>
      <section aria-labelledby="live-now-title" className="flex flex-col gap-4">
        <SectionHeading live>
          <span id="live-now-title">Live Now</span>
        </SectionHeading>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            อัปเดต Live ไม่สำเร็จ ข้อมูลอาจไม่ใช่สถานะล่าสุด
          </p>
        )}
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
          {liveFixtures.length > 0 ? (
            liveFixtures
              .slice(0, 6)
              .map((fixture, index) => (
                <LiveMatchCard
                  featured={index === 0}
                  fixture={fixture}
                  insight={aiInsights[fixture.id]}
                  key={fixture.id}
                />
              ))
          ) : error ? (
            <StatePanel
              action={
                <Button disabled={loading} onClick={() => void loadLive()}>
                  {loading ? "กำลังโหลด…" : "ลองอีกครั้ง"}
                </Button>
              }
              className="w-full border-destructive/60 bg-destructive/10"
              description="ไม่สามารถยืนยันสถานะแมตช์สดได้ในขณะนี้"
              icon={Radio}
              title="เชื่อมต่อ Live Score ไม่สำเร็จ"
            />
          ) : (
            <StatePanel
              className="w-full"
              description="ดูผลและโปรแกรมด้านล่าง เมื่อเกมเริ่มสกอร์จะอัปเดตอัตโนมัติ"
              icon={Radio}
              title="ยังไม่มีการแข่งขันสด"
            />
          )}
        </div>
      </section>
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-10 lg:col-span-8">
          <HomeFixtureBoard
            initial={{ data: initialFixtures, nextCursor: initialNextCursor, feed: initialFeed }}
            initialError={initialError}
            todayKey={todayKey}
          />
          <FeaturedNews article={news[0]} />
        </div>
        <aside className="flex min-w-0 flex-col lg:col-span-4">
          <AiMatchSpotlight
            fixture={featuredFixture}
            insight={featuredFixture ? aiInsights[featuredFixture.id] : undefined}
          />
        </aside>
      </section>
    </main>
  );
}
