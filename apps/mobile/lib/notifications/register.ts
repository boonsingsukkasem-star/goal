import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { goalApi } from "@/lib/api";
import { secureSessionStorage } from "@/lib/auth/secure-storage";

const deviceStorageKey = "push-device-id";

type PushRegistrationResult = "registered" | "denied" | "unsupported";

interface PushRegistrarDependencies {
  createAndroidChannel: () => Promise<unknown>;
  getPermission: () => Promise<{ granted: boolean }>;
  getToken: () => Promise<string>;
  platform: string;
  registerDevice: (input: {
    expoPushToken: string;
    platform: "ios" | "android";
    timezone: string;
  }) => Promise<{ device: { id: string } }>;
  removeDevice: (deviceId: string) => Promise<unknown>;
  requestPermission: () => Promise<{ granted: boolean }>;
  storage: Pick<typeof secureSessionStorage, "getItem" | "setItem">;
  timezone: () => string;
}

export function createPushRegistrar(dependencies: PushRegistrarDependencies) {
  return async (requestPermission: boolean): Promise<PushRegistrationResult> => {
    if (dependencies.platform !== "ios" && dependencies.platform !== "android") {
      return "unsupported";
    }
    if (dependencies.platform === "android") await dependencies.createAndroidChannel();
    const current = await dependencies.getPermission();
    const permission =
      current.granted || !requestPermission ? current : await dependencies.requestPermission();
    if (!permission.granted) return "denied";

    const response = await dependencies.registerDevice({
      expoPushToken: await dependencies.getToken(),
      platform: dependencies.platform,
      timezone: dependencies.timezone(),
    });
    const previousDeviceId = await dependencies.storage.getItem(deviceStorageKey);
    await dependencies.storage.setItem(deviceStorageKey, response.device.id);
    if (previousDeviceId && previousDeviceId !== response.device.id) {
      await dependencies.removeDevice(previousDeviceId).catch(() => undefined);
    }
    return "registered";
  };
}

const registerPush = createPushRegistrar({
  createAndroidChannel: () =>
    Notifications.setNotificationChannelAsync("match-updates", {
      importance: Notifications.AndroidImportance.HIGH,
      name: "Match updates",
      sound: "default",
    }),
  getPermission: () => Notifications.getPermissionsAsync(),
  getToken: async () => {
    const projectId =
      Constants.easConfig?.projectId ??
      (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
    if (!projectId) throw new Error("EAS project ID is not configured");
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  },
  platform: Platform.OS,
  registerDevice: (input) => goalApi.registerPushDevice(input),
  removeDevice: (deviceId) => goalApi.removePushDevice(deviceId),
  requestPermission: () => Notifications.requestPermissionsAsync(),
  storage: secureSessionStorage,
  timezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Bangkok",
});

export function registerPushAfterFollow(): Promise<PushRegistrationResult> {
  return registerPush(true);
}

export function refreshPushRegistrationIfGranted(): Promise<PushRegistrationResult> {
  return registerPush(false);
}

export async function unregisterCurrentPushDevice(): Promise<void> {
  const deviceId = await secureSessionStorage.getItem(deviceStorageKey);
  if (!deviceId) return;
  try {
    await goalApi.removePushDevice(deviceId);
  } finally {
    await secureSessionStorage.removeItem(deviceStorageKey);
  }
}
