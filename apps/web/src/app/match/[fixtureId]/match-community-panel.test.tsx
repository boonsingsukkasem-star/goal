import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MatchCommunityPanel } from "./match-community-panel";

describe("MatchCommunityPanel", () => {
  it("renders the anonymous aggregate boundary and signed-in actions", () => {
    const html = renderToStaticMarkup(
      createElement(MatchCommunityPanel, {
        fixtureId: 42,
        teams: [
          { id: 101, name: "Home FC" },
          { id: 102, name: "Away FC" },
        ],
      }),
    );

    expect(html).toContain("แสดงเฉพาะยอดรวม");
    expect(html).toContain("Home FC");
    expect(html).toContain("Away FC");
    expect(html).toContain('href="/login"');
    expect(html).not.toContain("userId");
  });
});
