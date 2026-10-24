"use client";

import {
  listFootballNews,
  listMyFootballNews,
  type NewsArticlePage,
  type PersonalizedNewsResponse,
} from "@goal-app/api-client";
import type { NewsArticle } from "@goal-app/contracts";
import { Brain as BrainCircuit, Refresh as RefreshCw, GraphUp as TrendingUp } from "iconoir-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  NewsCard,
  NEWS_IMAGES,
  newsCategoryLabels,
  recordNewsOpen,
} from "@/components/news/news-card";
import { StatePanel } from "@/components/shared/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { configureGoalBrowserApi } from "@/lib/api-browser";

import type { NewsAiContext } from "./news-data";

type Mode = "latest" | "match" | "personalized" | "transfer";

type NewsFeedProps = {
  aiContext?: NewsAiContext | null;
  initialError?: boolean;
  initialLatest?: NewsArticle[];
  initialNextCursor?: string | null;
  initialTrending?: NewsArticle[];
};

const filters: ReadonlyArray<{ label: string; mode: Mode }> = [
  { label: "For You", mode: "personalized" },
  { label: "Latest", mode: "latest" },
  { label: "Transfers", mode: "transfer" },
  { label: "Match Analysis", mode: "match" },
];

function configureClient() {
  return configureGoalBrowserApi();
}

export function NewsFeed({
  aiContext = null,
  initialError = false,
  initialLatest = [],
  initialNextCursor = null,
  initialTrending = [],
}: NewsFeedProps) {
  const [mode, setMode] = useState<Mode>("personalized");
  const [latest, setLatest] = useState<NewsArticle[]>(initialLatest);
  const [trending] = useState<NewsArticle[]>(initialTrending);
  const [personalized, setPersonalized] = useState<PersonalizedNewsResponse["data"]>([]);
  const [categoryNews, setCategoryNews] = useState<Partial<Record<Mode, NewsArticle[]>>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [signedIn, setSignedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [loadingMode, setLoadingMode] = useState<Mode | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(initialError);

  const initializePersonalization = useCallback(async () => {
    try {
      const supabase = configureClient();
      const authenticated = Boolean((await supabase.auth.getSession()).data.session);
      setSignedIn(authenticated);
      if (authenticated) {
        const result = await listMyFootballNews({ language: "th", limit: 20 });
        setPersonalized(result.data);
      }
    } catch {
      // Public news remains usable when authentication or personalization is unavailable.
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(initializePersonalization);
  }, [initializePersonalization]);

  const loadCategory = useCallback(
    async (nextMode: Mode) => {
      if (nextMode !== "transfer" && nextMode !== "match") return;
      if (categoryNews[nextMode]) return;
      setLoadingMode(nextMode);
      setError(false);
      try {
        configureClient();
        const page = await listFootballNews({
          category: nextMode,
          language: "th",
          limit: 20,
        });
        setCategoryNews((current) => ({ ...current, [nextMode]: page.data }));
      } catch {
        setError(true);
      } finally {
        setLoadingMode(null);
      }
    },
    [categoryNews],
  );

  const selectMode = (nextMode: Mode) => {
    setMode(nextMode);
    void loadCategory(nextMode);
  };

  const items = useMemo(() => {
    if (mode === "personalized") {
      if (signedIn && personalized.length > 0) {
        return personalized.map(({ article, reasons }) => ({ article, reasons }));
      }
      return latest.map((article) => ({
        article,
        reasons: signedIn ? [] : (["เข้าสู่ระบบเพื่อปรับข่าวตามทีมโปรด"] as string[]),
      }));
    }
    if (mode === "latest") return latest.map((article) => ({ article, reasons: [] as string[] }));
    return (categoryNews[mode] ?? []).map((article) => ({ article, reasons: [] as string[] }));
  }, [categoryNews, latest, mode, personalized, signedIn]);

  const featured = items[0];
  const feedItems = items.slice(1);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      configureClient();
      const page: NewsArticlePage = await listFootballNews({
        cursor: nextCursor,
        language: "th",
        limit: 20,
      });
      setLatest((current) => [...current, ...page.data]);
      setNextCursor(page.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  };

  const retryLatest = async () => {
    setLoadingMode("latest");
    try {
      configureClient();
      const page = await listFootballNews({ language: "th", limit: 20 });
      setLatest(page.data);
      setNextCursor(page.nextCursor ?? null);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoadingMode(null);
    }
  };

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[1440px] grid-cols-4 gap-4 px-4 py-6 md:grid-cols-12 md:px-8 md:py-16">
      <h1 className="sr-only">ข่าวฟุตบอลและบทวิเคราะห์ AI</h1>
      <div className="col-span-4 flex min-w-0 flex-col gap-10 md:col-span-8">
        <section aria-label="ตัวกรองข่าว" className="flex flex-wrap items-center gap-3">
          <span className="mr-1 font-label text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
            Filter by:
          </span>
          <ToggleGroup
            aria-label="ตัวกรองข่าว"
            className="flex-wrap"
            onValueChange={(value) => value && selectMode(value as Mode)}
            type="single"
            value={mode}
            variant="outline"
          >
            {filters.map((filter) => (
              <ToggleGroupItem key={filter.mode} value={filter.mode}>
                {filter.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>

        {mode === "personalized" && authReady && !signedIn ? (
          <p className="-mt-7 font-label text-[0.65rem] tracking-[0.08em] text-muted-foreground uppercase">
            กำลังแสดงข่าวล่าสุด ·{" "}
            <Link className="text-primary hover:underline" href="/login">
              เข้าสู่ระบบ
            </Link>{" "}
            เพื่อปรับ feed ตามทีม นักเตะ และลีกโปรด
          </p>
        ) : null}

        {loadingMode === mode ? (
          <StatePanel
            action={<Spinner className="text-primary" />}
            className="min-h-[25rem]"
            title="กำลังรวบรวมข่าว…"
          />
        ) : featured ? (
          <FeaturedStory article={featured.article} signedIn={signedIn} />
        ) : (
          <StatePanel
            action={
              error ? (
                <Button onClick={() => void retryLatest()}>
                  <RefreshCw /> ลองใหม่
                </Button>
              ) : undefined
            }
            className="min-h-[25rem]"
            description="ระบบจะไม่สร้างข่าวจำลอง กรุณาลองใหม่เมื่อมีข้อมูลจากแหล่งข่าว"
            title={error ? "เชื่อมต่อ News API ไม่สำเร็จ" : "ยังไม่มีข่าวในหมวดนี้"}
          />
        )}

        {feedItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {feedItems.map(({ article, reasons }, index) => (
              <NewsCard
                article={article}
                imageIndex={(index + 1) % NEWS_IMAGES.length}
                key={article.id}
                reasons={reasons}
                signedIn={signedIn}
              />
            ))}
          </div>
        ) : null}

        {(mode === "latest" || mode === "personalized") && nextCursor ? (
          <Button
            className="self-center rounded-none"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            variant="outline"
          >
            {loadingMore ? "กำลังโหลด…" : "โหลดข่าวเพิ่มเติม"}
          </Button>
        ) : null}
      </div>

      <aside className="col-span-4 mt-10 flex min-w-0 flex-col gap-10 md:col-span-4 md:mt-0">
        <TrendingTopics articles={trending} signedIn={signedIn} />
        <AiFeedWidget context={aiContext} />
      </aside>
    </main>
  );
}

function FeaturedStory({ article, signedIn }: { article: NewsArticle; signedIn: boolean }) {
  return (
    <article className="group relative flex min-h-[25rem] overflow-hidden border border-border bg-surface p-5 md:min-h-[31.25rem] md:p-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
        style={{ backgroundImage: `url('${NEWS_IMAGES[0]}')` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-transparent" />
      <div className="relative z-10 mt-auto flex w-full max-w-3xl flex-col items-start gap-3">
        <div className="flex flex-wrap gap-2">
          {article.isBreaking ? <Badge variant="destructive">● Breaking</Badge> : null}
          <Badge variant="outline">{newsCategoryLabels[article.category]}</Badge>
        </div>
        <h2 className="font-headline text-3xl leading-[1.08] tracking-[0.035em] uppercase transition-colors group-hover:text-primary sm:text-4xl md:text-[2.6rem]">
          {article.headline}
        </h2>
        <p className="line-clamp-2 max-w-2xl text-base leading-7 text-foreground-warm md:text-lg">
          {article.summary}
        </p>
        <a
          className="mt-2 border-b-2 border-primary pb-1 font-headline text-2xl uppercase text-primary transition-colors hover:border-foreground hover:text-foreground"
          href={article.primaryUrl}
          onClick={() => recordNewsOpen(article.id, signedIn)}
          rel="noopener noreferrer"
          target="_blank"
        >
          Read Analysis
        </a>
      </div>
    </article>
  );
}

function TrendingTopics({ articles, signedIn }: { articles: NewsArticle[]; signedIn: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <TrendingUp className="size-5 text-primary" />
        <CardTitle className="tracking-[0.04em]">Trending Topics</CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        {articles.length > 0 ? (
          <ol>
            {articles.slice(0, 5).map((article, index) => (
              <li className="border-b border-border last:border-0" key={article.id}>
                <a
                  className="grid grid-cols-[1fr_auto] items-center gap-3 px-2 py-4 transition-colors hover:bg-surface-elevated"
                  href={article.primaryUrl}
                  onClick={() => recordNewsOpen(article.id, signedIn)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <span className="min-w-0">
                    <span className="block font-label text-[0.6rem] tracking-[0.1em] text-muted-foreground uppercase">
                      {newsCategoryLabels[article.category]}
                    </span>
                    <span className="mt-1 block line-clamp-2 text-base leading-5">
                      {article.headline}
                    </span>
                  </span>
                  <span className="font-label text-xs text-muted-foreground">#{index + 1}</span>
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className="p-4 text-sm leading-6 text-muted-foreground">
            ยังไม่มีหัวข้อที่กำลังมาแรงจาก News API
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AiFeedWidget({ context }: { context: NewsAiContext | null }) {
  const intensity = context?.intensity ?? null;
  return (
    <Card className="goal-news-ai-glow relative overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute -right-12 -top-12 size-36 rounded-full bg-primary/15 blur-3xl"
      />
      <CardContent className="relative flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2 font-label text-[0.65rem] font-bold tracking-[0.12em] text-primary uppercase">
          <BrainCircuit className="size-5" />
          {context?.isLive ? "AI Live Match Feed" : "AI Match Context"}
        </div>
        {context ? (
          <>
            <div>
              <p className="font-label text-[0.65rem] tracking-[0.1em] text-muted-foreground uppercase">
                {context.homeName} vs {context.awayName}
              </p>
              <h2 className="mt-2 font-headline text-2xl leading-tight tracking-[0.035em] uppercase">
                {context.keyFactor ?? "AI analysis is waiting for verified match data"}
              </h2>
            </div>
            {intensity !== null ? (
              <div>
                <Progress aria-label="AI momentum intensity" value={intensity} />
                <div className="mt-2 flex justify-between gap-4 font-label text-[0.6rem] tracking-[0.08em] text-muted-foreground uppercase">
                  <span>{context.momentumTeamName ?? "Match"} momentum</span>
                  <span>{Math.round(intensity)}% intensity</span>
                </div>
              </div>
            ) : null}
            {context.momentumExplanation ? (
              <p className="border-l-2 border-primary pl-3 text-sm leading-6 text-foreground-warm">
                {context.minute !== null ? `${context.minute}' · ` : ""}
                {context.momentumExplanation}
              </p>
            ) : null}
            <Button asChild className="mt-1 rounded-none">
              <Link href={`/match/${context.fixtureId}`}>เปิด Match Analysis</Link>
            </Button>
          </>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            ยังไม่มีการแข่งขันในช่วงเวลานี้ ระบบจะแสดง AI context เมื่อ Fixture API ส่งข้อมูลมา
          </p>
        )}
      </CardContent>
    </Card>
  );
}
