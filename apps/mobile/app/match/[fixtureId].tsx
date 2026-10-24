import { ApiRequestError, type FootballFixtureDetail } from "@goal-app/api-client";
import { StatusBar } from "expo-status-bar";
import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { goalApi } from "@/lib/api";
import { AiMatchPanel } from "./ai-match-panel";
import { MatchCommunityPanel } from "./match-community-panel";
import { MatchData } from "./match-data";
import { RelatedNews } from "./related-news";

export default function MatchScreen() {
  const { fixtureId } = useLocalSearchParams<{ fixtureId: string }>();
  const [fixture, setFixture] = useState<FootballFixtureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"not_found" | "unavailable" | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const id = Number(fixtureId);
    if (!Number.isInteger(id) || id <= 0) {
      setError("not_found");
      setLoading(false);
      return;
    }
    let active = true;
    const refresh = () => {
      void goalApi
        .getFootballFixture(id)
        .then((value) => {
          if (!active) return;
          setFixture(value);
          setError(null);
        })
        .catch((requestError: unknown) => {
          if (!active) return;
          setError(
            requestError instanceof ApiRequestError && requestError.status === 404
              ? "not_found"
              : "unavailable",
          );
        })
        .finally(() => active && setLoading(false));
    };
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [fixtureId, retryKey]);

  const home = fixture?.participants.find((item) => item.location === "home")?.team;
  const away = fixture?.participants.find((item) => item.location === "away")?.team;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="light" />
      <ScrollView contentContainerClassName="px-5 pb-10 pt-4">
        <Link href="/live" className="font-label text-sm text-muted">
          ← กลับไปหน้าผลสด
        </Link>
        {loading ? (
          <ActivityIndicator className="mt-20" color="#FFD700" />
        ) : error === "unavailable" && !fixture ? (
          <View className="mt-10 rounded-[28px] border border-primary/50 bg-surface p-7">
            <Text className="text-center font-headline-thai text-2xl text-foreground">
              โหลดรายละเอียดการแข่งขันไม่ได้
            </Text>
            <Text className="mt-2 text-center font-body-thai text-sm text-muted">
              ข้อมูลอาจขัดข้องชั่วคราว กรุณาลองอีกครั้ง
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
        ) : !fixture ? (
          <Text className="mt-16 text-center font-headline-thai text-2xl text-foreground">
            ไม่พบการแข่งขัน
          </Text>
        ) : (
          <>
            <View className="mt-6 rounded-[28px] border border-border bg-surface p-6">
              <Link
                className="text-center font-label text-xs tracking-[2px] text-muted"
                href={{ pathname: "/league/[leagueId]", params: { leagueId: fixture.league.id } }}
              >
                {fixture.league.name.toUpperCase()}
              </Link>
              <View className="mt-8 flex-row items-center justify-between gap-2">
                {home ? (
                  <Link
                    className="flex-1 text-center font-headline-thai text-xl text-foreground"
                    href={{ pathname: "/team/[teamId]", params: { teamId: home.id } }}
                  >
                    {home.name}
                  </Link>
                ) : (
                  <Text className="flex-1 text-center font-headline-thai text-xl text-foreground">
                    Home
                  </Text>
                )}
                <View className="rounded-2xl bg-background px-4 py-3">
                  <Text className="font-headline text-4xl text-primary">
                    {fixture.homeScore ?? "–"} : {fixture.awayScore ?? "–"}
                  </Text>
                </View>
                {away ? (
                  <Link
                    className="flex-1 text-center font-headline-thai text-xl text-foreground"
                    href={{ pathname: "/team/[teamId]", params: { teamId: away.id } }}
                  >
                    {away.name}
                  </Link>
                ) : (
                  <Text className="flex-1 text-center font-headline-thai text-xl text-foreground">
                    Away
                  </Text>
                )}
              </View>
              <Text className="mt-6 text-center font-label text-sm text-muted">
                {fixture.state.name ?? fixture.resultInfo ?? "Scheduled"}
              </Text>
            </View>
            <MatchData fixture={fixture} />
            <MatchCommunityPanel
              fixtureId={fixture.id}
              teams={fixture.participants.map(({ team }) => ({ id: team.id, name: team.name }))}
            />
            <AiMatchPanel fixtureId={fixture.id} />
            <RelatedNews fixtureId={fixture.id} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
