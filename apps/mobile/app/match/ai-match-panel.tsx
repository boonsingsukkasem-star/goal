import { ApiRequestError, type AiMatchAnalysisResponse } from "@goal-app/api-client";
import { Link } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { goalApi } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

const emptyResult = (fixtureId: number): AiMatchAnalysisResponse => ({
  analysis: null,
  fixtureId,
  status: null,
  updatedAt: null,
});

export function AiMatchPanel({ fixtureId }: { fixtureId: number }) {
  const { session } = useAuth();
  const [result, setResult] = useState<AiMatchAnalysisResponse>(() => emptyResult(fixtureId));
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingDeadline = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void goalApi
        .getAiMatchAnalysis(fixtureId, { language: "th" })
        .then((value) => active && setResult(value))
        .catch(() => active && setError("โหลดบทวิเคราะห์ไม่ได้ชั่วคราว"));
    };
    refresh();
    if (result.status === "queued" || result.status === "running") {
      pollingDeadline.current ??= Date.now() + 3 * 60_000;
    } else {
      pollingDeadline.current = null;
    }
    const interval = setInterval(() => {
      if (result.status === "queued" || result.status === "running") {
        if (pollingDeadline.current && Date.now() >= pollingDeadline.current) {
          clearInterval(interval);
          if (active) setError("การวิเคราะห์ใช้เวลานานกว่าปกติ กรุณาตรวจสอบใหม่อีกครั้ง");
          return;
        }
        refresh();
      }
    }, 5_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [fixtureId, result.status]);

  const request = async () => {
    setRequesting(true);
    setError(null);
    try {
      pollingDeadline.current = Date.now() + 3 * 60_000;
      const queued = await goalApi.requestAiMatchAnalysis(fixtureId, { language: "th" });
      setResult((current) => ({ ...current, status: queued.status }));
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError && requestError.status === 429
          ? "ใช้สิทธิ์วิเคราะห์ครบสำหรับวันนี้แล้ว"
          : "ส่งคำขอวิเคราะห์ไม่ได้ กรุณาลองอีกครั้ง",
      );
    } finally {
      setRequesting(false);
    }
  };

  const analysis = result.analysis;
  return (
    <View className="mt-4 rounded-[28px] border border-accent/40 bg-surface p-6">
      <Text className="font-label text-xs tracking-[2px] text-accent">✦ AI MATCH COMPANION</Text>
      <Text className="mt-2 font-headline-thai text-3xl text-foreground">
        อ่านเกมให้ลึกกว่าแค่สกอร์
      </Text>

      {session ? (
        <Pressable
          accessibilityRole="button"
          className="mt-5 self-start rounded-full bg-accent px-5 py-3 disabled:opacity-50"
          disabled={requesting || result.status === "queued" || result.status === "running"}
          onPress={request}
        >
          <Text className="font-label text-sm text-black">
            {analysis ? "อัปเดตบทวิเคราะห์" : "วิเคราะห์เกมนี้"}
          </Text>
        </Pressable>
      ) : (
        <Link asChild href="/auth">
          <Pressable className="mt-5 self-start rounded-full bg-accent px-5 py-3">
            <Text className="font-label text-sm text-black">เข้าสู่ระบบเพื่อวิเคราะห์</Text>
          </Pressable>
        </Link>
      )}

      {(requesting || result.status === "queued" || result.status === "running") && (
        <View className="mt-5 flex-row items-center gap-3 rounded-2xl bg-background p-4">
          <ActivityIndicator color="#00F1FF" />
          <Text className="flex-1 font-body-thai text-sm text-[#D9CFAC]">
            AI กำลังอ่านเหตุการณ์และแผนการเล่น
          </Text>
        </View>
      )}
      {error && <Text className="mt-4 font-body-thai text-sm text-[#FF5D73]">{error}</Text>}

      {!analysis ? (
        <View className="mt-5 rounded-2xl bg-background p-5">
          <Text className="text-center font-body-thai text-sm leading-6 text-muted">
            วิเคราะห์แท็กติก เหตุผลของผลการแข่งขัน โมเมนตัม และคะแนนนักเตะแบบอธิบายได้
          </Text>
        </View>
      ) : (
        <View className="mt-6 gap-4">
          <View className="rounded-2xl bg-background p-5">
            <Text className="font-label text-xs text-accent">
              MATCH SUMMARY · {Math.round(analysis.confidence * 100)}%
            </Text>
            <Text className="mt-2 font-headline-thai text-2xl text-foreground">
              {analysis.summary.headline}
            </Text>
            <Text className="mt-2 font-body-thai text-sm leading-6 text-[#D9CFAC]">
              {analysis.summary.short}
            </Text>
            {analysis.summary.keyMoments.map((moment) => (
              <Text className="mt-2 font-body-thai text-xs leading-5 text-muted" key={moment}>
                • {moment}
              </Text>
            ))}
          </View>
          <View className="rounded-2xl border border-border p-5">
            <Text className="font-headline-thai text-2xl text-foreground">ทำไมเกมเป็นแบบนี้</Text>
            <Text className="mt-3 font-body-thai text-sm leading-6 text-[#D9CFAC]">
              {analysis.explanation.whyResult}
            </Text>
            {analysis.explanation.decidingFactors.map((factor) => (
              <Text className="mt-2 font-body-thai text-sm text-foreground" key={factor}>
                • {factor}
              </Text>
            ))}
          </View>
          <View className="rounded-2xl border border-border p-5">
            <Text className="font-headline-thai text-2xl text-foreground">Tactical analysis</Text>
            {(["home", "away"] as const).map((side) => {
              const tactical = analysis.tactical[side];
              return (
                <View className="mt-4 rounded-2xl bg-background p-4" key={side}>
                  <Text className="font-label text-primary">
                    {side.toUpperCase()} · {tactical.formation}
                  </Text>
                  <Text className="mt-2 font-body-thai text-sm text-[#D9CFAC]">
                    {tactical.style}
                  </Text>
                  <Text className="mt-2 font-body-thai text-xs leading-5 text-foreground">
                    จุดแข็ง: {tactical.strengths.join(" · ") || "ข้อมูลไม่พอ"}
                  </Text>
                  <Text className="mt-1 font-body-thai text-xs leading-5 text-muted">
                    จุดอ่อน: {tactical.weaknesses.join(" · ") || "ข้อมูลไม่พอ"}
                  </Text>
                </View>
              );
            })}
            {analysis.tactical.changes.map((change) => (
              <Text className="mt-2 font-body-thai text-sm text-foreground" key={change}>
                • {change}
              </Text>
            ))}
          </View>
          <View className="rounded-2xl border border-border p-5">
            <Text className="font-headline-thai text-2xl text-foreground">Momentum timeline</Text>
            {analysis.momentum.map((point) => (
              <View className="mt-4 flex-row gap-3" key={`${point.minute}-${point.explanation}`}>
                <Text className="w-10 font-label text-accent">{point.minute}&apos;</Text>
                <View className="flex-1">
                  <View className="h-1.5 rounded-full bg-background">
                    <View
                      className="h-1.5 rounded-full bg-accent"
                      style={{ width: `${point.intensity}%` }}
                    />
                  </View>
                  <Text className="mt-2 font-body-thai text-xs leading-5 text-muted">
                    {point.explanation}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          {analysis.playerRatings.slice(0, 10).map((player) => (
            <View className="rounded-2xl bg-background p-4" key={player.playerId}>
              <View className="flex-row justify-between">
                <Text className="font-body-thai text-foreground">{player.playerName}</Text>
                <Text className="font-headline text-xl text-primary">
                  {player.rating.toFixed(1)}
                </Text>
              </View>
              <Text className="mt-2 font-body-thai text-xs leading-5 text-muted">
                {player.reasons.join(" · ")}
              </Text>
            </View>
          ))}
          <Text className="font-body-thai text-xs text-muted">
            AI วิเคราะห์จากข้อมูลการแข่งขันที่มีอยู่ อาจคลาดเคลื่อนได้
          </Text>
        </View>
      )}
    </View>
  );
}
