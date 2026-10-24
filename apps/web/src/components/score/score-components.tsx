import type { FootballFixturePageDataItem, NewsArticlePageDataItem } from "@goal-app/api-client";
import {
  Bell,
  Brain as BrainCircuit,
  NavArrowRight as ChevronRight,
  Clock as Clock3,
  Sparks as Sparkles,
  Flash as Zap,
} from "iconoir-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isFixtureFinished, fixtureStatus } from "@/lib/fixture-status";
import type { MatchCardInsight } from "@/components/score/types";

const FEATURED_IMAGE_URL = "/images/home-featured-football-4k.webp";

export function getFixtureTeams(fixture: FootballFixturePageDataItem) {
  const home = fixture.participants.find((participant) => participant.location === "home")?.team;
  const away = fixture.participants.find((participant) => participant.location === "away")?.team;
  return {
    away: away ?? { id: -2, imageUrl: null, name: "Away team", shortCode: "AWY" },
    home: home ?? { id: -1, imageUrl: null, name: "Home team", shortCode: "HOM" },
  };
}

export { isFixtureFinished, fixtureStatus } from "@/lib/fixture-status";

function teamCode(name: string, shortCode?: string | null) {
  if (shortCode?.trim()) return shortCode.trim().slice(0, 3).toUpperCase();
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

export function LiveMatchCard({
  fixture,
  featured = false,
  insight,
}: {
  fixture: FootballFixturePageDataItem;
  featured?: boolean;
  insight?: MatchCardInsight;
}) {
  const { away, home } = getFixtureTeams(fixture);
  const homeMomentum = insight?.momentum
    ? insight.momentum.teamId === away.id
      ? 100 - insight.momentum.intensity
      : insight.momentum.intensity
    : null;
  return (
    <Link
      className="block shrink-0 focus-visible:outline-2 focus-visible:outline-primary"
      href={`/match/${fixture.id}`}
    >
      <Card
        className={`relative flex h-[15.5rem] w-[19rem] flex-col justify-between p-4 transition-colors sm:w-[24rem] ${featured ? "border-primary shadow-[inset_0_0_18px_rgba(255,215,0,0.06)]" : "hover:border-muted-foreground"}`}
      >
        <Badge className="absolute right-0 top-0" variant="destructive">
          {fixtureStatus(fixture)}
        </Badge>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <div className="min-w-0">
            <p className="truncate font-label text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
              {home.name}
            </p>
            <p className="mt-2 font-headline text-7xl leading-none font-bold tabular-nums">
              {fixture.homeScore ?? "–"}
            </p>
          </div>
          <span className="pb-5 font-headline text-2xl text-border">–</span>
          <div className="min-w-0 text-right">
            <p className="truncate font-label text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
              {away.name}
            </p>
            <p className="mt-2 font-headline text-7xl leading-none font-bold tabular-nums">
              {fixture.awayScore ?? "–"}
            </p>
          </div>
        </div>
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between font-label text-[0.65rem] font-bold tracking-[0.14em] uppercase">
            <span className={insight ? "text-primary" : "text-muted-foreground"}>AI Momentum</span>
            <Zap className={insight ? "text-primary" : "text-muted-foreground"} />
          </div>
          <div className="mt-2 flex h-1 bg-surface-elevated">
            <div
              className={insight ? "h-full bg-primary" : "h-full bg-muted-foreground"}
              style={{ width: `${homeMomentum ?? 50}%` }}
            />
            <div className="h-full flex-1 border-l border-background bg-surface-elevated" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function LeagueFixtures({
  fixtures,
  league,
}: {
  fixtures: FootballFixturePageDataItem[];
  league: FootballFixturePageDataItem["league"];
}) {
  return (
    <section>
      <Link href={`/league/${league.id}`}>
        <Badge className="mb-2" variant="outline">
          {league.name}
        </Badge>
      </Link>
      <Card>
        {fixtures.map((fixture, index) => {
          const { away, home } = getFixtureTeams(fixture);
          return (
            <Link
              className={`grid min-h-16 grid-cols-[3.7rem_1fr_auto] items-center gap-3 px-3 transition-colors hover:bg-surface-elevated sm:grid-cols-[4.5rem_1fr_auto] sm:px-4 ${index > 0 ? "border-t border-border" : ""}`}
              href={`/match/${fixture.id}`}
              key={fixture.id}
            >
              <span
                className={`font-label text-xs font-bold uppercase ${fixture.isLive ? "text-primary" : "text-foreground"}`}
              >
                {fixtureStatus(fixture)}
              </span>
              <span className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-2">
                <span className="truncate text-right text-sm font-semibold sm:text-base">
                  {home.name}
                </span>
                <span className="font-headline text-xl text-border">–</span>
                <span className="truncate text-sm text-muted-foreground sm:text-base">
                  {away.name}
                </span>
              </span>
              {fixture.isLive || isFixtureFinished(fixture) ? (
                <span className="font-headline text-xl font-bold tabular-nums">
                  {fixture.homeScore ?? "–"}–{fixture.awayScore ?? "–"}
                </span>
              ) : (
                <Bell className="size-4 text-muted-foreground" />
              )}
            </Link>
          );
        })}
      </Card>
    </section>
  );
}

export function FeaturedNews({ article }: { article?: NewsArticlePageDataItem }) {
  return (
    <Card className="group relative h-[25rem] overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
        style={{ backgroundImage: `url('${FEATURED_IMAGE_URL}')` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      <div className="relative flex h-full flex-col justify-end p-5 sm:p-6">
        <Badge className="self-start">
          {article?.isBreaking ? "Breaking" : "Breaking Analysis"}
        </Badge>
        <h2 className="mt-4 max-w-3xl font-headline text-[2rem] leading-9 tracking-[0.04em] uppercase md:text-[2.5rem] md:leading-11">
          {article?.headline ?? "ทุกแมตช์มีเรื่องราวที่มากกว่าสกอร์"}
        </h2>
        <div className="mt-5 flex max-w-2xl gap-3 border border-white/10 bg-white/[0.045] p-4 backdrop-blur-xl">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-sm leading-6 text-foreground-warm sm:text-base">
            <strong className="text-foreground">AI Summary: </strong>
            {article?.summary ??
              "ติดตามแท็กติก โมเมนตัม และจุดเปลี่ยนของเกมจากข้อมูลการแข่งขันที่ตรวจสอบแล้ว"}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function AiMatchSpotlight({
  fixture,
  insight,
}: {
  fixture?: FootballFixturePageDataItem;
  insight?: MatchCardInsight;
}) {
  const teams = fixture ? getFixtureTeams(fixture) : null;
  return (
    <Card className="goal-ai-mesh flex h-full min-h-[31rem] flex-col">
      <CardHeader className="flex flex-row items-center gap-3">
        <BrainCircuit className="size-5 text-primary" />
        <CardTitle className="tracking-[0.04em]">Match of the Day</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {fixture && teams ? (
          <>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-7 text-center">
              <div>
                <div className="mx-auto grid size-12 place-items-center rounded-full border-2 border-border bg-surface font-headline text-xl">
                  {teamCode(teams.home.name, teams.home.shortCode)}
                </div>
                <p className="mt-3 truncate font-label text-xs font-bold uppercase">
                  {teams.home.name}
                </p>
              </div>
              <span className="font-headline text-4xl font-bold italic text-primary">VS</span>
              <div>
                <div className="mx-auto grid size-12 place-items-center rounded-full border-2 border-border bg-surface font-headline text-xl">
                  {teamCode(teams.away.name, teams.away.shortCode)}
                </div>
                <p className="mt-3 truncate font-label text-xs font-bold uppercase">
                  {teams.away.name}
                </p>
              </div>
            </div>
            <div className="mb-5">
              <p className="font-label text-[0.65rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                AI Momentum Strength
              </p>
              <div className="mt-2 flex h-8 border border-border">
                {insight?.momentum ? (
                  <>
                    <div
                      className="grid place-items-center bg-surface-elevated font-label text-[0.65rem] font-bold"
                      style={{ width: `${insight.momentum.intensity}%` }}
                    >
                      {insight.momentum.intensity}%
                    </div>
                    <div className="flex-1 bg-primary/15" />
                  </>
                ) : (
                  <div className="grid w-full place-items-center bg-surface-elevated font-label text-[0.65rem] text-muted-foreground uppercase">
                    Awaiting verified AI analysis
                  </div>
                )}
              </div>
            </div>
            <div className="border border-white/5 bg-background/60 p-4">
              <div className="flex items-center gap-2 font-label text-[0.65rem] font-bold tracking-[0.13em] text-primary uppercase">
                <Zap /> Key match context
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {insight?.keyFactor ??
                  "ยังไม่มีบทวิเคราะห์ที่ยืนยันสำหรับแมตช์นี้ เปิดหน้ารายละเอียดเพื่อขอให้ AI วิเคราะห์ข้อมูลล่าสุด"}
              </p>
            </div>
            <div className="mt-5 grid grid-cols-3 divide-x divide-border border border-border text-center">
              <div className="p-3">
                <p className="font-headline text-xl font-bold">{fixture.homeScore ?? "–"}</p>
                <p className="font-label text-[0.6rem] text-muted-foreground uppercase">Home</p>
              </div>
              <div className="p-3">
                <p className="font-label text-xs font-bold text-primary uppercase">
                  {fixtureStatus(fixture)}
                </p>
                <p className="font-label text-[0.6rem] text-muted-foreground uppercase">Status</p>
              </div>
              <div className="p-3">
                <p className="font-headline text-xl font-bold">{fixture.awayScore ?? "–"}</p>
                <p className="font-label text-[0.6rem] text-muted-foreground uppercase">Away</p>
              </div>
            </div>
            <Button asChild className="mt-auto w-full" size="lg">
              <Link href={`/match/${fixture.id}`}>
                Deep Dive Analysis <ChevronRight />
              </Link>
            </Button>
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-center">
            <div>
              <Clock3 className="mx-auto size-10 text-muted-foreground" />
              <h3 className="mt-4 font-headline text-2xl font-bold uppercase">รอคู่เด่นประจำวัน</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                ระบบจะแสดงข้อมูลจริงเมื่อมีโปรแกรมการแข่งขัน
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
