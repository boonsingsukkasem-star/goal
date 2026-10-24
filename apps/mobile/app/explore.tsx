import type { FootballCatalogResponseDataItem } from "@goal-app/api-client";
import { StatusBar } from "expo-status-bar";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { goalApi } from "@/lib/api";

const filters = [
  ["ทั้งหมด", "league,team,player"],
  ["ลีก", "league"],
  ["ทีม", "team"],
  ["นักเตะ", "player"],
] as const;

function itemName(item: FootballCatalogResponseDataItem): string {
  return item.entityType === "player" ? item.displayName : item.name;
}

export default function ExploreScreen() {
  const [items, setItems] = useState<FootballCatalogResponseDataItem[]>([]);
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState("league,team,player");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length === 1) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void goalApi
        .exploreFootballCatalog({ limit: 30, q: normalized || undefined, types })
        .then((result) => {
          if (!active) return;
          setItems(result.data);
          setError(false);
        })
        .catch(() => active && setError(true))
        .finally(() => active && setLoading(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, types]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="light" />
      <ScrollView contentContainerClassName="px-5 pb-10 pt-4" keyboardShouldPersistTaps="handled">
        <View className="flex-row items-center justify-between border-b border-border pb-4">
          <Link href="/" className="font-headline text-2xl text-foreground">
            GOAL
          </Link>
          <Text className="font-label text-xs tracking-[2px] text-accent">EXPLORE</Text>
        </View>
        <Text className="mt-8 font-label text-xs tracking-[3px] text-accent">
          FOOTBALL DISCOVERY
        </Text>
        <Text className="mt-2 font-headline text-5xl text-foreground">EXPLORE</Text>
        <Text className="mt-3 font-body-thai leading-6 text-[#D9CFAC]">
          ค้นหาลีก สโมสร และนักเตะจากข้อมูล API-Football ที่ตรวจสอบแล้ว
        </Text>
        <TextInput
          accessibilityLabel="ค้นหาลีก ทีม หรือนักเตะ"
          autoCapitalize="none"
          className="mt-6 rounded-2xl border border-border bg-surface px-5 py-4 font-body-thai text-base text-foreground"
          maxLength={80}
          onChangeText={setQuery}
          placeholder="เช่น Premier League, Liverpool"
          placeholderTextColor="#8A8474"
          returnKeyType="search"
          value={query}
        />
        <View className="mt-3 flex-row flex-wrap gap-2">
          {filters.map(([label, value]) => (
            <Pressable
              accessibilityRole="button"
              className={
                types === value
                  ? "rounded-full bg-primary px-4 py-2"
                  : "rounded-full border border-border bg-surface px-4 py-2"
              }
              key={value}
              onPress={() => setTypes(value)}
            >
              <Text
                className={
                  types === value
                    ? "font-label text-sm text-black"
                    : "font-label text-sm text-muted"
                }
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {query.trim().length === 1 ? (
          <Text className="mt-7 rounded-2xl border border-border bg-surface p-5 font-body-thai text-muted">
            พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา
          </Text>
        ) : loading ? (
          <ActivityIndicator className="mt-14" color="#FFD700" />
        ) : error ? (
          <View className="mt-7 rounded-[24px] border border-primary/50 bg-surface p-6">
            <Text className="text-center font-headline-thai text-2xl text-foreground">
              ค้นหาข้อมูลไม่ได้
            </Text>
            <Text className="mt-2 text-center font-body-thai text-sm text-muted">
              กรุณาลองใหม่อีกครั้ง
            </Text>
          </View>
        ) : items.length === 0 ? (
          <Text className="mt-7 rounded-2xl border border-border bg-surface p-5 font-body-thai text-muted">
            ไม่พบข้อมูลที่ตรงกับคำค้นหา
          </Text>
        ) : (
          <View className="mt-7 gap-3">
            {items.map((item) => {
              const name = itemName(item);
              const href =
                item.entityType === "league"
                  ? { pathname: "/league/[leagueId]" as const, params: { leagueId: item.id } }
                  : item.entityType === "team"
                    ? { pathname: "/team/[teamId]" as const, params: { teamId: item.id } }
                    : { pathname: "/player/[playerId]" as const, params: { playerId: item.id } };
              return (
                <Link asChild href={href} key={`${item.entityType}-${item.id}`}>
                  <Pressable className="flex-row items-center gap-4 rounded-[24px] border border-border bg-surface p-5">
                    <View className="h-12 w-12 items-center justify-center rounded-full bg-background">
                      <Text className="font-headline text-xl text-primary">
                        {name.slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text
                        className="font-headline-thai text-xl text-foreground"
                        numberOfLines={1}
                      >
                        {name}
                      </Text>
                      <Text className="mt-1 font-label text-xs uppercase text-muted">
                        {item.entityType}
                      </Text>
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
