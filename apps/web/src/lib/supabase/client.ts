"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnvironment } from "./env";

let client: SupabaseClient | undefined;

export function createSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    const { key, url } = getSupabasePublicEnvironment();
    client = createBrowserClient(url, key, { auth: { flowType: "pkce" } });
  }
  return client;
}
