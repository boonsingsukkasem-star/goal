import type { FootballLeagueProfile } from "@goal-app/api-client";
import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FootballFixtureList } from "@/components/football-fixture-list";
import { FavoriteButton } from "@/components/favorite-button";
import { goalApi } from "@/lib/api";

export default function LeagueScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const [profile, setProfile] = useState<FootballLeagueProfile | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const id = Number(leagueId);
    if (!Number.isInteger(id) || id <= 0) {
      setError(true);
      return;
    }
    let active = true;
    void goalApi
      .getFootballLeague(id)
      .then((value) => active && setProfile(value))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [leagueId]);
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pb-10 pt-4">
        <Link href="/explore" className="font-label text-sm text-muted">
          ← EXPLORE
        </Link>
        {error ? (
          <Text className="mt-10 text-center font-headline-thai text-2xl text-foreground">
            ไม่พบข้อมูลลีก
          </Text>
        ) : !profile ? (
          <ActivityIndicator className="mt-16" color="#FFD700" />
        ) : (
          <>
            <View className="mt-7 rounded-[28px] border border-border bg-surface p-7">
              {profile.league.imageUrl ? (
                <Image
                  accessibilityLabel={`ตราสัญลักษณ์ ${profile.league.name}`}
                  className="mb-5 size-20"
                  resizeMode="contain"
                  source={{ uri: profile.league.imageUrl }}
                />
              ) : null}
              <Text className="font-label text-xs tracking-[2px] text-accent">LEAGUE PROFILE</Text>
              <Text className="mt-2 font-headline-thai text-4xl text-foreground">
                {profile.league.name}
              </Text>
              <Text className="mt-3 font-body-thai text-muted">
                {[profile.league.shortCode, profile.season?.name, profile.league.type]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <View className="mt-5">
                <FavoriteButton entityId={profile.league.id} entityType="league" />
              </View>
            </View>
            <View className="mt-5 rounded-[24px] border border-border bg-surface p-5">
              <Text className="font-headline-thai text-2xl text-foreground">ตารางคะแนน</Text>
              <View className="mt-4 gap-1">
                {profile.standings.length === 0 ? (
                  <Text className="font-body-thai text-sm text-muted">
                    {profile.standingsStatus?.state === "plan_limited"
                      ? "แพ็กเกจ API-Football ไม่เปิดให้เข้าถึงตารางคะแนนฤดูกาลนี้"
                      : profile.standingsStatus?.state === "error"
                        ? "ดึงตารางคะแนนไม่สำเร็จ ระบบจะลองใหม่ภายหลัง"
                        : "ยังไม่มีข้อมูลตารางคะแนนจากผู้ให้บริการ"}
                  </Text>
                ) : (
                  profile.standings.map((row) => (
                    <Link
                      asChild
                      href={{ pathname: "/team/[teamId]", params: { teamId: row.team.id } }}
                      key={`${row.groupName ?? ""}:${row.team.id}`}
                      className="rounded-xl border border-border bg-background px-4 py-3"
                    >
                      <Pressable className="flex-row items-center">
                        <Text className="w-8 font-label text-primary">{row.position}</Text>
                        <Text className="flex-1 font-body-thai text-foreground">
                          {row.team.name}
                          {row.groupName ? ` · ${row.groupName}` : ""}
                        </Text>
                        <Text className="font-headline text-lg text-foreground">{row.points}</Text>
                      </Pressable>
                    </Link>
                  ))
                )}
              </View>
            </View>
            <View className="mt-5 rounded-[24px] border border-border bg-surface p-5">
              <Text className="font-headline-thai text-2xl text-foreground">โปรแกรมล่าสุด</Text>
              <FootballFixtureList fixtures={profile.fixtures} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
