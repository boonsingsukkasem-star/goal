"use client";

import {
  ApiRequestError,
  getAiMatchAnalysis,
  requestAiMatchAnalysis,
  type AiMatchAnalysisResponse,
  type FootballFixtureDetail,
} from "@goal-app/api-client";
import {
  Activity,
  Brain as BrainCircuit,
  Calendar as CalendarClock,
  StatsUpSquare as ChartNoAxesCombined,
  WarningCircle as CircleAlert,
  Refresh as RefreshCw,
  Sparks as Sparkles,
  Group as UsersRound,
  Flash as Zap,
} from "iconoir-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { StatePanel } from "@/components/shared/state-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { configureGoalBrowserApi } from "@/lib/api-browser";

import { formatKickoff, isPreMatch } from "./match-presentation";

type MatchTab = "ai" | "lineups" | "overview" | "stats";
type Analysis = NonNullable<AiMatchAnalysisResponse["analysis"]>;

const tabs: ReadonlyArray<{ icon: typeof Activity; label: string; value: MatchTab }> = [
  { icon: CalendarClock, label: "Overview", value: "overview" },
  { icon: UsersRound, label: "Lineups", value: "lineups" },
  { icon: ChartNoAxesCombined, label: "Stats", value: "stats" },
  { icon: BrainCircuit, label: "AI Tactics", value: "ai" },
];

function configureClient() {
  return configureGoalBrowserApi();
}

function getTeams(fixture: FootballFixtureDetail) {
  return {
    away: fixture.participants.find((participant) => participant.location === "away")?.team,
    home: fixture.participants.find((participant) => participant.location === "home")?.team,
  };
}

function findFormation(fixture: FootballFixtureDetail, teamId?: number) {
  return fixture.formations.find((formation) => formation.teamId === teamId)?.formation ?? "–";
}

function findExpectedGoals(fixture: FootballFixtureDetail, teamId?: number) {
  if (!teamId) return null;
  const statistic = fixture.statistics.find((item) => {
    const identity = `${item.typeCode ?? ""} ${item.typeName ?? ""}`.toLowerCase();
    return item.teamId === teamId && /(^|\s)xg($|\s)|expected goals/.test(identity);
  });
  return statistic?.value ?? null;
}

function formatStatus(fixture: FootballFixtureDetail) {
  if (fixture.isLive) {
    const latestMinute = Math.max(0, ...fixture.events.map((event) => event.minute ?? 0));
    return latestMinute > 0 ? `${latestMinute}' LIVE` : `${fixture.state.name ?? "LIVE"}`;
  }
  if (fixture.homeScore !== null && fixture.awayScore !== null) {
    return fixture.state.code ?? fixture.state.name ?? "FT";
  }
  return isPreMatch(fixture) ? "ยังไม่เริ่มแข่งขัน" : (fixture.state.name ?? fixture.state.code);
}

function eventText(event: FootballFixtureDetail["events"][number]) {
  const player = event.playerName ?? event.typeName ?? event.info ?? `Event ${event.typeId}`;
  const related = event.relatedPlayerName ? ` → ${event.relatedPlayerName}` : "";
  const detail = [event.typeName, event.result, event.info]
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
    .join(" · ");
  return { detail, title: `${player}${related}` };
}

export function MatchHero({ fixture }: { fixture: FootballFixtureDetail }) {
  const { away, home } = getTeams(fixture);
  const homeXg = findExpectedGoals(fixture, home?.id);
  const awayXg = findExpectedGoals(fixture, away?.id);

  return (
    <Card className="goal-ai-mesh relative overflow-hidden shadow-[2px_2px_0_0_#000]">
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2 font-label text-[0.65rem] font-bold tracking-[0.12em] text-primary uppercase">
        {fixture.isLive ? (
          <span className="goal-live-pulse size-2 rounded-full bg-primary" />
        ) : null}
        {formatStatus(fixture)}
      </div>
      <CardContent className="relative grid min-h-64 grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 pb-6 pt-14 text-center sm:gap-8 sm:px-8">
        <TeamIdentity
          formation={findFormation(fixture, home?.id)}
          imageUrl={home?.imageUrl}
          name={home?.name ?? "Home"}
          teamId={home?.id}
        />
        <div className="flex flex-col items-center">
          <div className="whitespace-nowrap font-headline text-5xl leading-none tracking-[0.04em] tabular-nums sm:text-7xl">
            {fixture.homeScore ?? "–"} - {fixture.awayScore ?? "–"}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {formatKickoff(fixture.startsAt)} · เวลาไทย
          </p>
          {fixture.sourceUpdatedAt && (
            <p className="mt-2 text-[0.65rem] text-muted-foreground">
              {fixture.source === "archived" ? "ข้อมูลเก็บจากผู้ให้บริการเดิม" : "API-Football"} ·
              ข้อมูลล่าสุด {formatKickoff(fixture.sourceUpdatedAt)}
            </p>
          )}
          {Object.values(fixture.dataStatus ?? {}).some((section) => section.state === "error") && (
            <p className="mt-2 text-xs text-destructive">ข้อมูลบางส่วนโหลดไม่สำเร็จ กรุณาลองใหม่</p>
          )}
          {homeXg !== null || awayXg !== null ? (
            <p className="mt-3 font-label text-[0.65rem] tracking-[0.1em] text-primary uppercase">
              xG · {homeXg ?? "–"} - {awayXg ?? "–"} ·{" "}
              {fixture.source === "archived" ? "ข้อมูลเดิม" : "API-Football"}
            </p>
          ) : !isPreMatch(fixture) ? (
            <p className="mt-2 text-xs text-muted-foreground">
              ผู้ให้บริการยังไม่มีค่า xG สำหรับแมตช์นี้
            </p>
          ) : null}
          <Link
            className="mt-4 hidden font-label text-[0.6rem] tracking-[0.1em] text-muted-foreground uppercase hover:text-primary sm:block"
            href={`/league/${fixture.league.id}`}
          >
            {fixture.league.name}
          </Link>
        </div>
        <TeamIdentity
          formation={findFormation(fixture, away?.id)}
          imageUrl={away?.imageUrl}
          name={away?.name ?? "Away"}
          teamId={away?.id}
        />
      </CardContent>
    </Card>
  );
}

function TeamIdentity({
  formation,
  imageUrl,
  name,
  teamId,
}: {
  formation: string;
  imageUrl?: string | null;
  name: string;
  teamId?: number;
}) {
  const content = (
    <>
      <div
        aria-label={name}
        className="mx-auto grid size-16 place-items-center bg-contain bg-center bg-no-repeat font-headline text-2xl text-primary drop-shadow-lg sm:size-24"
        role="img"
        style={imageUrl ? { backgroundImage: `url(${JSON.stringify(imageUrl)})` } : undefined}
      >
        {!imageUrl ? name.slice(0, 2).toUpperCase() : null}
      </div>
      <h1 className="mt-3 line-clamp-2 font-headline text-xl leading-tight tracking-[0.03em] uppercase sm:text-3xl">
        {name}
      </h1>
      <Badge className="mt-3" variant="outline">
        {formation}
      </Badge>
    </>
  );

  return teamId ? (
    <Link className="min-w-0 transition-colors hover:text-primary" href={`/team/${teamId}`}>
      {content}
    </Link>
  ) : (
    <div className="min-w-0">{content}</div>
  );
}

export function MatchWorkspace({
  fixture,
  initialAi,
}: {
  fixture: FootballFixtureDetail;
  initialAi: AiMatchAnalysisResponse;
}) {
  const [activeTab, setActiveTab] = useState<MatchTab>("overview");
  const [ai, setAi] = useState(initialAi);
  const [signedIn, setSignedIn] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingDeadline = useRef<number | null>(null);

  useEffect(() => {
    try {
      const supabase = configureClient();
      void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    } catch {
      void Promise.resolve().then(() => setError("ยังไม่ได้ตั้งค่า API สำหรับเบราว์เซอร์"));
    }
  }, []);

  useEffect(() => {
    if (ai.status !== "queued" && ai.status !== "running") {
      pollingDeadline.current = null;
      return;
    }
    pollingDeadline.current ??= Date.now() + 3 * 60_000;

    const poll = () => {
      if (pollingDeadline.current && Date.now() >= pollingDeadline.current) {
        setError("การวิเคราะห์ใช้เวลานานกว่าปกติ กรุณาลองส่งคำขอใหม่");
        return;
      }
      configureClient();
      void getAiMatchAnalysis(fixture.id, { language: "th" })
        .then(setAi)
        .catch(() => setError("อัปเดตผลวิเคราะห์ไม่ได้ชั่วคราว"));
    };

    const initialPoll = window.setTimeout(poll, 750);
    const interval = window.setInterval(poll, 5_000);
    return () => {
      window.clearTimeout(initialPoll);
      window.clearInterval(interval);
    };
  }, [ai.status, fixture.id]);

  const requestAnalysis = async () => {
    setRequesting(true);
    setError(null);
    try {
      configureClient();
      pollingDeadline.current = Date.now() + 3 * 60_000;
      const queued = await requestAiMatchAnalysis(fixture.id, { language: "th" });
      setAi((current) => ({ ...current, status: queued.status }));
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError && requestError.status === 429
          ? "ใช้สิทธิ์วิเคราะห์ครบสำหรับวันนี้แล้ว"
          : requestError instanceof ApiRequestError && requestError.status === 401
            ? "กรุณาเข้าสู่ระบบใหม่ก่อนใช้ AI Tactics"
            : "ส่งคำขอวิเคราะห์ไม่ได้ กรุณาลองอีกครั้ง",
      );
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Tabs
      className="mt-4 gap-0"
      onValueChange={(value) => setActiveTab(value as MatchTab)}
      value={activeTab}
    >
      <TabsList className="flex h-auto w-full overflow-x-auto border-x-0 border-t-0 bg-transparent p-0">
        {tabs.map((tab) => (
          <TabsTrigger
            className="min-h-14 flex-1 shrink-0 border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-3 text-[0.65rem] text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-surface/50 data-[state=active]:text-primary sm:px-5 sm:text-xs"
            key={tab.value}
            value={tab.value}
          >
            <tab.icon className="hidden size-4 sm:block" /> {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="overview">
        <OverviewPanel fixture={fixture} />
      </TabsContent>
      <TabsContent value="lineups">
        <LineupsPanel fixture={fixture} />
      </TabsContent>
      <TabsContent value="stats">
        <StatsPanel fixture={fixture} />
      </TabsContent>
      <TabsContent value="ai">
        <AiTacticsPanel
          analysis={ai.analysis}
          error={error}
          fixture={fixture}
          isWorking={requesting || ai.status === "queued" || ai.status === "running"}
          onRequest={() => void requestAnalysis()}
          signedIn={signedIn}
        />
      </TabsContent>
    </Tabs>
  );
}

function OverviewPanel({ fixture }: { fixture: FootballFixtureDetail }) {
  if (isPreMatch(fixture)) {
    return (
      <Card className="my-6">
        <CardHeader>
          <CardTitle>ก่อนการแข่งขัน</CardTitle>
          <p className="text-sm text-muted-foreground">
            แมตช์นี้ยังไม่เริ่มแข่งขัน เหตุการณ์ สกอร์ และสถิติจะอัปเดตเมื่อมีข้อมูลระหว่างเกม
          </p>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">เวลาเริ่มแข่ง</dt>
              <dd className="mt-1 font-semibold">{formatKickoff(fixture.startsAt)} · เวลาไทย</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">รายการแข่งขัน</dt>
              <dd className="mt-1 font-semibold">
                {fixture.league.name}
                {fixture.round?.name ? ` · รอบ ${fixture.round.name}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">รายชื่อผู้เล่น</dt>
              <dd className="mt-1 font-semibold">
                {fixture.lineups.length > 0
                  ? `มีข้อมูล ${fixture.lineups.length} คน · ดูในแท็บ Lineups`
                  : "รอประกาศรายชื่อก่อนเริ่มเกม"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">การอัปเดต</dt>
              <dd className="mt-1 font-semibold">หน้านี้ตรวจข้อมูลใหม่อัตโนมัติทุก 1 นาที</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    );
  }
  const events = [...fixture.events].sort(
    (left, right) => (right.minute ?? 0) - (left.minute ?? 0),
  );
  return (
    <div className="grid gap-4 py-6 lg:grid-cols-12">
      <Card className="lg:col-span-8">
        <CardHeader>
          <CardTitle className="tracking-[0.04em]">Match Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length > 0 ? (
            <div className="divide-y divide-border">
              {events.map((event) => {
                const text = eventText(event);
                return (
                  <article className="grid grid-cols-[3.5rem_1fr] gap-3 py-4" key={event.id}>
                    <span className="font-label text-xs font-bold text-primary">
                      {event.minute ?? "–"}&apos;{event.extraMinute ? `+${event.extraMinute}` : ""}
                    </span>
                    <div>
                      <p className="font-semibold">{text.title}</p>
                      {text.detail ? (
                        <p className="mt-1 text-sm text-muted-foreground">{text.detail}</p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <StatePanel
              className="min-h-32 border-0"
              icon={Zap}
              title="ยังไม่มีรายงานเหตุการณ์สำหรับแมตช์นี้"
            />
          )}
        </CardContent>
      </Card>
      <Card className="lg:col-span-4">
        <CardHeader>
          <CardTitle className="tracking-[0.04em]">Score Detail</CardTitle>
        </CardHeader>
        <CardContent>
          {fixture.scores.length > 0 ? (
            <div className="divide-y divide-border">
              {fixture.scores.map((score, index) => (
                <div
                  className="flex items-center justify-between gap-4 py-4"
                  key={`${score.description}-${score.teamId ?? score.location}-${index}`}
                >
                  <div>
                    <p className="font-label text-[0.65rem] tracking-[0.08em] text-muted-foreground uppercase">
                      {score.location ?? "Match"}
                    </p>
                    <p className="mt-1 text-sm">{score.description}</p>
                  </div>
                  <span className="font-headline text-3xl text-primary">{score.goals ?? "–"}</span>
                </div>
              ))}
            </div>
          ) : (
            <StatePanel
              className="min-h-32 border-0"
              icon={Zap}
              title={fixture.resultInfo ?? "ยังไม่มีรายละเอียดสกอร์"}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LineupsPanel({ fixture }: { fixture: FootballFixtureDetail }) {
  const { away, home } = getTeams(fixture);
  const teams = [home, away].filter((team): team is NonNullable<typeof team> => Boolean(team));
  return (
    <div className="grid gap-4 py-6 lg:grid-cols-2">
      {teams.map((team) => {
        const players = fixture.lineups
          .filter((player) => player.teamId === team.id)
          .sort(
            (left, right) =>
              (left.formationPosition ?? 999) - (right.formationPosition ?? 999) ||
              (left.jerseyNumber ?? 999) - (right.jerseyNumber ?? 999),
          );
        return (
          <Card key={team.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <Link
                className="font-headline text-2xl tracking-[0.03em] uppercase hover:text-primary"
                href={`/team/${team.id}`}
              >
                {team.name}
              </Link>
              <Badge>{findFormation(fixture, team.id)}</Badge>
            </CardHeader>
            <CardContent>
              {players.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {players.map((player) => (
                    <Link
                      className="flex min-w-0 items-center gap-3 border border-border bg-background px-3 py-2 hover:border-primary"
                      href={`/player/${player.playerId}`}
                      key={player.id}
                    >
                      <span className="w-7 shrink-0 font-headline text-xl text-primary">
                        {player.jerseyNumber ?? "–"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {player.playerName}
                      </span>
                      {player.formationField ? (
                        <span className="font-label text-[0.6rem] text-muted-foreground">
                          {player.formationField}
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              ) : (
                <StatePanel
                  className="min-h-32 border-0"
                  icon={Zap}
                  title={
                    isPreMatch(fixture)
                      ? "รอประกาศรายชื่อก่อนเริ่มเกม"
                      : "ยังไม่มีรายชื่อผู้เล่นสำหรับแมตช์นี้"
                  }
                />
              )}
            </CardContent>
          </Card>
        );
      })}
      {teams.length === 0 ? (
        <Card className="lg:col-span-2">
          <CardContent>
            <StatePanel
              className="min-h-32 border-0"
              icon={Zap}
              title="ยังไม่มีข้อมูลทีมและรายชื่อผู้เล่น"
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function StatsPanel({ fixture }: { fixture: FootballFixtureDetail }) {
  const { away, home } = getTeams(fixture);
  const groups = new Map<string, { label: string; values: Map<number, number | string | null> }>();
  for (const statistic of fixture.statistics) {
    const key = statistic.typeCode ?? String(statistic.typeId);
    const group = groups.get(key) ?? {
      label: statistic.typeName ?? statistic.typeCode ?? `Statistic ${statistic.typeId}`,
      values: new Map(),
    };
    group.values.set(statistic.teamId, statistic.value);
    groups.set(key, group);
  }

  return (
    <Card className="my-6">
      <CardHeader className="grid grid-cols-[1fr_2fr_1fr] items-center gap-3 text-center">
        <p className="truncate font-headline text-xl uppercase">{home?.name ?? "Home"}</p>
        <h2 className="font-label text-xs tracking-[0.12em] text-muted-foreground uppercase">
          Match Statistics
        </h2>
        <p className="truncate font-headline text-xl uppercase">{away?.name ?? "Away"}</p>
      </CardHeader>
      <CardContent>
        {groups.size > 0 ? (
          <div className="divide-y divide-border">
            {[...groups.entries()].map(([key, group]) => {
              const leftValue = home ? group.values.get(home.id) : null;
              const rightValue = away ? group.values.get(away.id) : null;
              const leftNumber = Number.parseFloat(String(leftValue ?? ""));
              const rightNumber = Number.parseFloat(String(rightValue ?? ""));
              const total =
                Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
                  ? Math.abs(leftNumber) + Math.abs(rightNumber)
                  : 0;
              const leftWidth = total > 0 ? (Math.abs(leftNumber) / total) * 100 : 50;
              return (
                <div className="py-4" key={key}>
                  <div className="grid grid-cols-[1fr_2fr_1fr] items-center gap-3 text-center">
                    <span className="font-headline text-2xl">{leftValue ?? "–"}</span>
                    <span className="text-sm text-muted-foreground">{group.label}</span>
                    <span className="font-headline text-2xl">{rightValue ?? "–"}</span>
                  </div>
                  {total > 0 ? (
                    <div className="mt-2 flex h-1 bg-surface-elevated">
                      <div className="h-full bg-primary" style={{ width: `${leftWidth}%` }} />
                      <div className="h-full flex-1 bg-muted-foreground" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <StatePanel
            className="min-h-32 border-0"
            icon={Zap}
            title={
              isPreMatch(fixture)
                ? "สถิติจะเริ่มอัปเดตระหว่างการแข่งขัน"
                : "ยังไม่มีสถิติสำหรับแมตช์นี้"
            }
            description={
              isPreMatch(fixture)
                ? "ขณะนี้เกมยังไม่เริ่ม สามารถดูรายชื่อผู้เล่นและแผนการเล่นได้ในแท็บ Lineups"
                : "จะแสดงเมื่อผู้ให้บริการส่งข้อมูลของแมตช์นี้"
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

function AiTacticsPanel({
  analysis,
  error,
  fixture,
  isWorking,
  onRequest,
  signedIn,
}: {
  analysis: Analysis | null;
  error: string | null;
  fixture: FootballFixtureDetail;
  isWorking: boolean;
  onRequest: () => void;
  signedIn: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 py-6 lg:grid-cols-12">
      <div className="flex flex-col gap-4 lg:col-span-8">
        {fixture.momentum.length > 0 || analysis?.momentum.length ? (
          <MomentumChart analysis={analysis} fixture={fixture} />
        ) : null}
        <TacticalStructure analysis={analysis} fixture={fixture} />
        {analysis ? <AiExplanation analysis={analysis} /> : null}
      </div>
      <AiLiveFeed
        analysis={analysis}
        error={error}
        fixture={fixture}
        isWorking={isWorking}
        onRequest={onRequest}
        signedIn={signedIn}
      />
    </div>
  );
}

function MomentumChart({
  analysis,
  fixture,
}: {
  analysis: Analysis | null;
  fixture: FootballFixtureDetail;
}) {
  const { away, home } = getTeams(fixture);
  const duration = Math.max(
    fixture.lengthMinutes ?? 90,
    fixture.elapsed ?? 0,
    ...fixture.momentum.map((point) => point.minute + (point.extraMinute ?? 0)),
    90,
  );
  const momentum = fixture.momentum.map((point) => ({
    explanation: `โมเมนตัมเกมรุก ${point.value.toFixed(0)} / 100`,
    intensity: Math.min(100, Math.max(0, point.value)),
    key: `momentum-${point.id}`,
    minute: point.minute + (point.extraMinute ?? 0),
    teamId: point.teamId,
  }));
  const points = momentum
    .slice()
    .sort((left, right) => left.minute - right.minute)
    .map((point) => {
      const x = Math.min(1000, Math.max(0, (point.minute / duration) * 1000));
      const direction = point.teamId === home?.id ? -1 : point.teamId === away?.id ? 1 : 0;
      const y = 90 + direction * Math.min(78, point.intensity * 0.78);
      return { ...point, x, y };
    });

  return (
    <Card className="goal-news-ai-glow overflow-hidden bg-surface/70 backdrop-blur-xl">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 tracking-[0.04em]">
          <Activity className="size-5 text-primary" />
          โมเมนตัมเกมรุก
        </CardTitle>
        <span className="font-label text-[0.6rem] tracking-[0.08em] text-muted-foreground uppercase">
          GOAL · คะแนนประมาณการจากสถิติ
        </span>
      </CardHeader>
      <CardContent className="p-5">
        {points.length > 0 ? (
          <div>
            <div className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-3">
              <span className="truncate text-right font-label text-[0.6rem] text-primary">
                {home?.shortCode ?? "HOME"}
              </span>
              <div className="relative h-52 overflow-hidden border-b border-l border-border bg-background/50">
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
                <svg
                  aria-label="กราฟโมเมนตัมการแข่งขัน"
                  className="absolute inset-0 h-full w-full overflow-visible"
                  preserveAspectRatio="none"
                  role="img"
                  viewBox="0 0 1000 180"
                >
                  {points.map((point) => (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      fill={point.teamId === away?.id ? "#ffb4ab" : "#eaea00"}
                      key={point.key}
                      r="7"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
              </div>
              <span className="truncate font-label text-[0.6rem] text-[#ffb4ab]">
                {away?.shortCode ?? "AWAY"}
              </span>
            </div>
            <div className="ml-[4.25rem] mr-[4.25rem] mt-2 flex justify-between font-label text-[0.55rem] text-muted-foreground">
              <span>0&apos;</span>
              <span>HT</span>
              <span>{duration}&apos;</span>
            </div>
          </div>
        ) : (
          <StatePanel
            className="min-h-32 border-0"
            icon={Zap}
            title="ยังไม่มีสถิติต่อเนื่องเพียงพอคำนวณโมเมนตัม"
            description="ต้องมีสถิติอย่างน้อยสองช่วงเวลาระหว่างการแข่งขัน การอัปเดตห่างกันมากจะไม่สร้างค่าประมาณ"
          />
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          คะแนนจากการเปลี่ยนแปลงจำนวนยิง ยิงตรงกรอบ และเตะมุม ไม่ใช่โอกาสทำประตูหรือ xG
          จุดที่ขาดหายหมายถึงไม่มีข้อมูลเพียงพอ
        </p>
        {analysis?.momentum.length ? (
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground" aria-label="ข้อสังเกตจาก AI">
            {analysis.momentum.map((point, index) => (
              <li key={index}>
                AI · {point.minute}′ {point.explanation}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TacticalStructure({
  analysis,
  fixture,
}: {
  analysis: Analysis | null;
  fixture: FootballFixtureDetail;
}) {
  const { away, home } = getTeams(fixture);
  const sides = [
    { ai: analysis?.tactical.home, team: home },
    { ai: analysis?.tactical.away, team: away },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="tracking-[0.04em]">Tactical Structure</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          แผนการเล่นและรายชื่อผู้เล่นของทั้งสองทีม
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
        {sides.map(({ ai: sideAnalysis, team }, index) => {
          const players = fixture.lineups
            .filter((player) => player.teamId === team?.id && player.typeId === 11)
            .sort(
              (left, right) => (left.formationPosition ?? 999) - (right.formationPosition ?? 999),
            )
            .slice(0, 11);
          return (
            <article
              className="relative overflow-hidden border border-border bg-background p-4"
              key={team?.id ?? index}
            >
              <div aria-hidden="true" className="absolute inset-4 border border-white/5" />
              <div className="relative">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="truncate font-headline text-2xl uppercase">
                    {team?.name ?? "Team"}
                  </h3>
                  <Badge>{sideAnalysis?.formation ?? findFormation(fixture, team?.id)}</Badge>
                </div>
                {sideAnalysis?.style ? (
                  <p className="mt-3 min-h-12 text-sm leading-6 text-foreground-warm">
                    {sideAnalysis.style}
                  </p>
                ) : null}
                {players.length > 0 ? (
                  <div className="mt-4 flex min-h-36 flex-wrap content-center justify-center gap-2 border-y border-white/5 py-4">
                    {players.map((player) => (
                      <Link
                        className="flex items-center gap-1 border border-border bg-surface px-2 py-1 font-label text-[0.55rem] hover:border-primary hover:text-primary"
                        href={`/player/${player.playerId}`}
                        key={player.id}
                        title={player.formationField ?? undefined}
                      >
                        <span className="text-primary">{player.jerseyNumber ?? "–"}</span>
                        {player.playerName}
                      </Link>
                    ))}
                  </div>
                ) : null}
                {sideAnalysis ? (
                  <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <p className="font-label text-[0.6rem] text-primary uppercase">Strengths</p>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        {sideAnalysis.strengths.map((strength) => (
                          <li key={strength}>+ {strength}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-label text-[0.6rem] text-[#ffb4ab] uppercase">
                        Weaknesses
                      </p>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        {sideAnalysis.weaknesses.map((weakness) => (
                          <li key={weakness}>– {weakness}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
        {analysis?.tactical.changes.length ? (
          <div className="border-l-2 border-primary bg-primary/5 p-4 md:col-span-2">
            <p className="font-label text-[0.6rem] tracking-[0.1em] text-primary uppercase">
              Tactical changes detected
            </p>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-foreground-warm">
              {analysis.tactical.changes.map((change) => (
                <li key={change}>• {change}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AiExplanation({ analysis }: { analysis: Analysis }) {
  return (
    <Card>
      <CardHeader>
        <p className="font-label text-[0.6rem] tracking-[0.12em] text-primary uppercase">
          AI Explain Match · Confidence {Math.round(analysis.confidence * 100)}%
        </p>
        <h2 className="mt-2 font-headline text-3xl tracking-[0.03em] uppercase">
          {analysis.summary.headline}
        </h2>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="text-sm leading-7 text-foreground-warm">{analysis.summary.short}</p>
          <p className="mt-4 text-sm leading-7">{analysis.explanation.whyResult}</p>
        </div>
        <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
          {analysis.explanation.decidingFactors.map((factor) => (
            <li className="border-l border-primary pl-3" key={factor}>
              {factor}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AiLiveFeed({
  analysis,
  error,
  fixture,
  isWorking,
  onRequest,
  signedIn,
}: {
  analysis: Analysis | null;
  error: string | null;
  fixture: FootballFixtureDetail;
  isWorking: boolean;
  onRequest: () => void;
  signedIn: boolean;
}) {
  const items = [
    ...(analysis?.momentum.map((point) => ({
      key: `ai-${point.minute}-${point.explanation}`,
      kind: "ai" as const,
      minute: point.minute,
      text: point.explanation,
    })) ?? []),
    ...fixture.events.map((event) => ({
      key: `event-${event.id}`,
      kind: "event" as const,
      minute: event.minute ?? 0,
      text: [eventText(event).title, eventText(event).detail].filter(Boolean).join(" · "),
    })),
  ].sort((left, right) => right.minute - left.minute);

  return (
    <Card className="flex min-h-[42rem] flex-col lg:col-span-4">
      <CardHeader className="flex flex-row items-center justify-between gap-3 bg-surface-elevated">
        <CardTitle className="flex items-center gap-2 tracking-[0.04em]">
          <BrainCircuit className="size-5 text-primary" /> AI Live Feed
        </CardTitle>
        <span
          className={`size-2 rounded-full bg-primary ${fixture.isLive || isWorking ? "goal-live-pulse" : ""}`}
        />
      </CardHeader>
      <ScrollArea className="h-[34rem] flex-1">
        <CardContent className="p-4">
          {analysis ? (
            <div className="mb-4 border-l-2 border-primary bg-primary/5 p-4">
              <p className="font-label text-[0.6rem] tracking-[0.1em] text-primary uppercase">
                AI Match Summary
              </p>
              <p className="mt-2 text-sm leading-6">{analysis.summary.short}</p>
            </div>
          ) : null}
          {items.length > 0 ? (
            <div className="divide-y divide-border">
              {items.slice(0, 24).map((item) => (
                <article
                  className={
                    item.kind === "ai"
                      ? "border-l-2 border-primary bg-surface-elevated p-4"
                      : "grid grid-cols-[3rem_1fr] gap-3 py-4"
                  }
                  key={item.key}
                >
                  {item.kind === "ai" ? (
                    <>
                      <p className="font-label text-[0.6rem] tracking-[0.1em] text-primary uppercase">
                        {item.minute}&apos; · Momentum shift
                      </p>
                      <p className="mt-2 text-sm leading-6">{item.text}</p>
                    </>
                  ) : (
                    <>
                      <span className="font-label text-xs text-muted-foreground">
                        {item.minute}&apos;
                      </span>
                      <p className="text-sm leading-6 text-foreground-warm">{item.text}</p>
                    </>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <StatePanel
              className="min-h-32 border-0"
              icon={Zap}
              title={
                isWorking
                  ? "กำลังจัดทำบทวิเคราะห์"
                  : analysis
                    ? "รอข้อมูลเหตุการณ์เพิ่มเติม"
                    : "บทวิเคราะห์ AI สำหรับแมตช์นี้"
              }
              description={
                isWorking
                  ? "ผลวิเคราะห์จะแสดงเมื่อประมวลผลเสร็จ"
                  : analysis
                    ? "เหตุการณ์จะอัปเดตเมื่อมีรายงานจากการแข่งขัน"
                    : "กดวิเคราะห์แมตช์นี้เพื่อขอบทวิเคราะห์จากข้อมูลที่มี หรือเข้าสู่ระบบเพื่อเริ่มใช้งาน"
              }
            />
          )}
        </CardContent>
      </ScrollArea>
      <div className="border-t border-border bg-surface-elevated p-4">
        {error ? (
          <Alert className="mb-3" variant="destructive">
            <CircleAlert />
            <AlertDescription className="text-current">{error}</AlertDescription>
          </Alert>
        ) : null}
        {signedIn ? (
          <Button className="w-full rounded-none" disabled={isWorking} onClick={onRequest}>
            {isWorking ? (
              <>
                <Spinner /> AI กำลังวิเคราะห์…
              </>
            ) : (
              <>
                <RefreshCw /> {analysis ? "อัปเดต AI Analysis" : "วิเคราะห์แมตช์นี้"}
              </>
            )}
          </Button>
        ) : (
          <Button asChild className="w-full rounded-none">
            <Link href="/login">
              <Sparkles /> เข้าสู่ระบบเพื่อใช้ AI Tactics
            </Link>
          </Button>
        )}
        <p className="mt-3 text-center text-[0.65rem] leading-5 text-muted-foreground">
          AI ใช้เฉพาะข้อมูล Match API ที่ตรวจสอบได้และอาจคลาดเคลื่อน
        </p>
      </div>
    </Card>
  );
}
