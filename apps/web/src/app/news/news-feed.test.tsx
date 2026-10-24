import type { NewsArticle } from "@goal-app/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NewsCard } from "@/components/news/news-card";

const article: NewsArticle = {
  category: "general",
  confidence: 0.9,
  discoveredAt: "2026-08-17T00:00:00.000Z",
  entities: [],
  headline: "ลิเวอร์พูลยืนยันข่าวล่าสุด",
  id: "0198b135-d9d0-7000-8000-000000000001",
  importance: 70,
  isBreaking: false,
  language: "th",
  primaryUrl: "https://bbc.com/sport/football/story",
  sources: [
    {
      domain: "bbc.com",
      title: "Liverpool update",
      url: "https://bbc.com/sport/football/story",
    },
  ],
  summary: "สรุปข่าวที่เขียนใหม่จากข้อเท็จจริงในแหล่งข่าว",
  summaryBullets: ["ยืนยันโดยแหล่งข่าวที่ระบุ"],
  topicKey: "team:8",
  updatedAt: "2026-08-17T00:00:00.000Z",
};

describe("NewsCard", () => {
  it("renders AI disclosure and a visible clickable citation", () => {
    const html = renderToStaticMarkup(createElement(NewsCard, { article }));
    expect(html).toContain("สรุปโดย AI");
    expect(html).toContain("bbc.com");
    expect(html).toContain('href="https://bbc.com/sport/football/story"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
