"use client";

import { configureGoalApi } from "@goal-app/api-client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type BrowserSupabaseClient = ReturnType<typeof createSupabaseBrowserClient>;

export function configureGoalBrowserApi(options?: { optionalAuth?: false }): BrowserSupabaseClient;
export function configureGoalBrowserApi(options: {
  optionalAuth: true;
}): BrowserSupabaseClient | null;
export function configureGoalBrowserApi({ optionalAuth = false } = {}) {
  let supabase: BrowserSupabaseClient | null = null;
  try {
    supabase = createSupabaseBrowserClient();
  } catch (error) {
    if (!optionalAuth) throw error;
  }

  configureGoalApi({
    baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "",
    getAccessToken: async () =>
      supabase ? ((await supabase.auth.getSession()).data.session?.access_token ?? null) : null,
  });

  return supabase;
}
