"use server";

import { configureGoalApi, deleteMyAccount } from "@goal-app/api-client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string): string {
  const result = formData.get(key);
  return typeof result === "string" ? result.trim() : "";
}

function loginError(code: string, mode?: "forgot" | "reset" | "signup"): never {
  const params = new URLSearchParams({ error: code });
  if (mode) params.set("mode", mode);
  redirect(`/login?${params.toString()}`);
}

export async function signInWithPassword(formData: FormData): Promise<void> {
  const email = value(formData, "email");
  const password = value(formData, "password");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) loginError("invalid-credentials");
  redirect("/account");
}

export async function signUpWithPassword(formData: FormData): Promise<void> {
  const email = value(formData, "email");
  const password = value(formData, "password");
  const displayName = value(formData, "displayName");
  if (!displayName || displayName.length > 80) loginError("display-name", "signup");
  if (password.length < 8) loginError("password-length", "signup");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    options: { data: { display_name: displayName } },
    password,
  });
  if (error) loginError("signup-failed", "signup");
  redirect(data.session ? "/account" : "/login?message=check-email");
}

export async function continueWithProvider(formData: FormData): Promise<void> {
  const provider = value(formData, "provider");
  if (provider !== "google" && provider !== "facebook") loginError("invalid-provider");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    },
    provider,
  });
  if (error || !data.url) loginError("oauth-start");
  redirect(data.url);
}

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = value(formData, "email");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const callbackUrl = new URL("/auth/callback", siteUrl);
  callbackUrl.searchParams.set("next", "/login?mode=reset");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl.toString(),
  });
  if (error) loginError("reset-request", "forgot");
  redirect("/login?message=reset-email");
}

export async function updatePassword(formData: FormData): Promise<void> {
  const password = value(formData, "password");
  const confirmation = value(formData, "passwordConfirmation");
  if (password.length < 8) loginError("password-length", "reset");
  if (password !== confirmation) loginError("password-match", "reset");

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) loginError("reset-session", "forgot");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) loginError("password-update", "reset");
  await supabase.auth.signOut();
  redirect("/login?message=password-updated");
}

export async function linkProvider(formData: FormData): Promise<void> {
  const provider = value(formData, "provider");
  if (provider !== "google" && provider !== "facebook") redirect("/account?error=provider");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.linkIdentity({
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback?linked=1`,
    },
    provider,
  });
  if (error || !data.url) redirect("/account?error=link");
  redirect(data.url);
}

export async function updateProfile(formData: FormData): Promise<void> {
  const displayName = value(formData, "displayName");
  const avatarUrl = value(formData, "avatarUrl");
  const locale = value(formData, "locale");
  const timezone = value(formData, "timezone");

  if (!displayName || displayName.length > 80) redirect("/account?error=profile");
  if (avatarUrl && !avatarUrl.startsWith("https://")) redirect("/account?error=avatar");
  if (locale !== "th-TH" && locale !== "en-US") redirect("/account?error=locale");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    redirect("/account?error=timezone");
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  const { error } = await supabase
    .from("profiles")
    .update({
      avatar_url: avatarUrl || null,
      display_name: displayName,
      locale,
      timezone,
    })
    .eq("user_id", userData.user.id);
  if (error) redirect("/account?error=profile-save");

  revalidatePath("/account");
  redirect("/account?updated=1");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function deleteAccount(formData: FormData): Promise<void> {
  if (value(formData, "confirmation") !== "DELETE") redirect("/account?error=confirmation");
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!userData.user || !sessionData.session) redirect("/login");

  configureGoalApi({
    baseUrl: process.env.GOAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  });
  await deleteMyAccount(
    { confirmation: "DELETE" },
    { headers: { authorization: `Bearer ${sessionData.session.access_token}` } },
  ).catch(() => redirect("/account?error=delete"));
  await supabase.auth.signOut({ scope: "local" });
  redirect("/?account=deleted");
}
