import type { NewsArticle } from "@goal-app/contracts";
import { Linking, Pressable, Text, View } from "react-native";

import { goalApi } from "@/lib/api";

export function MobileNewsCard({
  article,
  reasons = [],
  signedIn = false,
}: {
  article: NewsArticle;
  reasons?: string[];
  signedIn?: boolean;
}) {
  const openSource = async (url: string) => {
    if (signedIn) await goalApi.recordNewsEngagement(article.id).catch(() => undefined);
    await Linking.openURL(url);
  };
  return (
    <View className="rounded-[28px] border border-border bg-surface p-5">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="rounded-full bg-[#00383D] px-3 py-1 font-label text-xs text-accent">
          {article.category.toUpperCase()}
        </Text>
        <Text className="font-label text-xs text-muted">
          {new Date(article.discoveredAt).toLocaleDateString("th-TH")}
        </Text>
      </View>
      <Text className="mt-4 font-headline-thai text-3xl leading-10 text-foreground">
        {article.headline}
      </Text>
      <View className="mt-4 rounded-2xl bg-background p-4">
        <Text className="font-body-thai leading-7 text-[#D9CFAC]">✦ {article.summary}</Text>
      </View>
      {reasons.length > 0 && (
        <Text className="mt-3 font-label text-xs text-accent">{reasons.join(" · ")}</Text>
      )}
      <View className="mt-4 gap-1">
        {article.summaryBullets.map((bullet) => (
          <Text className="font-body-thai text-sm leading-6 text-muted" key={bullet}>
            • {bullet}
          </Text>
        ))}
      </View>
      <Text className="mt-5 font-label text-xs tracking-[1px] text-muted">แหล่งข่าว</Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {article.sources.map((source) => (
          <Pressable
            accessibilityRole="link"
            className="rounded-full border border-border px-3 py-2"
            key={source.url}
            onPress={() => void openSource(source.url)}
          >
            <Text className="font-label text-xs text-primary">{source.domain} ↗</Text>
          </Pressable>
        ))}
      </View>
      <Text className="mt-3 font-body-thai text-xs leading-5 text-muted">
        สรุปโดย AI โปรดตรวจสอบข่าวต้นฉบับก่อนตัดสินใจ
      </Text>
    </View>
  );
}
