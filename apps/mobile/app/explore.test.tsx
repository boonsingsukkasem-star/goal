import { describe, expect, it, jest } from "@jest/globals";
import { render, waitFor } from "@testing-library/react-native";

import ExploreScreen from "./explore";

jest.mock("@/lib/api", () => ({
  goalApi: {
    exploreFootballCatalog: jest.fn(() =>
      Promise.resolve({
        data: [
          {
            entityType: "league",
            id: 8,
            imageUrl: null,
            name: "Premier League",
            shortCode: "EPL",
            type: "domestic",
          },
        ],
        generatedAt: "2026-08-17T00:00:00.000Z",
        query: null,
      }),
    ),
  },
}));

describe("ExploreScreen", () => {
  it("loads provider football entities through the generated client", async () => {
    const screen = await render(<ExploreScreen />);
    await waitFor(() => expect(screen.getByText("Premier League")).toBeTruthy());
    expect(screen.getByText("league")).toBeTruthy();
    await screen.unmount();
  });
});
