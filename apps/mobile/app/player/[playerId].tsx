import type { FootballPlayerProfile } from "@goal-app/api-client";
import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { goalApi } from "@/lib/api";
import { FavoriteButton } from "@/components/favorite-button";

export default function PlayerScreen() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const [profile, setProfile] = useState<FootballPlayerProfile | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const id = Number(playerId);
    if (!Number.isInteger(id) || id <= 0) {
      setError(true);
      return;
    }
    let active = true;
    void goalApi
      .getFootballPlayer(id)
      .then((value) => active && setProfile(value))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [playerId]);
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pb-10 pt-4">
        <Link href="/explore" className="font-label text-sm text-muted">
          ← EXPLORE
        </Link>
        {error ? (
          <Text className="mt-10 text-center font-headline-thai text-2xl text-foreground">
            ไม่พบข้อมูลนักเตะ
          </Text>
        ) : !profile ? (
          <ActivityIndicator className="mt-16" color="#FFD700" />
        ) : (
          <>
            <View className="mt-7 rounded-[28px] border border-border bg-surface p-7">
              {profile.player.imageUrl ? (
                <Image
                  accessibilityLabel={`รูป ${profile.player.displayName}`}
                  className="mb-5 size-24 rounded-2xl"
                  resizeMode="cover"
                  source={{ uri: profile.player.imageUrl }}
                />
              ) : null}
              <Text className="font-label text-xs tracking-[2px] text-accent">PLAYER PROFILE</Text>
              <Text className="mt-2 font-headline-thai text-4xl text-foreground">
                {profile.player.displayName}
              </Text>
              <Text className="mt-3 font-body-thai text-muted">
                {profile.player.dateOfBirth
                  ? `เกิด ${new Date(profile.player.dateOfBirth).toLocaleDateString("th-TH")}`
                  : "Football player"}
              </Text>
              <View className="mt-5">
                <FavoriteButton entityId={profile.player.id} entityType="player" />
              </View>
            </View>
            <View className="mt-5 rounded-[24px] border border-border bg-surface p-5">
              <Text className="font-headline-thai text-2xl text-foreground">การแข่งขันล่าสุด</Text>
              <View className="mt-4 gap-3">
                {profile.recentFixtures.length === 0 ? (
                  <Text className="font-body-thai text-sm text-muted">
                    ยังไม่มีข้อมูลการแข่งขันล่าสุด
                  </Text>
                ) : (
                  profile.recentFixtures.map((fixture) => (
                    <Link
                      asChild
                      href={{
                        pathname: "/match/[fixtureId]",
                        params: { fixtureId: fixture.fixtureId },
                      }}
                      key={fixture.fixtureId}
                    >
                      <Pressable className="rounded-2xl border border-border bg-background p-4">
                        <Text className="font-body-thai text-foreground">
                          {fixture.fixtureName}
                        </Text>
                        <Text className="mt-1 font-label text-xs text-muted">
                          {new Date(fixture.startsAt).toLocaleString("th-TH")}
                        </Text>
                      </Pressable>
                    </Link>
                  ))
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
