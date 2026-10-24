"use client";

import type { FootballFixturePage } from "@goal-app/api-client";
import { getDateKey } from "@goal-app/config";
import { NavArrowLeft, NavArrowRight } from "iconoir-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { FootballEntityAvatar } from "@/components/football/entity-avatar";
import { getFixtureTeams } from "@/components/score/score-components";
import { Button } from "@/components/ui/button";
import { StatePanel } from "@/components/shared/state-panel";
import { goalApi } from "@/lib/api";
import { fixtureStatus, isFixtureUpcoming } from "@/lib/fixture-status";
import {
  groupHomeFixtures,
  homeDateLabel,
  homeFixtureQuery,
  shiftHomeDate,
  type HomeFixtureFilter,
} from "./home-fixture-model";

const filters: { value: HomeFixtureFilter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "live", label: "Live" },
  { value: "finished", label: "จบแล้ว" },
  { value: "upcoming", label: "โปรแกรมถัดไป" },
];
type Selection = { date: string; filter: HomeFixtureFilter };

export function HomeFixtureBoard({
  initial,
  initialError = false,
  todayKey,
}: {
  initial: FootballFixturePage;
  initialError?: boolean;
  todayKey: string;
}) {
  const [today, setToday] = useState(todayKey);
  const [selection, setSelection] = useState<Selection>({ date: todayKey, filter: "all" });
  const [page, setPage] = useState(initial);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const busy = useRef(false);
  const pages = useRef(1);

  const load = useCallback(
    async (
      target: Selection,
      options: { cursor?: string; background?: boolean; reset?: boolean } = {},
    ) => {
      if (options.background && busy.current) return;
      const id = ++requestId.current;
      busy.current = true;
      if (!options.background) setLoading(true);
      const count = options.cursor || options.reset ? 1 : pages.current;
      try {
        let cursor = options.cursor;
        const rows: FootballFixturePage["data"] = [];
        let nextCursor: string | null = null;
        let feed: FootballFixturePage["feed"];
        const query = homeFixtureQuery(target.date, target.filter);
        for (let index = 0; index < count; index += 1) {
          const result = await goalApi().listFootballFixtures({ ...query, cursor });
          if (id !== requestId.current) return;
          rows.push(...result.data);
          feed = result.feed;
          nextCursor = result.nextCursor;
          if (!nextCursor) break;
          cursor = nextCursor;
        }
        setPage((previous) => ({
          data: [
            ...new Map(
              (options.cursor ? [...previous.data, ...rows] : rows).map((fixture) => [
                fixture.id,
                fixture,
              ]),
            ).values(),
          ],
          nextCursor,
          feed,
        }));
        if (options.cursor) pages.current += 1;
        setError(false);
      } catch {
        if (id === requestId.current) setError(true);
      } finally {
        if (id === requestId.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [],
  );

  const select = useCallback(
    (next: Selection) => {
      setSelection(next);
      setPage({ data: [], nextCursor: null });
      setError(false);
      pages.current = 1;
      void load(next, { reset: true });
    },
    [load],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const currentDay = getDateKey();
      if (currentDay !== today) {
        setToday(currentDay);
        if (selection.date === today) {
          select({ ...selection, date: currentDay });
          return;
        }
      }
      void load(selection, { background: true });
    }, 15_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [load, select, selection, today]);

  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  const groups = groupHomeFixtures(page.data);
  const tomorrow = shiftHomeDate(selection.date, 1);

  return (
    <section aria-label="ผลบอลและโปรแกรมการแข่งขัน" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-label text-xs font-bold tracking-[0.16em] text-primary uppercase">
            Match calendar
          </p>
          <h2 className="mt-1 text-2xl font-bold">ผลบอลและโปรแกรม</h2>
        </div>
        <span className="text-xs text-muted-foreground">เวลาไทย · แสดงข้อมูลที่ซิงก์ล่าสุด</span>
      </div>
      <div className="space-y-4 border border-border bg-surface p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <Button
            aria-label="วันก่อนหน้า"
            onClick={() => select({ ...selection, date: shiftHomeDate(selection.date, -1) })}
            size="icon"
            variant="ghost"
          >
            <NavArrowLeft />
          </Button>
          <div className="min-w-0 text-center">
            <p className="font-semibold">{homeDateLabel(selection.date, today)}</p>
            <label className="mt-1 block text-xs text-muted-foreground">
              <span className="sr-only">เลือกวันที่แข่งขัน</span>
              <input
                aria-label="เลือกวันที่แข่งขัน"
                className="max-w-full bg-transparent text-center [color-scheme:dark]"
                type="date"
                value={selection.date}
                onChange={(event) => {
                  const value = event.target.value;
                  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) select({ ...selection, date: value });
                }}
              />
            </label>
          </div>
          <Button
            aria-label="วันถัดไป"
            onClick={() => select({ ...selection, date: shiftHomeDate(selection.date, 1) })}
            size="icon"
            variant="ghost"
          >
            <NavArrowRight />
          </Button>
        </div>
        <div className="flex items-center justify-center gap-2">
          {[-1, 0, 1].map((offset) => (
            <Button
              key={offset}
              onClick={() => select({ ...selection, date: shiftHomeDate(today, offset) })}
              size="sm"
              variant="ghost"
            >
              {offset === -1 ? "เมื่อวาน" : offset === 0 ? "วันนี้" : "พรุ่งนี้"}
            </Button>
          ))}
        </div>
        <div aria-label="สถานะการแข่งขัน" className="grid grid-cols-4 gap-1" role="group">
          {filters.map((filter) => (
            <Button
              aria-pressed={selection.filter === filter.value}
              className="px-1 text-xs sm:text-sm"
              key={filter.value}
              onClick={() => select({ ...selection, filter: filter.value })}
              variant={selection.filter === filter.value ? "default" : "ghost"}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>
      {selection.filter === "upcoming" && (
        <p className="text-sm text-muted-foreground">
          โปรแกรมถัดไปตามช่วงวันที่ที่ผู้ให้บริการเปิดให้เข้าถึง แยกตามวัน รายการ และรอบ
        </p>
      )}
      {page.feed && (
        <p className="text-xs leading-relaxed text-muted-foreground" role="status">
          API-Football ·{" "}
          {page.feed.plan === "free"
            ? "Free plan: ดึงโปรแกรมใหม่ได้เมื่อวาน–พรุ่งนี้ อัปเดตประมาณทุก 1 ชั่วโมง"
            : `อัปเดตประมาณทุก ${page.feed.refreshSeconds} วินาที`}
          {page.feed.liveUpdatedAt &&
            ` · ตรวจผลล่าสุด ${new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(page.feed.liveUpdatedAt))}`}
          {page.feed.issueCode &&
            (page.feed.issueCode === "quota"
              ? " · โควตาผู้ให้บริการใกล้หมด กำลังแสดงข้อมูลที่บันทึกไว้"
              : " · การซิงก์ข้อมูลล่าสุดมีปัญหา ระบบจะลองใหม่อัตโนมัติ")}
        </p>
      )}
      {error && (
        <div
          className="flex items-center justify-between gap-3 border border-destructive/50 p-3 text-sm"
          role="alert"
        >
          <span>
            {page.data.length
              ? "อัปเดตไม่สำเร็จ กำลังแสดงข้อมูลล่าสุดที่โหลดได้"
              : "โหลดการแข่งขันไม่สำเร็จ"}
          </span>
          <Button
            disabled={loading}
            onClick={() => void load(selection)}
            size="sm"
            variant="outline"
          >
            ลองอีกครั้ง
          </Button>
        </div>
      )}
      <div aria-busy={loading} aria-live="polite" className="space-y-6">
        {loading && page.data.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground" role="status">
            กำลังโหลดการแข่งขัน…
          </p>
        ) : !error && groups.length === 0 ? (
          <StatePanel
            title={
              selection.filter === "live"
                ? "ไม่มีการแข่งขันสดในช่วงนี้"
                : selection.filter === "finished"
                  ? "ยังไม่มีผลการแข่งขันในช่วงนี้"
                  : "ยังไม่มีโปรแกรมในช่วงนี้"
            }
            description={
              page.feed?.plan === "free"
                ? "แพ็กเกจปัจจุบันดึงข้อมูลใหม่ได้เฉพาะเมื่อวาน วันนี้ และพรุ่งนี้ วันที่อื่นอาจยังไม่เคยถูกบันทึก"
                : "อาจไม่มีคู่แข่งในช่วงที่เลือก หรือข้อมูลยังไม่ถูกซิงก์ ลองเลือกวันอื่นหรือเปลี่ยนตัวกรอง"
            }
          />
        ) : null}
        {groups.map((group, index) => (
          <div key={group.key}>
            {(index === 0 || group.date !== groups[index - 1]?.date) && (
              <h3 className="mb-4 border-b border-border pb-2 text-sm font-semibold text-muted-foreground">
                {selection.filter !== "upcoming" && group.date === tomorrow
                  ? `เช้ามืด${homeDateLabel(group.date, today)} · ก่อน 06:00 น.`
                  : homeDateLabel(group.date, today)}
              </h3>
            )}
            <Link className="mb-3 flex items-center gap-3" href={`/league/${group.league.id}`}>
              <FootballEntityAvatar
                className="size-9 shrink-0 border-0 bg-transparent"
                imageUrl={group.league.imageUrl}
                name={group.league.name}
              />
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold">{group.league.name}</h4>
                <p className="text-xs text-muted-foreground">
                  {[group.stage?.name, group.round?.name ? `รอบ ${group.round.name}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <NavArrowRight className="size-4" />
            </Link>
            <div className="space-y-2">
              {group.fixtures.map((fixture) => {
                const { home, away } = getFixtureTeams(fixture);
                const showScore = !isFixtureUpcoming(fixture);
                return (
                  <Link
                    aria-label={`${home.name} พบ ${away.name} · ${fixtureStatus(fixture)}`}
                    className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 rounded-lg border border-border bg-surface px-3 py-4 transition-colors hover:bg-surface-elevated focus-visible:outline-2 focus-visible:outline-primary sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:px-4"
                    href={`/match/${fixture.id}`}
                    key={fixture.id}
                  >
                    <span
                      className={`border-r border-border pr-3 text-center text-xs font-bold ${fixture.isLive ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {fixtureStatus(fixture)}
                    </span>
                    <div className="space-y-2">
                      {[
                        { team: home, score: fixture.homeScore },
                        { team: away, score: fixture.awayScore },
                      ].map(({ team, score }) => (
                        <div className="flex items-center gap-3" key={team.id}>
                          <FootballEntityAvatar
                            className="size-7 shrink-0 border-0 bg-transparent"
                            imageUrl={team.imageUrl}
                            name={team.name}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold sm:text-base">
                            {team.name}
                          </span>
                          {showScore && (
                            <span className="font-headline text-xl font-bold tabular-nums">
                              {score ?? "–"}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {page.nextCursor && (
        <Button
          className="w-full"
          disabled={loading}
          onClick={() => void load(selection, { cursor: page.nextCursor! })}
          variant="outline"
        >
          {loading ? "กำลังโหลด…" : "โหลดการแข่งขันเพิ่มเติม"}
        </Button>
      )}
    </section>
  );
}
