import type { FootballFixturePageDataItem } from "@goal-app/api-client";
import { getFixtureRange } from "@goal-app/config";
import { StatusBar } from "expo-status-bar";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { goalApi } from "@/lib/api";

type RangeMode = "results" | "today" | "upcoming";

export default function FixturesScreen() {
  const [mode, setMode] = useState<RangeMode>("today");
  const [fixtures, setFixtures] = useState<FootballFixturePageDataItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async (selectedMode: RangeMode, nextCursor?: string) => {
    setLoading(true);
    setError(false);
    if (!nextCursor) {
      setFixtures([]);
      setCursor(null);
    }
    try {
      const range = getFixtureRange(selectedMode);
      const result = await goalApi.listFootballFixtures({
        ...range,
        cursor: nextCursor,
        limit: 50,
        order: selectedMode === "results" ? "desc" : "asc",
      });
      setFixtures((current) => (nextCursor ? [...current, ...result.data] : result.data));
      setCursor(result.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(mode);
  }, [mode]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="light" />
      <ScrollView contentContainerClassName="px-5 pb-12 pt-4">
        <View className="flex-row items-center justify-between border-b border-border pb-4">
          <Link href="/" className="font-headline text-2xl text-foreground">
            GOAL
          </Link>
          <Text className="font-label text-xs tracking-[2px] text-accent">FIXTURES</Text>
        </View>
        <Text className="mt-8 font-label text-xs tracking-[3px] text-accent">MATCH CALENDAR</Text>
        <Text className="mt-2 font-headline text-5xl text-foreground">FIXTURES &amp; RESULTS</Text>
        <Text className="mt-3 font-body-thai leading-6 text-[#D9CFAC]">
          ผลย้อนหลัง ฟุตบอลวันนี้ และโปรแกรมล่วงหน้า
        </Text>
        <View className="mt-6 flex-row flex-wrap gap-2">
          {(
            [
              ["results", "RESULTS"],
              ["today", "TODAY"],
              ["upcoming", "UPCOMING"],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              className={
                mode === value
                  ? "rounded-full bg-primary px-4 py-2"
                  : "rounded-full border border-border bg-surface px-4 py-2"
              }
              disabled={loading}
              key={value}
              onPress={() => setMode(value)}
            >
              <Text className={mode === value ? "font-label text-black" : "font-label text-muted"}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {loading && fixtures.length === 0 ? (
          <ActivityIndicator className="mt-16" color="#FFD700" />
        ) : error && fixtures.length === 0 ? (
          <View className="mt-8 rounded-[24px] border border-primary/50 bg-surface p-6">
            <Text className="text-center font-headline-thai text-2xl text-foreground">
              โหลดโปรแกรมไม่ได้
            </Text>
            <Pressable
              className="mx-auto mt-4 rounded-full bg-primary px-5 py-3"
              onPress={() => void load(mode)}
            >
              <Text className="font-label text-black">ลองใหม่</Text>
            </Pressable>
          </View>
        ) : fixtures.length === 0 ? (
          <Text className="mt-8 rounded-2xl border border-border bg-surface p-6 text-center font-body-thai text-muted">
            ไม่มีการแข่งขันในช่วงนี้
          </Text>
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
                    <View className="mb-3 flex-row justify-between">
                      <Text className="font-label text-xs text-muted">{fixture.league.name}</Text>
                      <Text
                        className={
                          fixture.isLive
                            ? "font-label text-xs text-accent"
                            : "font-label text-xs text-muted"
                        }
                      >
                        {fixture.isLive
                          ? (fixture.state.name ?? "LIVE")
                          : new Date(fixture.startsAt).toLocaleString("th-TH", {
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              month: "short",
                            })}
                      </Text>
                    </View>
                    <View className="gap-2">
                      <View className="flex-row justify-between">
                        <Text className="font-body-thai text-foreground">
                          {home?.name ?? "Home"}
                        </Text>
                        <Text className="font-headline text-xl text-foreground">
                          {fixture.homeScore ?? "–"}
                        </Text>
                      </View>
                      <View className="flex-row justify-between">
                        <Text className="font-body-thai text-foreground">
                          {away?.name ?? "Away"}
                        </Text>
                        <Text className="font-headline text-xl text-foreground">
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
        {cursor && (
          <Pressable
            className="mt-7 items-center rounded-full border border-primary px-5 py-3"
            disabled={loading}
            onPress={() => void load(mode, cursor)}
          >
            <Text className="font-label text-primary">{loading ? "LOADING…" : "LOAD MORE"}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
