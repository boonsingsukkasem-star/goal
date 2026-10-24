import type { FootballFixturePageDataItem } from "@goal-app/api-client";
import { StatusBar } from "expo-status-bar";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { goalApi } from "@/lib/api";

export default function LiveScreen() {
  const [fixtures, setFixtures] = useState<FootballFixturePageDataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void goalApi
        .listFootballFixtures({ limit: 50, liveOnly: true, order: "asc" })
        .then((page) => {
          if (!active) return;
          setFixtures(page.data);
          setError(false);
        })
        .catch(() => active && setError(true))
        .finally(() => active && setLoading(false));
    };
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [retryKey]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="light" />
      <ScrollView contentContainerClassName="px-5 pb-10 pt-4">
        <View className="flex-row items-center justify-between border-b border-border pb-4">
          <Link href="/" className="font-headline text-2xl text-foreground">
            GOAL
          </Link>
          <View className="rounded-full bg-primary px-3 py-1.5">
            <Text className="font-label text-xs text-black">● LIVE</Text>
          </View>
        </View>
        <Text className="mt-8 font-label text-xs tracking-[3px] text-accent">MATCH CENTRE</Text>
        <Text className="mt-2 font-headline-thai text-5xl text-foreground">ฟุตบอลวันนี้</Text>
        <Text className="mt-2 font-body-thai text-[#D9CFAC]">ผลสด โปรแกรม และเหตุการณ์สำคัญ</Text>

        {error && fixtures.length > 0 && (
          <View className="mt-6 flex-row items-center justify-between rounded-2xl border border-primary/40 bg-surface px-4 py-3">
            <Text className="flex-1 font-body-thai text-sm text-foreground">
              ข้อมูลล่าสุดอาจล่าช้า กำลังเชื่อมต่อใหม่
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setRetryKey((value) => value + 1)}>
              <Text className="font-label text-sm text-primary">ลองใหม่</Text>
            </Pressable>
          </View>
        )}

        {loading ? (
          <ActivityIndicator className="mt-16" color="#FFD700" />
        ) : error && fixtures.length === 0 ? (
          <View className="mt-8 rounded-[28px] border border-primary/50 bg-surface p-7">
            <Text className="text-center font-headline-thai text-2xl text-foreground">
              โหลดข้อมูลการแข่งขันไม่ได้
            </Text>
            <Text className="mt-2 text-center font-body-thai text-sm leading-6 text-muted">
              กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง
            </Text>
            <Pressable
              accessibilityRole="button"
              className="mx-auto mt-5 rounded-full bg-primary px-6 py-3"
              onPress={() => {
                setLoading(true);
                setRetryKey((value) => value + 1);
              }}
            >
              <Text className="font-label text-sm text-black">ลองใหม่</Text>
            </Pressable>
          </View>
        ) : fixtures.length === 0 ? (
          <View className="mt-8 rounded-[28px] border border-border bg-surface p-7">
            <Text className="text-center font-headline-thai text-2xl text-foreground">
              ยังไม่มีการแข่งขันสด
            </Text>
            <Text className="mt-2 text-center font-body-thai text-sm leading-6 text-muted">
              หน้านี้จะแสดงเฉพาะแมตช์ที่กำลังแข่งขันและอัปเดตอัตโนมัติทุก 10 วินาที
            </Text>
          </View>
        ) : (
          <View className="mt-7 gap-3">
            {fixtures.map((fixture) => {
              const home = fixture.participants.find((item) => item.location === "home")?.team;
              const away = fixture.participants.find((item) => item.location === "away")?.team;
              return (
                <Link
                  asChild
                  href={{ pathname: "/match/[fixtureId]", params: { fixtureId: fixture.id } }}
                  key={fixture.id}
                >
                  <Pressable className="rounded-[24px] border border-border bg-surface p-5">
                    <View className="mb-4 flex-row items-center justify-between">
                      <Text className="font-label text-xs text-muted">{fixture.league.name}</Text>
                      <Text
                        className={
                          fixture.isLive
                            ? "font-label text-xs text-accent"
                            : "font-label text-xs text-muted"
                        }
                      >
                        {fixture.isLive
                          ? fixture.state.name || "LIVE"
                          : new Date(fixture.startsAt).toLocaleTimeString("th-TH", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                      </Text>
                    </View>
                    <View className="gap-3">
                      <View className="flex-row items-center justify-between">
                        <Text className="font-body-thai text-base text-foreground">
                          {home?.name ?? "Home"}
                        </Text>
                        <Text className="font-headline text-2xl text-foreground">
                          {fixture.homeScore ?? "–"}
                        </Text>
                      </View>
                      <View className="flex-row items-center justify-between">
                        <Text className="font-body-thai text-base text-foreground">
                          {away?.name ?? "Away"}
                        </Text>
                        <Text className="font-headline text-2xl text-foreground">
                          {fixture.awayScore ?? "–"}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                </Link>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
