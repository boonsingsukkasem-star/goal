import {
  ApiRequestError,
  type AiComparisonResponse,
  type FootballCatalogResponseDataItem,
} from "@goal-app/api-client";
import { Link } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { goalApi } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

type ComparableItem = Extract<FootballCatalogResponseDataItem, { entityType: "player" | "team" }>;

function itemName(item: ComparableItem): string {
  return item.entityType === "player" ? item.displayName : item.name;
}

function EntitySearch({
  entityType,
  excludedId,
  label,
  onSelect,
  selected,
}: {
  entityType: "player" | "team";
  excludedId: number | null;
  label: string;
  onSelect: (item: ComparableItem) => void;
  selected: ComparableItem | null;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ComparableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length === 1) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void goalApi
        .exploreFootballCatalog({ limit: 10, q: normalized || undefined, types: entityType })
        .then((result) => {
          if (!active) return;
          setItems(
            result.data.filter(
              (candidate): candidate is ComparableItem =>
                candidate.entityType === entityType && candidate.id !== excludedId,
            ),
          );
          setError(false);
        })
        .catch(() => active && setError(true))
        .finally(() => active && setLoading(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [entityType, excludedId, query]);

  return (
    <View>
      <Text className="mb-2 font-label text-xs text-primary">{label}</Text>
      <TextInput
        accessibilityLabel={`ค้นหา${entityType === "team" ? "ทีม" : "นักเตะ"}${label}`}
        autoCapitalize="none"
        className="border border-border bg-background px-4 py-4 font-body-thai text-foreground"
        maxLength={80}
        onChangeText={setQuery}
        placeholder={`ค้นหา${entityType === "team" ? "ทีม" : "นักเตะ"}...`}
        placeholderTextColor="#8B877A"
        value={query}
      />
      {loading ? <ActivityIndicator className="mt-3" color="#FFD700" /> : null}
      {query.trim().length === 1 ? (
        <Text className="mt-2 font-body-thai text-xs text-muted">พิมพ์อย่างน้อย 2 ตัวอักษร</Text>
      ) : error ? (
        <Text className="mt-2 font-body-thai text-xs text-[#FF5D73]">ค้นหาไม่สำเร็จ</Text>
      ) : (
        <View className="border-x border-b border-border">
          {items.slice(0, 5).map((item) => (
            <Pressable
              className="flex-row items-center gap-3 border-t border-border bg-surface p-3"
              key={`${item.entityType}-${item.id}`}
              onPress={() => {
                onSelect(item);
                setQuery(itemName(item));
                setItems([]);
              }}
            >
              {item.imageUrl ? (
                <Image className="h-9 w-9" resizeMode="contain" source={{ uri: item.imageUrl }} />
              ) : (
                <View className="h-9 w-9 items-center justify-center bg-background">
                  <Text className="font-label text-primary">{itemName(item).slice(0, 2)}</Text>
                </View>
              )}
              <Text className="flex-1 font-body-thai text-foreground">{itemName(item)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {selected ? (
        <Text className="mt-2 font-body-thai text-xs text-muted">
          เลือกแล้ว: {itemName(selected)} · ID {selected.id}
        </Text>
      ) : null}
    </View>
  );
}

export default function CompareScreen() {
  const { session } = useAuth();
  const [entityType, setEntityType] = useState<"team" | "player">("team");
  const [left, setLeft] = useState<ComparableItem | null>(null);
  const [right, setRight] = useState<ComparableItem | null>(null);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<AiComparisonResponse | null>(null);
  const [status, setStatus] = useState<AiComparisonResponse["status"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingDeadline = useRef<number | null>(null);

  useEffect(() => {
    if (!comparisonId || (status !== "queued" && status !== "running")) {
      pollingDeadline.current = null;
      return;
    }
    pollingDeadline.current ??= Date.now() + 3 * 60_000;
    let active = true;
    const interval = setInterval(() => {
      if (pollingDeadline.current && Date.now() >= pollingDeadline.current) {
        clearInterval(interval);
        if (active) setError("การเปรียบเทียบใช้เวลานานกว่าปกติ กรุณาตรวจสอบใหม่");
        return;
      }
      void goalApi
        .getAiComparison(comparisonId)
        .then((value) => {
          if (active) {
            setComparison(value);
            setStatus(value.status);
          }
        })
        .catch(() => active && setError("อัปเดตผลเปรียบเทียบไม่ได้ชั่วคราว"));
    }, 5_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [comparisonId, status]);

  const submit = async () => {
    setError(null);
    if (!left || !right) {
      setError("กรุณาเลือกข้อมูลทั้งสองฝั่งจากผลการค้นหา");
      return;
    }
    if (left.id === right.id) {
      setError("ต้องเลือกสองฝั่งที่ต่างกัน");
      return;
    }
    try {
      pollingDeadline.current = Date.now() + 3 * 60_000;
      const queued = await goalApi.requestAiComparison({
        entityType,
        language: "th",
        leftId: left.id,
        rightId: right.id,
      });
      setComparison(null);
      setComparisonId(queued.comparisonId);
      setStatus(queued.status);
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError && requestError.status === 429
          ? "ใช้สิทธิ์ AI ครบสำหรับวันนี้แล้ว"
          : "ส่งคำขอเปรียบเทียบไม่ได้ กรุณาลองใหม่",
      );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pb-12 pt-4">
        <View className="flex-row items-center justify-between border-b border-border pb-4">
          <View>
            <Text className="font-label text-xs tracking-[2px] text-accent">GOAL INTELLIGENCE</Text>
            <Text className="font-headline text-4xl text-foreground">AI Compare</Text>
          </View>
          <Link href="/">
            <Text className="font-label text-primary">HOME</Text>
          </Link>
        </View>

        <Text className="mt-7 font-body-thai text-sm leading-6 text-muted">
          เปรียบเทียบทีมกับทีมหรือนักเตะกับนักเตะจากข้อมูลการแข่งขันล่าสุด
        </Text>
        {session ? (
          <View className="mt-5 gap-4 rounded-[28px] border border-accent/40 bg-surface p-5">
            <View className="flex-row gap-2">
              {(["team", "player"] as const).map((type) => (
                <Pressable
                  className={
                    entityType === type
                      ? "flex-1 rounded-full bg-accent px-4 py-3"
                      : "flex-1 rounded-full border border-border px-4 py-3"
                  }
                  key={type}
                  onPress={() => {
                    setEntityType(type);
                    setLeft(null);
                    setRight(null);
                  }}
                >
                  <Text
                    className={
                      entityType === type
                        ? "text-center font-label text-black"
                        : "text-center font-label text-muted"
                    }
                  >
                    {type === "team" ? "TEAM" : "PLAYER"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <EntitySearch
              entityType={entityType}
              excludedId={right?.id ?? null}
              label="PLAYER / TEAM A"
              onSelect={setLeft}
              selected={left}
            />
            <EntitySearch
              entityType={entityType}
              excludedId={left?.id ?? null}
              label="PLAYER / TEAM B"
              onSelect={setRight}
              selected={right}
            />
            <Pressable
              className="items-center rounded-full bg-accent px-5 py-4 disabled:opacity-50"
              disabled={status === "queued" || status === "running"}
              onPress={submit}
            >
              <Text className="font-label text-black">
                {status === "queued" || status === "running" ? "AI กำลังเปรียบเทียบ…" : "COMPARE"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Link asChild href="/auth">
            <Pressable className="mt-6 items-center rounded-full bg-accent px-5 py-4">
              <Text className="font-label text-black">เข้าสู่ระบบเพื่อใช้ AI Compare</Text>
            </Pressable>
          </Link>
        )}

        {error && <Text className="mt-4 font-body-thai text-sm text-[#FF5D73]">{error}</Text>}
        {comparison?.result && (
          <View className="mt-6 gap-4">
            <View className="rounded-2xl bg-surface p-5">
              <Text className="font-label text-xs text-accent">
                CONFIDENCE {Math.round(comparison.result.confidence * 100)}%
              </Text>
              <Text className="mt-2 font-headline-thai text-3xl text-foreground">
                {comparison.result.headline}
              </Text>
              <Text className="mt-3 font-body-thai text-sm leading-6 text-[#D9CFAC]">
                {comparison.result.verdict}
              </Text>
            </View>
            {comparison.result.dimensions.map((dimension) => (
              <View className="rounded-2xl border border-border p-5" key={dimension.name}>
                <Text className="font-label text-primary">{dimension.name}</Text>
                <Text className="mt-2 font-body-thai text-sm text-foreground">
                  LEFT: {dimension.left}
                </Text>
                <Text className="mt-1 font-body-thai text-sm text-foreground">
                  RIGHT: {dimension.right}
                </Text>
                <Text className="mt-3 font-body-thai text-xs leading-5 text-muted">
                  {dimension.explanation}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
