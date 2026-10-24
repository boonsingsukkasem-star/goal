import "react-native-url-polyfill/auto";

import { createClient, processLock, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

import { secureSessionStorage } from "./secure-storage";

let client: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  client =
    url && key
      ? createClient(url, key, {
          auth: {
            autoRefreshToken: true,
            detectSessionInUrl: false,
            flowType: "pkce",
            lock: processLock,
            persistSession: true,
            storage: secureSessionStorage,
          },
        })
      : null;
  return client;
}

export function registerSessionAutoRefresh(supabase: SupabaseClient): () => void {
  if (Platform.OS === "web") return () => undefined;
  if (AppState.currentState === "active") supabase.auth.startAutoRefresh();
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
  return () => subscription.remove();
}
