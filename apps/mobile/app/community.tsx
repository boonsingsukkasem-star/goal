import type {
  FavoritesResponse,
  MatchFollowsResponse,
  NotificationHistoryResponse,
  NotificationPreferences,
  PersonalizedFeedResponse,
} from "@goal-app/api-client";
import { Link, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { goalApi } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

const toggles: Array<[keyof NotificationPreferences, string]> = [
  ["goal", "ประตู"],
  ["redCard", "ใบแดง"],
  ["halftimeFulltime", "พักครึ่ง / จบเกม"],
  ["kickoffReminder", "เตือนก่อนเริ่มแข่ง"],
  ["lineup", "รายชื่อผู้เล่น"],
  ["substitution", "เปลี่ยนตัว"],
  ["yellowCard", "ใบเหลือง"],
  ["aiContext", "AI อธิบายบริบทเกม"],
  ["newsBreaking", "ข่าวด่วนฟุตบอล"],
  ["trendingNews", "ข่าวฟุตบอลมาแรง"],
];

export default function CommunityScreen() {
  const { loading, session } = useAuth();
  const [favorites, setFavorites] = useState<FavoritesResponse["data"]>([]);
  const [follows, setFollows] = useState<MatchFollowsResponse["data"]>([]);
  const [feed, setFeed] = useState<PersonalizedFeedResponse["data"]>([]);
  const [history, setHistory] = useState<NotificationHistoryResponse["data"]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [favoriteResult, followResult, feedResult, preferenceResult, historyResult] =
      await Promise.all([
        goalApi.listMyFavorites(),
        goalApi.listMyMatchFollows(),
        goalApi.getPersonalizedFootballFeed({ limit: 20 }),
        goalApi.getNotificationPreferences(),
        goalApi.listMyNotifications({ limit: 10 }),
      ]);
    setFavorites(favoriteResult.data);
    setFollows(followResult.data);
    setFeed(feedResult.data);
    setPreferences(preferenceResult);
    setHistory(historyResult.data);
  }, []);

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/auth");
      return;
    }
    if (session) void load().catch(() => Alert.alert("โหลดข้อมูลไม่ได้", "กรุณาลองใหม่อีกครั้ง"));
  }, [load, loading, session]);

  async function savePreferences() {
    if (!preferences) return;
    setBusy(true);
    try {
      setPreferences(await goalApi.updateNotificationPreferences(preferences));
      Alert.alert("บันทึกแล้ว", "การแจ้งเตือนใหม่จะใช้ค่าล่าสุดของคุณ");
    } catch {
      Alert.alert("บันทึกไม่ได้", "กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  if (!session) return null;
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pb-12 pt-4">
        <Link className="font-label text-sm text-primary" href="/">
          ← GOAL
        </Link>
        <Text className="mt-6 font-label text-xs tracking-[2px] text-accent">GOAL FOR YOU</Text>
        <Text className="mt-1 font-headline-thai text-5xl text-foreground">
          Community &amp; alerts
        </Text>

        <View className="mt-6 rounded-[28px] border border-border bg-surface p-6">
          <Text className="font-headline-thai text-3xl text-foreground">รายการโปรด</Text>
          <Text className="mt-2 font-body-thai text-sm text-muted">
            ค้นหาทีม นักเตะ หรือลีก แล้วกดดาวจากหน้าโปรไฟล์
          </Text>
          <Link asChild href="/explore">
            <Pressable className="mt-4 items-center rounded-full bg-primary px-5 py-3">
              <Text className="font-label text-black">ไปที่ EXPLORE</Text>
            </Pressable>
          </Link>
          <View className="mt-4 flex-row flex-wrap gap-2">
            {favorites.length === 0 ? (
              <Text className="font-body-thai text-sm text-muted">ยังไม่มีรายการโปรด</Text>
            ) : (
              favorites.map((favorite) => (
                <View
                  className="flex-row items-center overflow-hidden rounded-full border border-border"
                  key={`${favorite.entityType}-${favorite.entityId}`}
                >
                  <Link
                    className="px-3 py-2 font-label text-sm text-foreground"
                    href={
                      favorite.entityType === "team"
                        ? { pathname: "/team/[teamId]", params: { teamId: favorite.entityId } }
                        : favorite.entityType === "player"
                          ? {
                              pathname: "/player/[playerId]",
                              params: { playerId: favorite.entityId },
                            }
                          : {
                              pathname: "/league/[leagueId]",
                              params: { leagueId: favorite.entityId },
                            }
                    }
                  >
                    {favorite.name}
                  </Link>
                  <Pressable
                    accessibilityLabel={`ลบ ${favorite.entityType} ${favorite.entityId} จากรายการโปรด`}
                    className="border-l border-border px-3 py-2"
                    onPress={() =>
                      void goalApi
                        .removeMyFavorite(favorite.entityType, favorite.entityId)
                        .then(load)
                    }
                  >
                    <Text className="font-label text-muted">×</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </View>

        <View className="mt-4 rounded-[28px] border border-border bg-surface p-6">
          <Text className="font-headline-thai text-3xl text-foreground">แมตช์ที่ Follow</Text>
          <View className="mt-4 gap-3">
            {follows.length === 0 ? (
              <Text className="font-body-thai text-sm text-muted">กด Follow ได้จากหน้า Match</Text>
            ) : (
              follows.map((follow) => (
                <View
                  className="flex-row items-center justify-between rounded-xl bg-background p-4"
                  key={follow.fixtureId}
                >
                  <Link className="min-w-0 flex-1 pr-3" href={`/match/${follow.fixtureId}`}>
                    <Text className="font-label text-xs text-accent">
                      {follow.fixture.league.name.toUpperCase()}
                    </Text>
                    <Text className="mt-1 font-body-thai text-foreground">
                      {follow.fixture.participants.map(({ team }) => team.name).join(" vs ")}
                    </Text>
                    <Text className="mt-1 font-headline text-lg text-primary">
                      {follow.fixture.homeScore ?? "–"} : {follow.fixture.awayScore ?? "–"}
                    </Text>
                  </Link>
                  <Pressable
                    onPress={() => void goalApi.unfollowMatch(follow.fixtureId).then(load)}
                  >
                    <Text className="font-label text-muted">UNFOLLOW</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </View>

        <View className="mt-4 rounded-[28px] border border-border bg-surface p-6">
          <Text className="font-headline-thai text-3xl text-foreground">Feed สำหรับคุณ</Text>
          <View className="mt-4 gap-3">
            {feed.length === 0 ? (
              <Text className="font-body-thai text-sm text-muted">
                เพิ่มรายการโปรดหรือ Follow แมตช์เพื่อสร้าง Feed
              </Text>
            ) : (
              feed.map(({ fixture, reasons }) => (
                <Link asChild href={`/match/${fixture.id}`} key={fixture.id}>
                  <Pressable className="rounded-2xl border border-border bg-background p-4">
                    <Text className="font-label text-xs text-accent">
                      {fixture.league.name.toUpperCase()}
                    </Text>
                    <Text className="mt-2 font-body-thai text-foreground">
                      {fixture.participants.map(({ team }) => team.name).join(" vs ")}
                    </Text>
                    <Text className="mt-2 font-label text-xs text-muted">
                      {reasons.join(" · ")}
                    </Text>
                  </Pressable>
                </Link>
              ))
            )}
          </View>
        </View>

        {preferences && (
          <View className="mt-4 rounded-[28px] border border-border bg-surface p-6">
            <Text className="font-headline-thai text-3xl text-foreground">การแจ้งเตือน</Text>
            <View className="mt-4 gap-3">
              {toggles.map(([key, label]) => (
                <View className="flex-row items-center justify-between gap-4" key={key}>
                  <Text className="flex-1 font-body-thai text-foreground">{label}</Text>
                  <Switch
                    onValueChange={(value) =>
                      setPreferences((current) =>
                        current ? { ...current, [key]: value } : current,
                      )
                    }
                    trackColor={{ false: "#343434", true: "#00A4AF" }}
                    value={Boolean(preferences[key])}
                  />
                </View>
              ))}
              <View className="flex-row items-center justify-between gap-4 border-t border-border pt-3">
                <View className="flex-1">
                  <Text className="font-body-thai text-foreground">Quiet hours</Text>
                  <Text className="font-label text-xs text-muted">
                    {preferences.quietHoursStart}–{preferences.quietHoursEnd} ·{" "}
                    {preferences.timezone}
                  </Text>
                </View>
                <Switch
                  onValueChange={(value) =>
                    setPreferences({ ...preferences, quietHoursEnabled: value })
                  }
                  value={preferences.quietHoursEnabled}
                />
              </View>
            </View>
            <Pressable
              className="mt-5 items-center rounded-full bg-accent px-5 py-3"
              disabled={busy}
              onPress={() => void savePreferences()}
            >
              <Text className="font-label text-black">SAVE PREFERENCES</Text>
            </Pressable>
          </View>
        )}

        <View className="mt-4 rounded-[28px] border border-border bg-surface p-6">
          <Text className="font-headline-thai text-3xl text-foreground">ประวัติการแจ้งเตือน</Text>
          <View className="mt-4 gap-4">
            {history.length === 0 ? (
              <Text className="font-body-thai text-sm text-muted">ยังไม่มีการแจ้งเตือน</Text>
            ) : (
              history.map((item) => (
                <View className="border-b border-border pb-3" key={item.id}>
                  <Text className="font-body-thai text-foreground">{item.title}</Text>
                  <Text className="mt-1 font-body-thai text-sm text-muted">{item.body}</Text>
                  <Text className="mt-1 font-label text-xs text-accent">
                    {item.category.toUpperCase()} · {item.status.toUpperCase()}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
