import type { Metadata } from "next";
import { connection } from "next/server";

import { goalApi } from "@/lib/api";

import { AiComparePanel } from "./ai-compare-panel";

export const metadata: Metadata = {
  description: "เปรียบเทียบนักเตะหรือทีมฟุตบอลด้วยข้อมูลจริง พร้อมข้อสรุปที่อธิบายได้จาก AI",
  title: "AI Comparison Tool",
};

export default async function ComparePage() {
  await connection();
  const initial = await goalApi()
    .listFootballComparisonOptions({ entityType: "player", page: 1, perPage: 20 })
    .catch(() => ({
      data: [],
      generatedAt: new Date().toISOString(),
      hasMore: false,
      page: 1,
      perPage: 20,
      query: null,
    }));

  return <AiComparePanel initialHasMore={initial.hasMore} initialItems={initial.data} />;
}
