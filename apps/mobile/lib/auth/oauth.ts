import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

import { getSupabaseClient } from "./supabase";

void WebBrowser.maybeCompleteAuthSession();

export type BrowserProvider = "apple" | "facebook" | "google";

const redirectTo = makeRedirectUri({ path: "auth/callback", scheme: "goal" });

export async function continueWithOAuth(provider: BrowserProvider): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Authentication is not configured");
  const { data, error } = await supabase.auth.signInWithOAuth({
    options: { redirectTo, skipBrowserRedirect: true },
    provider,
  });
  if (error || !data.url) throw error ?? new Error("OAuth URL is unavailable");
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return false;
  const code = new URL(result.url).searchParams.get("code");
  if (!code) throw new Error("OAuth callback did not include an authorization code");
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return true;
}

export async function linkOAuthIdentity(provider: BrowserProvider): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Authentication is not configured");
  const { data, error } = await supabase.auth.linkIdentity({
    options: { redirectTo, skipBrowserRedirect: true },
    provider,
  });
  if (error || !data.url) throw error ?? new Error("Identity-link URL is unavailable");
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return false;
  const code = new URL(result.url).searchParams.get("code");
  if (!code) throw new Error("Identity callback did not include an authorization code");
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return true;
}
