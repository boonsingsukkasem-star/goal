import type { FootballTeamProfile } from "@goal-app/api-client";
import { useLocalSearchParams, Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FootballFixtureList } from "@/components/football-fixture-list";
import { FavoriteButton } from "@/components/favorite-button";
import { goalApi } from "@/lib/api";

export default function TeamScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const [profile, setProfile] = useState<FootballTeamProfile | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const id = Number(teamId);
    if (!Number.isInteger(id) || id <= 0) {
      setError(true);
      return;
    }
    let active = true;
    void goalApi
      .getFootballTeam(id)
      .then((value) => active && setProfile(value))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [teamId]);
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pb-10 pt-4">
        <Link href="/explore" className="font-label text-sm text-muted">
          ← EXPLORE
        </Link>
        {error ? (
          <Text className="mt-10 text-center font-headline-thai text-2xl text-foreground">
            ไม่พบข้อมูลทีม
          </Text>
        ) : !profile ? (
          <ActivityIndicator className="mt-16" color="#FFD700" />
        ) : (
          <>
            <View className="mt-7 rounded-[28px] border border-border bg-surface p-7">
              {profile.team.imageUrl ? (
                <Image
                  accessibilityLabel={`ตราสัญลักษณ์ ${profile.team.name}`}
                  className="mb-5 size-20"
                  resizeMode="contain"
                  source={{ uri: profile.team.imageUrl }}
                />
              ) : null}
              <Text className="font-label text-xs tracking-[2px] text-accent">TEAM PROFILE</Text>
              <Text className="mt-2 font-headline-thai text-4xl text-foreground">
                {profile.team.name}
              </Text>
              <Text className="mt-3 font-body-thai text-muted">
                {[
                  profile.team.shortCode,
                  profile.team.founded ? `ก่อตั้ง ${profile.team.founded}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Football club"}
              </Text>
              <View className="mt-5">
                <FavoriteButton entityId={profile.team.id} entityType="team" />
              </View>
            </View>
            <View className="mt-5 rounded-[24px] border border-border bg-surface p-5">
              <Text className="font-headline-thai text-2xl text-foreground">
                โปรแกรมและผลการแข่งขัน
              </Text>
              <FootballFixtureList fixtures={profile.fixtures} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
