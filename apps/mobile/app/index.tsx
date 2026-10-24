import type { FootballFixturePageDataItem, NewsArticlePageDataItem } from "@goal-app/api-client";
import { getFixtureRange } from "@goal-app/config";
import { Link } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LegalLinks } from "@/components/legal-links";
import { goalApi } from "@/lib/api";

function fixtureTeams(fixture: FootballFixturePageDataItem) {
  return {
    away: fixture.participants.find((item) => item.location === "away")?.team.name ?? "Away",
    home: fixture.participants.find((item) => item.location === "home")?.team.name ?? "Home",
  };
}

export default function HomeScreen() {
  const [fixtures, setFixtures] = useState<FootballFixturePageDataItem[]>([]);
  const [news, setNews] = useState<NewsArticlePageDataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const range = getFixtureRange("today");
    const [fixtureResult, newsResult] = await Promise.allSettled([
      goalApi.listFootballFixtures({ ...range, limit: 50, order: "asc" }),
      goalApi.listTrendingFootballNews({ language: "th", limit: 3 }),
    ]);
    setFixtures(fixtureResult.status === "fulfilled" ? fixtureResult.value.data : []);
    setNews(newsResult.status === "fulfilled" ? newsResult.value.data : []);
    setError(fixtureResult.status === "rejected" && newsResult.status === "rejected");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const live = useMemo(() => fixtures.filter((fixture) => fixture.isLive), [fixtures]);
  const schedule = live.length > 0 ? live : fixtures.slice(0, 5);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="light" />
      <ScrollView contentContainerClassName="px-5 pb-12 pt-4">
        <View className="flex-row items-center justify-between border-b border-border pb-4">
          <Text className="font-headline text-3xl text-foreground">GOAL</Text>
          <Link className="font-label text-xs text-primary" href="/account">
            ACCOUNT
          </Link>
        </View>

        <Text className="mt-8 font-label text-xs tracking-[3px] text-accent">
          FOOTBALL INTELLIGENCE, LIVE
        </Text>
        <Text className="mt-2 font-headline-thai text-5xl leading-[60px] text-foreground">
          ฟุตบอลวันนี้{"\n"}
          <Text className="text-primary">พร้อมบริบทจาก AI</Text>
        </Text>
        <Text className="mt-3 font-body-thai leading-7 text-muted">
          ผลสด โปรแกรม ข่าว และการวิเคราะห์ที่ดึงจาก GOAL API โดยตรง
        </Text>

        <View className="mt-6 flex-row flex-wrap gap-2">
          {[
            ["/live", "LIVE"],
            ["/fixtures", "FIXTURES"],
            ["/news", "NEWS"],
            ["/compare", "COMPARE"],
            ["/explore", "EXPLORE"],
          ].map(([href, label]) => (
            <Link asChild href={href as "/live"} key={href}>
              <Pressable className="border border-border bg-surface px-4 py-2">
                <Text className="font-label text-xs text-foreground">{label}</Text>
              </Pressable>
            </Link>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator className="mt-16" color="#FFD700" />
        ) : error ? (
          <View className="mt-8 border border-primary/50 bg-surface p-6">
            <Text className="text-center font-headline-thai text-2xl text-foreground">
              โหลดข้อมูลฟุตบอลไม่ได้
            </Text>
            <Pressable className="mx-auto mt-4 bg-primary px-6 py-3" onPress={() => void load()}>
              <Text className="font-label text-black">ลองใหม่</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View className="mt-10 flex-row items-center justify-between border-b border-border pb-3">
              <Text className="font-headline text-3xl text-foreground">
                {live.length > 0 ? "LIVE NOW" : "TODAY"}
              </Text>
              <Link className="font-label text-xs text-primary" href="/fixtures">
                VIEW ALL
              </Link>
            </View>
            <View className="mt-4 gap-3">
              {schedule.length === 0 ? (
                <Text className="border border-border bg-surface p-5 text-center font-body-thai text-muted">
                  ยังไม่มีการแข่งขันวันนี้
                </Text>
              ) : (
                schedule.map((fixture) => {
                  const { away, home } = fixtureTeams(fixture);
                  return (
                    <Link asChild href={`/match/${fixture.id}`} key={fixture.id}>
                      <Pressable className="border border-border bg-surface p-5">
                        <View className="flex-row items-center justify-between gap-3">
                          <Text className="font-label text-xs text-muted">
                            {fixture.league.name}
                          </Text>
                          <Text
                            className={
                              fixture.isLive
                                ? "font-label text-xs text-primary"
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
                        <View className="mt-3 flex-row items-center gap-3">
                          <Text className="flex-1 text-right font-body-thai text-foreground">
                            {home}
                          </Text>
                          <Text className="font-headline text-2xl text-primary">
                            {fixture.homeScore ?? "–"} : {fixture.awayScore ?? "–"}
                          </Text>
                          <Text className="flex-1 font-body-thai text-foreground">{away}</Text>
                        </View>
                      </Pressable>
                    </Link>
                  );
                })
              )}
            </View>

            <View className="mt-10 flex-row items-center justify-between border-b border-border pb-3">
              <Text className="font-headline text-3xl text-foreground">TRENDING NEWS</Text>
              <Link className="font-label text-xs text-primary" href="/news">
                VIEW ALL
              </Link>
            </View>
            <View className="mt-4 gap-3">
              {news.length === 0 ? (
                <Text className="border border-border bg-surface p-5 text-center font-body-thai text-muted">
                  ยังไม่มีข่าวล่าสุด
                </Text>
              ) : (
                news.map((article) => (
                  <Link
                    className="border border-border bg-surface p-5"
                    href="/news"
                    key={article.id}
                  >
                    <Text className="font-label text-xs text-accent">
                      {article.category.toUpperCase()}
                    </Text>
                    <Text className="mt-2 font-headline-thai text-2xl leading-8 text-foreground">
                      {article.headline}
                    </Text>
                    <Text
                      className="mt-2 font-body-thai text-sm leading-6 text-muted"
                      numberOfLines={2}
                    >
                      {article.summary}
                    </Text>
                  </Link>
                ))
              )}
            </View>
          </>
        )}

        <LegalLinks />
      </ScrollView>
    </SafeAreaView>
  );
}
