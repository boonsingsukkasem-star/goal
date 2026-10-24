import type { NewsArticle } from "@goal-app/contracts";
import Link from "next/link";

import { NewsCard } from "@/components/news/news-card";
import { SectionHeading } from "@/components/shared/section-heading";
import { StatePanel } from "@/components/shared/state-panel";
import { Button } from "@/components/ui/button";

export function RelatedNews({ articles }: { articles: NewsArticle[] }) {
  return (
    <section className="mt-5">
      <p className="font-label text-xs tracking-wider text-accent uppercase">Match briefing</p>
      <SectionHeading
        action={
          <Button asChild className="h-auto p-0 font-label text-sm" variant="link">
            <Link href="/news">ดูข่าวทั้งหมด →</Link>
          </Button>
        }
      >
        ข่าวที่เกี่ยวข้อง
      </SectionHeading>
      {articles.length === 0 ? (
        <StatePanel className="mt-4 min-h-28" title="ยังไม่มีข่าวที่เชื่อมกับแมตช์นี้" />
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {articles.slice(0, 4).map((article) => (
            <NewsCard article={article} key={article.id} />
          ))}
        </div>
      )}
    </section>
  );
}
