"use client";

import {
  listFootballFixtures,
  type FootballFixturePage,
  type FootballFixturePageDataItem,
} from "@goal-app/api-client";
import { getFixtureRange } from "@goal-app/config";
import {
  Calendar as CalendarDays,
  NavArrowDown,
  WarningTriangle as TriangleAlert,
} from "iconoir-react";
import { useState } from "react";

import { FixtureCalendarRow } from "@/components/football/fixture-calendar-row";
import { StatePanel } from "@/components/shared/state-panel";
import { UnderlineTabs, type UnderlineTabItem } from "@/components/shared/underline-tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { configureGoalBrowserApi } from "@/lib/api-browser";

type RangeMode = "results" | "today" | "upcoming";

const rangeFilters: readonly UnderlineTabItem<RangeMode>[] = [
  { label: "ย้อนหลัง 30 วัน", value: "results" },
  { label: "วันนี้", value: "today" },
  { label: "ล่วงหน้า 30 วัน", value: "upcoming" },
];

function groupFixtures(fixtures: FootballFixturePageDataItem[]) {
  return Object.entries(
    fixtures.reduce<Record<string, FootballFixturePageDataItem[]>>((groups, fixture) => {
      const day = new Date(fixture.startsAt);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      groups[key] = [...(groups[key] ?? []), fixture];
      return groups;
    }, {}),
  );
}

export function FixturesBrowser({
  initial,
  initialError,
  initialRange,
}: {
  initial: FootballFixturePage;
  initialError: boolean;
  initialRange: { from: string; to: string };
}) {
  const [fixtures, setFixtures] = useState(initial.data);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [range, setRange] = useState(initialRange);
  const [mode, setMode] = useState<RangeMode>("today");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  const load = async (
    nextRange: { from: string; to: string },
    nextCursor?: string,
    selectedMode: RangeMode = mode,
  ) => {
    setLoading(true);
    setError(false);
    if (!nextCursor) {
      setFixtures([]);
      setCursor(null);
    }
    try {
      configureGoalBrowserApi({ optionalAuth: true });
      const result = await listFootballFixtures({
        cursor: nextCursor,
        from: nextRange.from,
        limit: 50,
        order: selectedMode === "results" ? "desc" : "asc",
        to: nextRange.to,
      });
      setFixtures((current) => (nextCursor ? [...current, ...result.data] : result.data));
      setCursor(result.nextCursor);
      setRange(nextRange);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const selectMode = (nextMode: RangeMode) => {
    setMode(nextMode);
    void load(getFixtureRange(nextMode), undefined, nextMode);
  };

  return (
    <main className="goal-score-shell goal-discovery-grid min-h-screen">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        <header>
          <p className="font-label text-xs font-bold tracking-[0.2em] text-primary uppercase">
            Match calendar
          </p>
          <h1 className="mt-2 font-headline text-4xl uppercase sm:text-6xl">ผลบอลและโปรแกรม</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            เช็กผลย้อนหลัง การแข่งขันวันนี้ และโปรแกรมฟุตบอลล่วงหน้าในที่เดียว
          </p>
          <UnderlineTabs
            ariaLabel="ช่วงการแข่งขัน"
            className="mt-6"
            itemClassName="w-36 min-w-36 px-4 sm:w-40 sm:min-w-40"
            items={rangeFilters.map((item) => ({ ...item, disabled: loading }))}
            onValueChange={selectMode}
            value={mode}
          />
        </header>

        <section aria-busy={loading} aria-live="polite" className="mt-7">
          {error && (
            <Alert className="mb-4 items-center" variant="destructive">
              <TriangleAlert className="size-5 text-primary" />
              <div className="col-start-2 flex min-w-0 items-center justify-between gap-3">
                <AlertDescription className="col-start-auto text-current">
                  โหลดโปรแกรมการแข่งขันไม่สำเร็จ
                </AlertDescription>
                <Button
                  className="text-current"
                  onClick={() => void load(range)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  ลองใหม่
                </Button>
              </div>
            </Alert>
          )}
          {loading && fixtures.length === 0 ? (
            <div className="flex min-h-56 items-center justify-center gap-3 border border-border bg-surface/90 font-label text-sm text-muted-foreground">
              <Spinner className="size-5 text-primary" /> กำลังโหลดการแข่งขัน…
            </div>
          ) : error && fixtures.length === 0 ? null : fixtures.length === 0 ? (
            <StatePanel
              className="min-h-56 border border-border bg-surface/90"
              description="ลองเลือกช่วงเวลาอื่นเพื่อดูผลการแข่งขันหรือโปรแกรมล่วงหน้า"
              icon={CalendarDays}
              title="ไม่มีการแข่งขันในช่วงนี้"
            />
          ) : (
            <div className="space-y-8">
              {groupFixtures(fixtures).map(([date, rows]) => (
                <section key={date}>
                  <h2 className="sticky top-16 z-20 border-l-4 border-primary bg-[#1a1b1f] px-4 py-2 font-label text-xs font-bold tracking-[0.08em] text-foreground shadow-md sm:text-sm">
                    {new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", {
                      dateStyle: "full",
                    })}
                  </h2>
                  <div className="divide-y divide-border border border-border bg-surface shadow-lg">
                    {rows.map((fixture) => (
                      <FixtureCalendarRow fixture={fixture} key={fixture.id} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          {cursor && (
            <div className="flex justify-center pt-8">
              <Button
                className="min-w-52"
                disabled={loading}
                onClick={() => void load(range, cursor)}
                type="button"
                variant="outline"
              >
                {loading ? <Spinner /> : <NavArrowDown className="size-4" />}
                {loading ? "กำลังโหลด…" : "โหลดเพิ่มเติม"}
              </Button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
