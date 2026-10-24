import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const chunkSize = 1800;

function secureKey(key: string): string {
  return `goal.${key.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

async function removeNative(key: string): Promise<void> {
  const base = secureKey(key);
  const rawCount = await SecureStore.getItemAsync(`${base}.chunks`);
  const count = Number(rawCount ?? "0");
  await Promise.all([
    SecureStore.deleteItemAsync(`${base}.chunks`),
    ...Array.from({ length: Number.isFinite(count) ? count : 0 }, (_, index) =>
      SecureStore.deleteItemAsync(`${base}.${index}`),
    ),
  ]);
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(key) ?? null;
    const base = secureKey(key);
    const count = Number(await SecureStore.getItemAsync(`${base}.chunks`));
    if (!Number.isInteger(count) || count < 1) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${base}.${index}`)),
    );
    return chunks.every((chunk) => chunk !== null) ? chunks.join("") : null;
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await removeNative(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    await removeNative(key);
    const base = secureKey(key);
    const chunks = Array.from({ length: Math.ceil(value.length / chunkSize) }, (_, index) =>
      value.slice(index * chunkSize, (index + 1) * chunkSize),
    );
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(`${base}.${index}`, chunk, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        }),
      ),
    );
    await SecureStore.setItemAsync(`${base}.chunks`, String(chunks.length), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  },
};
