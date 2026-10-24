import type { PersonalizedNewsResponse } from "@goal-app/api-client";
import { Link } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { goalApi } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { MobileNewsCard } from "@/lib/news-card";

import type { NewsArticle } from "@goal-app/contracts";

type Mode = "latest" | "trending" | "personalized";

export default function NewsScreen() {
  const { session } = useAuth();
  const [mode, setMode] = useState<Mode>("latest");
  const [latest, setLatest] = useState<NewsArticle[]>([]);
  const [trending, setTrending] = useState<NewsArticle[]>([]);
  const [personalized, setPersonalized] = useState<PersonalizedNewsResponse["data"]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [latestResult, trendingResult, personalizedResult] = await Promise.all([
        goalApi.listFootballNews({ language: "th", limit: 20 }),
        goalApi.listTrendingFootballNews({ language: "th", limit: 10 }),
        session
          ? goalApi.listMyFootballNews({ language: "th", limit: 20 })
          : Promise.resolve({ data: [], generatedAt: new Date().toISOString() }),
      ]);
      setLatest(latestResult.data);
      setNextCursor(latestResult.nextCursor ?? null);
      setTrending(trendingResult.data);
      setPersonalized(personalizedResult.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => void load(), [load]);

  const items =
    mode === "latest"
      ? latest.map((article) => ({ article, reasons: [] as string[] }))
      : mode === "trending"
        ? trending.map((article) => ({ article, reasons: ["กำลังเป็นที่สนใจ"] }))
        : personalized;

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await goalApi.listFootballNews({
        cursor: nextCursor,
        language: "th",
        limit: 20,
      });
      setLatest((current) => [...current, ...page.data]);
      setNextCursor(page.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pb-12 pt-4">
        <Link className="font-label text-sm text-primary" href="/">
          ← GOAL
        </Link>
        <Text className="mt-7 font-label text-xs tracking-[2px] text-accent">AI-CURATED NEWS</Text>
        <Text className="mt-2 font-headline-thai text-5xl leading-[60px] text-foreground">
          ข่าวที่สำคัญ{"\n"}
          <Text className="text-primary">สำหรับคุณ</Text>
        </Text>
        <Text className="mt-3 font-body-thai leading-7 text-[#D9CFAC]">
          สรุปจากหลายแหล่ง พร้อมลิงก์ต้นฉบับที่ตรวจสอบได้
        </Text>

        <View className="mt-6 flex-row flex-wrap gap-2">
          {(
            [
              ["latest", "ล่าสุด"],
              ["trending", "มาแรง"],
              ["personalized", "สำหรับคุณ"],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === value }}
              className={
                mode === value
                  ? "rounded-full bg-primary px-5 py-2"
                  : "rounded-full border border-border bg-surface px-5 py-2"
              }
              key={value}
              onPress={() => setMode(value)}
            >
              <Text className={mode === value ? "font-label text-black" : "font-label text-muted"}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator className="mt-16" color="#FFD700" />
        ) : error ? (
          <View className="mt-8 rounded-[28px] border border-primary/30 bg-surface p-7">
            <Text className="text-center font-body-thai text-foreground">
              โหลดข่าวไม่ได้ชั่วคราว
            </Text>
            <Pressable
              className="mx-auto mt-4 rounded-full bg-primary px-5 py-3"
              onPress={() => void load()}
            >
              <Text className="font-label text-black">ลองใหม่</Text>
            </Pressable>
          </View>
        ) : mode === "personalized" && !session ? (
          <View className="mt-6 rounded-[28px] border border-accent/30 bg-surface p-7">
            <Text className="font-headline-thai text-3xl text-foreground">
              ข่าวที่ตรงกับทีมของคุณ
            </Text>
            <Text className="mt-2 font-body-thai leading-6 text-muted">
              เข้าสู่ระบบและเพิ่มรายการโปรดเพื่อจัดอันดับข่าวให้คุณ
            </Text>
            <Link asChild href="/auth">
              <Pressable className="mt-4 items-center rounded-full bg-accent px-5 py-3">
                <Text className="font-label text-black">เข้าสู่ระบบ</Text>
              </Pressable>
            </Link>
          </View>
        ) : items.length === 0 ? (
          <Text className="mt-10 rounded-[28px] border border-border bg-surface p-7 text-center font-body-thai text-muted">
            ยังไม่มีข่าวในหมวดนี้
          </Text>
        ) : (
          <View className="mt-6 gap-4">
            {items.map(({ article, reasons }) => (
              <MobileNewsCard
                article={article}
                key={article.id}
                reasons={reasons}
                signedIn={Boolean(session)}
              />
            ))}
          </View>
        )}

        {mode === "latest" && nextCursor && !loading && (
          <Pressable
            className="mx-auto mt-7 rounded-full border border-primary px-6 py-3"
            disabled={loadingMore}
            onPress={() => void loadMore()}
          >
            <Text className="font-label text-primary">
              {loadingMore ? "กำลังโหลด…" : "โหลดเพิ่มเติม"}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
