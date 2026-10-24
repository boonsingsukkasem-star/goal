import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExploreCatalog } from "./explore-catalog";

describe("ExploreCatalog", () => {
  it("renders a typed catalog result with a stable profile route", () => {
    const html = renderToStaticMarkup(
      createElement(ExploreCatalog, {
        initial: [
          {
            entityType: "team" as const,
            founded: 1892,
            id: 8,
            imageUrl: null,
            name: "Liverpool",
            shortCode: "LIV",
          },
        ],
      }),
    );
    expect(html).toContain("Liverpool");
    expect(html).toContain('href="/team/8"');
    expect(html.match(/ดูทั้งหมด/g)).toHaveLength(3);
    expect(html).toContain('aria-label="ดูลีกทั้งหมด"');
    expect(html).toContain('aria-label="ดูสโมสรทั้งหมด"');
    expect(html).toContain('aria-label="ดูนักเตะทั้งหมด"');
  });
});
