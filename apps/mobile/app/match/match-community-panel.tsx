import type { FanHeatmapResponse } from "@goal-app/api-client";
import { Link } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { goalApi } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { getSupabaseClient } from "@/lib/auth/supabase";
import { registerPushAfterFollow } from "@/lib/notifications/register";

type Team = { id: number; name: string };

export function MatchCommunityPanel({ fixtureId, teams }: { fixtureId: number; teams: Team[] }) {
  const { session } = useAuth();
  const [heatmap, setHeatmap] = useState<FanHeatmapResponse | null>(null);
  const [following, setFollowing] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void goalApi
      .getMatchFanHeatmap(fixtureId)
      .then(setHeatmap)
      .catch(() => setMessage("Fan Heatmap ไม่พร้อมใช้งานชั่วคราว"));
  }, [fixtureId]);

  useEffect(() => {
    refresh();
    if (session) {
      void goalApi
        .listMyMatchFollows()
        .then(({ data }) => setFollowing(data.some((follow) => follow.fixtureId === fixtureId)))
        .catch(() => undefined);
    }
    const supabase = getSupabaseClient();
    const channel = supabase
      ?.channel(`fan-heatmap:${fixtureId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `fixture_id=eq.${fixtureId}`,
          schema: "public",
          table: "fixture_fan_heatmap_totals",
        },
        refresh,
      )
      .subscribe();
    const fallback = setInterval(refresh, 15_000);
    return () => {
      clearInterval(fallback);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [fixtureId, refresh, session]);

  useEffect(() => {
    if (!selectedTeam) return;
    const heartbeat = setInterval(() => {
      void goalApi
        .cheerForMatchTeam(fixtureId, { teamId: selectedTeam })
        .then(setHeatmap)
        .catch(() => setMessage("ต่ออายุแรงเชียร์ไม่สำเร็จชั่วคราว"));
    }, 4 * 60_000);
    return () => clearInterval(heartbeat);
  }, [fixtureId, selectedTeam]);

  async function toggleFollow() {
    setMessage(null);
    try {
      if (following) {
        await goalApi.unfollowMatch(fixtureId);
        setFollowing(false);
        return;
      }
      await goalApi.followMatch(fixtureId, {
        liveAlertsDuringQuietHours: false,
        notificationsEnabled: true,
      });
      setFollowing(true);
    } catch {
      setMessage("อัปเดตการ Follow ไม่สำเร็จ");
      return;
    }
    try {
      const push = await registerPushAfterFollow();
      if (push === "denied") setMessage("Follow แล้ว แต่ยังไม่ได้เปิดสิทธิ์ Push notification");
    } catch {
      setMessage("Follow สำเร็จ แต่ลงทะเบียน Push notification ไม่สำเร็จ");
    }
  }

  async function cheer(teamId: number) {
    setMessage(null);
    try {
      setHeatmap(await goalApi.cheerForMatchTeam(fixtureId, { teamId }));
      setSelectedTeam(teamId);
    } catch {
      setMessage("ส่งแรงเชียร์ไม่สำเร็จ");
    }
  }

  return (
    <View className="mt-4 rounded-[28px] border border-primary/30 bg-surface p-6">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-label text-xs tracking-[2px] text-primary">LIVE COMMUNITY</Text>
          <Text className="mt-1 font-headline-thai text-3xl text-foreground">Fan Heatmap</Text>
        </View>
        {session ? (
          <Pressable
            className={
              following
                ? "rounded-full border border-primary px-4 py-2"
                : "rounded-full bg-primary px-4 py-2"
            }
            onPress={() => void toggleFollow()}
          >
            <Text className={following ? "font-label text-primary" : "font-label text-black"}>
              {following ? "FOLLOWING ✓" : "FOLLOW"}
            </Text>
          </Pressable>
        ) : (
          <Link className="font-label text-sm text-primary" href="/auth">
            SIGN IN
          </Link>
        )}
      </View>
      <Text className="mt-2 font-body-thai text-sm text-muted">
        Active 5 นาทีล่าสุด {heatmap?.totalSupporters ?? 0} คน · แสดงเฉพาะยอดรวม
      </Text>
      <View className="mt-5 gap-3">
        {teams.map((team) => {
          const total = heatmap?.teams.find((item) => item.teamId === team.id);
          return (
            <Pressable
              className="rounded-2xl border border-border bg-background p-4 disabled:opacity-60"
              disabled={!session}
              key={team.id}
              onPress={() => void cheer(team.id)}
            >
              <View className="flex-row justify-between gap-3">
                <Text className="flex-1 font-body-thai text-foreground">{team.name}</Text>
                <Text className="font-headline text-2xl text-primary">
                  {total?.percentage ?? 0}%
                </Text>
              </View>
              <Text className="mt-1 font-label text-xs text-muted">
                {total?.supporters ?? 0} SUPPORTERS
              </Text>
            </Pressable>
          );
        })}
      </View>
      {message && <Text className="mt-4 font-body-thai text-sm text-[#FF5D73]">{message}</Text>}
    </View>
  );
}
