import type { Metadata } from "next";
import { connection } from "next/server";

import { getNewsPageData } from "./news-data";
import { NewsFeed } from "./news-feed";

export const metadata: Metadata = {
  description: "ข่าวฟุตบอลล่าสุด ข่าวมาแรง และข่าวสำหรับทีมที่คุณติดตาม พร้อมสรุปจาก AI",
  title: "ข่าวฟุตบอล",
};

export default async function NewsPage() {
  await connection();
  const data = await getNewsPageData();

  return (
    <NewsFeed
      aiContext={data.aiContext}
      initialError={data.initialError}
      initialLatest={data.latest}
      initialNextCursor={data.nextCursor}
      initialTrending={data.trending}
    />
  );
}
