import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AiComparePanel } from "./ai-compare-panel";

describe("AiComparePanel", () => {
  it("renders the authenticated feature boundary and both comparison modes", () => {
    const html = renderToStaticMarkup(createElement(AiComparePanel));

    expect(html).toContain("Player vs Player · Team vs Team");
    expect(html).toContain("เข้าสู่ระบบเพื่อใช้ AI Compare");
    expect(html).toContain('href="/login"');
  });
});
