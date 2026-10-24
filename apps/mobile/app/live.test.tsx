import { describe, expect, it, jest } from "@jest/globals";
import { render, waitFor } from "@testing-library/react-native";

import LiveScreen from "./live";

jest.mock("@/lib/api", () => ({
  goalApi: {
    listFootballFixtures: jest.fn(() => Promise.reject(new Error("offline"))),
  },
}));

describe("LiveScreen", () => {
  it("renders a retryable error instead of treating an API outage as an empty schedule", async () => {
    const screen = await render(<LiveScreen />);
    await waitFor(() => expect(screen.getByText("โหลดข้อมูลการแข่งขันไม่ได้")).toBeTruthy());
    expect(screen.getByText("ลองใหม่")).toBeTruthy();
    expect(screen.queryByText("ยังไม่มีข้อมูลการแข่งขัน")).toBeNull();
    await screen.unmount();
  });
});
