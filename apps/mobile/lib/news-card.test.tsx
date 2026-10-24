import { describe, expect, it } from "@jest/globals";
import type { NewsArticle } from "@goal-app/contracts";
import { render } from "@testing-library/react-native";

import { MobileNewsCard } from "./news-card";

const article: NewsArticle = {
  category: "breaking",
  confidence: 0.91,
  discoveredAt: "2026-08-17T00:00:00.000Z",
  entities: [],
  headline: "ข่าวฟุตบอลล่าสุด",
  id: "0198b135-d9d0-7000-8000-000000000001",
  importance: 90,
  isBreaking: true,
  language: "th",
  primaryUrl: "https://reuters.com/sports/story",
  sources: [
    {
      domain: "reuters.com",
      title: "Football update",
      url: "https://reuters.com/sports/story",
    },
  ],
  summary: "สรุปข่าวจากแหล่งข้อมูลที่ตรวจสอบได้",
  summaryBullets: ["ข้อเท็จจริงสำคัญ"],
  topicKey: "global:breaking",
  updatedAt: "2026-08-17T00:00:00.000Z",
};

describe("MobileNewsCard", () => {
  it("keeps citations and AI disclosure visible on native", async () => {
    const screen = await render(<MobileNewsCard article={article} />);
    expect(screen.getByText("reuters.com ↗")).toBeTruthy();
    expect(screen.getByText(/สรุปโดย AI/)).toBeTruthy();
  });
});
