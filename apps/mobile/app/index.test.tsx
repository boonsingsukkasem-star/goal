import { describe, expect, it, jest } from "@jest/globals";
import { render, waitFor } from "@testing-library/react-native";

import HomeScreen from "./index";

jest.mock("@/lib/api", () => ({
  goalApi: {
    listFootballFixtures: jest.fn(() => Promise.resolve({ data: [], nextCursor: null })),
    listTrendingFootballNews: jest.fn(() => Promise.resolve({ data: [], nextCursor: null })),
  },
}));

describe("HomeScreen", () => {
  it("renders the API-backed football home navigation", async () => {
    const screen = await render(<HomeScreen />);
    expect(screen.getByText("GOAL")).toBeTruthy();
    expect(screen.getByText("FIXTURES")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("TRENDING NEWS")).toBeTruthy());
  });
});
