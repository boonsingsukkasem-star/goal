import { describe, expect, it, jest } from "@jest/globals";

import { createPushRegistrar } from "./register";

function setup(options: { granted?: boolean; previousDeviceId?: string | null } = {}) {
  const order: string[] = [];
  const requestPermission = jest.fn(async () => {
    order.push("permission");
    return { granted: true };
  });
  const registerDevice = jest.fn(
    async (_input: { expoPushToken: string; platform: "ios" | "android"; timezone: string }) => ({
      device: { id: "device-current" },
    }),
  );
  const removeDevice = jest.fn(async (_deviceId: string) => ({ disabled: true }));
  const storage = {
    getItem: jest.fn(async (_key: string) => options.previousDeviceId ?? null),
    setItem: jest.fn(async (_key: string, _value: string) => undefined),
  };
  const registrar = createPushRegistrar({
    createAndroidChannel: jest.fn(async () => {
      order.push("channel");
      return null;
    }),
    getPermission: jest.fn(async () => ({ granted: options.granted ?? true })),
    getToken: jest.fn(async () => "ExpoPushToken[current]"),
    platform: "android",
    registerDevice,
    removeDevice,
    requestPermission,
    storage,
    timezone: () => "Asia/Bangkok",
  });
  return { order, registrar, registerDevice, removeDevice, requestPermission, storage };
}

describe("mobile push registration", () => {
  it("creates the Android channel before asking for notification permission", async () => {
    const { order, registrar } = setup({ granted: false });

    await expect(registrar(true)).resolves.toBe("registered");

    expect(order).toEqual(["channel", "permission"]);
  });

  it("refreshes an already-granted token without prompting on app startup", async () => {
    const { registrar, registerDevice, requestPermission } = setup();

    await expect(registrar(false)).resolves.toBe("registered");

    expect(requestPermission).not.toHaveBeenCalled();
    expect(registerDevice).toHaveBeenCalledWith(
      expect.objectContaining({ expoPushToken: "ExpoPushToken[current]", platform: "android" }),
    );
  });

  it("does not prompt when startup refresh finds notification permission denied", async () => {
    const { registrar, registerDevice, requestPermission } = setup({ granted: false });

    await expect(registrar(false)).resolves.toBe("denied");

    expect(requestPermission).not.toHaveBeenCalled();
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it("replaces the stored device registration when Expo rotates the token", async () => {
    const { registrar, removeDevice, storage } = setup({ previousDeviceId: "device-previous" });

    await expect(registrar(false)).resolves.toBe("registered");

    expect(storage.setItem).toHaveBeenCalledWith("push-device-id", "device-current");
    expect(removeDevice).toHaveBeenCalledWith("device-previous");
  });
});
