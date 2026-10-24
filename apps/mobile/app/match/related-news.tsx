import type { NewsArticle } from "@goal-app/contracts";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { goalApi } from "@/lib/api";
import { MobileNewsCard } from "@/lib/news-card";

export function RelatedNews({ fixtureId }: { fixtureId: number }) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);

  useEffect(() => {
    let active = true;
    void goalApi
      .listMatchRelatedNews(fixtureId, { language: "th", limit: 4 })
      .then((result) => active && setArticles(result.data))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [fixtureId]);

  return (
    <View className="mt-4">
      <Text className="font-label text-xs tracking-[2px] text-accent">MATCH BRIEFING</Text>
      <Text className="mt-1 font-headline-thai text-3xl text-foreground">ข่าวที่เกี่ยวข้อง</Text>
      <View className="mt-3 gap-4">
        {articles.length === 0 ? (
          <Text className="rounded-[28px] border border-border bg-surface p-6 font-body-thai text-muted">
            ยังไม่มีข่าวที่เชื่อมกับแมตช์นี้
          </Text>
        ) : (
          articles.map((article) => <MobileNewsCard article={article} key={article.id} />)
        )}
      </View>
    </View>
  );
}
