import { describe, expect, it } from "vitest";

import { isLiveMatch } from "./index";

describe("isLiveMatch", () => {
  it("recognizes active match states", () => {
    expect(isLiveMatch("live")).toBe(true);
    expect(isLiveMatch("half-time")).toBe(true);
    expect(isLiveMatch("finished")).toBe(false);
  });
});
