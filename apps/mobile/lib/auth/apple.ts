import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

import { getSupabaseClient } from "./supabase";

async function appleCredential() {
  const rawNonce = Crypto.randomUUID();
  const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const credential = await AppleAuthentication.signInAsync({
    nonce,
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  return { credential, rawNonce };
}

export async function continueWithApple(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Authentication is not configured");
  const { credential, rawNonce } = await appleCredential();
  if (!credential.identityToken) throw new Error("Apple did not return an identity token");
  const { error } = await supabase.auth.signInWithIdToken({
    nonce: rawNonce,
    provider: "apple",
    token: credential.identityToken,
  });
  if (error) throw error;

  const displayName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(" ");
  if (displayName) {
    const { data: userData, error: updateUserError } = await supabase.auth.updateUser({
      data: { display_name: displayName },
    });
    if (updateUserError) throw updateUserError;
    const { error: updateProfileError } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("user_id", userData.user.id);
    if (updateProfileError) throw updateProfileError;
  }
}

export async function getAppleDeletionCode(): Promise<string | undefined> {
  const credential = await AppleAuthentication.signInAsync();
  return credential.authorizationCode ?? undefined;
}
