"use client";

import {
  cheerForMatchTeam,
  followMatch,
  getMatchFanHeatmap,
  listMyMatchFollows,
  unfollowMatch,
  type FanHeatmapResponse,
} from "@goal-app/api-client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { configureGoalBrowserApi } from "@/lib/api-browser";

type Team = { id: number; name: string };

export function MatchCommunityPanel({ fixtureId, teams }: { fixtureId: number; teams: Team[] }) {
  const [heatmap, setHeatmap] = useState<FanHeatmapResponse | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [following, setFollowing] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const configure = useCallback(() => {
    return configureGoalBrowserApi({ optionalAuth: true });
  }, []);

  const refresh = useCallback(async () => {
    configure();
    setHeatmap(await getMatchFanHeatmap(fixtureId));
  }, [configure, fixtureId]);

  useEffect(() => {
    const supabase = configure();
    void Promise.resolve()
      .then(refresh)
      .catch(() => setMessage("Fan Heatmap ไม่พร้อมใช้งานชั่วคราว"));
    if (supabase) {
      void supabase.auth.getSession().then(({ data }) => {
        const authenticated = Boolean(data.session);
        setSignedIn(authenticated);
        if (authenticated) {
          void listMyMatchFollows()
            .then(({ data: follows }) =>
              setFollowing(follows.some((follow) => follow.fixtureId === fixtureId)),
            )
            .catch(() => undefined);
        }
      });
      const channel = supabase
        .channel(`fan-heatmap:${fixtureId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            filter: `fixture_id=eq.${fixtureId}`,
            schema: "public",
            table: "fixture_fan_heatmap_totals",
          },
          () => void refresh().catch(() => undefined),
        )
        .subscribe();
      const fallback = window.setInterval(() => void refresh().catch(() => undefined), 15_000);
      return () => {
        window.clearInterval(fallback);
        void supabase.removeChannel(channel);
      };
    }
    const fallback = window.setInterval(() => void refresh().catch(() => undefined), 15_000);
    return () => window.clearInterval(fallback);
  }, [configure, fixtureId, refresh]);

  useEffect(() => {
    if (!selectedTeam) return;
    const heartbeat = window.setInterval(() => {
      configure();
      void cheerForMatchTeam(fixtureId, { teamId: selectedTeam })
        .then(setHeatmap)
        .catch(() => undefined);
    }, 4 * 60_000);
    return () => window.clearInterval(heartbeat);
  }, [configure, fixtureId, selectedTeam]);

  const toggleFollow = async () => {
    configure();
    setMessage(null);
    try {
      if (following) await unfollowMatch(fixtureId);
      else
        await followMatch(fixtureId, {
          liveAlertsDuringQuietHours: false,
          notificationsEnabled: true,
        });
      setFollowing(!following);
    } catch {
      setMessage("อัปเดตการ Follow ไม่สำเร็จ");
    }
  };

  const cheer = async (teamId: number) => {
    configure();
    setMessage(null);
    try {
      setHeatmap(await cheerForMatchTeam(fixtureId, { teamId }));
      setSelectedTeam(teamId);
    } catch {
      setMessage("ส่งแรงเชียร์ไม่สำเร็จ");
    }
  };

  return (
    <section className="mt-5 rounded-3xl border border-primary/25 bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-label text-xs tracking-[0.18em] text-primary uppercase">
            Live community
          </p>
          <h2 className="mt-1 font-headline text-3xl font-bold">Fan Heatmap</h2>
        </div>
        {signedIn ? (
          <Button onClick={toggleFollow} type="button" variant={following ? "outline" : "default"}>
            {following ? "Following ✓" : "Follow match"}
          </Button>
        ) : (
          <Link className="text-sm text-primary" href="/login">
            เข้าสู่ระบบเพื่อ Follow และเชียร์
          </Link>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        ผู้เชียร์ที่ active ใน 5 นาทีล่าสุด {heatmap?.totalSupporters ?? 0} คน — แสดงเฉพาะยอดรวม
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {teams.map((team) => {
          const total = heatmap?.teams.find((item) => item.teamId === team.id);
          return (
            <Button
              className="h-auto w-full flex-col items-stretch overflow-hidden border-border bg-background p-0 text-left font-body normal-case tracking-normal"
              disabled={!signedIn}
              key={team.id}
              onClick={() => cheer(team.id)}
              type="button"
              variant="outline"
            >
              <div className="p-4">
                <span className="font-semibold">{team.name}</span>
                <span className="float-right font-headline text-2xl text-primary">
                  {total?.percentage ?? 0}%
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  {total?.supporters ?? 0} supporters
                </p>
              </div>
              <Progress
                aria-label={`${team.name} fan support`}
                className="h-1.5 rounded-none bg-surface-elevated"
                value={total?.percentage ?? 0}
              />
            </Button>
          );
        })}
      </div>
      {message && (
        <Alert className="mt-4" variant="destructive">
          <AlertDescription className="text-current">{message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
