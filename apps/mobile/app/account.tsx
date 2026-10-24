import { router } from "expo-router";
import type { UserProfileDto } from "@goal-app/api-client";
import {
  Apple,
  ArrowLeft,
  Facebook,
  Google,
  Link as Link2,
  LogOut,
  Trash as Trash2,
} from "iconoir-react-native";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LegalLinks } from "@/components/legal-links";
import { getAppleDeletionCode } from "@/lib/auth/apple";
import { goalApi } from "@/lib/api";
import { linkOAuthIdentity } from "@/lib/auth/oauth";
import { getSupabaseClient } from "@/lib/auth/supabase";
import { useAuth } from "@/lib/auth/auth-context";
import { unregisterCurrentPushDevice } from "@/lib/notifications/register";

const identityProviders = [
  { icon: Google, label: "GOOGLE", provider: "google" },
  { icon: Facebook, label: "FACEBOOK", provider: "facebook" },
] as const;

export default function AccountScreen() {
  const { loading, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<UserProfileDto | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace("/auth");
  }, [loading, session]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void goalApi
      .getMyProfile()
      .then((value) => active && setProfile(value))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session]);

  if (!session) return null;
  const providers =
    profile?.providers ??
    (session?.user.app_metadata.providers as
      Array<"apple" | "email" | "facebook" | "google"> | undefined) ??
    [];

  async function signOut() {
    await unregisterCurrentPushDevice().catch(() => undefined);
    await getSupabaseClient()?.auth.signOut();
    router.replace("/");
  }

  async function linkIdentity(provider: "apple" | "facebook" | "google") {
    setBusy(true);
    try {
      await linkOAuthIdentity(provider);
    } catch {
      Alert.alert("เชื่อมต่อบัญชีไม่สำเร็จ", "กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!session) return;
    setBusy(true);
    try {
      const appleAuthorizationCode = providers.includes("apple")
        ? await getAppleDeletionCode()
        : undefined;
      await goalApi.deleteMyAccount({ appleAuthorizationCode, confirmation: "DELETE" });
      await unregisterCurrentPushDevice().catch(() => undefined);
      await getSupabaseClient()?.auth.signOut({ scope: "local" });
      router.replace("/");
    } catch {
      Alert.alert("ลบบัญชีไม่สำเร็จ", "กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  function confirmDeletion() {
    Alert.alert("ลบบัญชีถาวร?", "เซสชันจะถูกเพิกถอนทันทีและการดำเนินการนี้ย้อนกลับไม่ได้", [
      { style: "cancel", text: "ยกเลิก" },
      { onPress: () => void deleteAccount(), style: "destructive", text: "ลบบัญชี" },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pb-10 pt-6">
        <Pressable
          accessibilityLabel="กลับหน้าแรก"
          className="flex-row items-center gap-2 self-start"
          onPress={() => router.replace("/")}
        >
          <ArrowLeft color="#FFD700" height={18} width={18} />
          <Text className="font-label text-lg text-primary">GOAL</Text>
        </Pressable>
        <View className="mt-8 rounded-[28px] border border-border bg-surface p-6">
          <Text className="font-label text-sm tracking-[2px] text-accent">ACCOUNT</Text>
          <Text className="mt-2 font-headline text-4xl text-foreground">
            {profile?.displayName ?? session?.user.email ?? "Loading"}
          </Text>
          {profile?.displayName ? (
            <Text className="mt-1 font-body-thai text-sm text-muted">{profile.email}</Text>
          ) : null}
          <View className="mt-4 flex-row items-center gap-2">
            <Link2 color="#9A9381" height={16} width={16} />
            <Text className="font-body-thai text-muted">
              เชื่อมต่อ: {providers.join(", ") || "email"}
            </Text>
          </View>
          <View className="mt-5 flex-row gap-3">
            {identityProviders
              .filter(({ provider }) => !providers.includes(provider))
              .map(({ icon: ProviderIcon, label, provider }) => (
                <Pressable
                  className="flex-row items-center gap-2 rounded-xl border border-border px-4 py-3"
                  key={provider}
                  onPress={() => void linkIdentity(provider)}
                >
                  <ProviderIcon color="#F7F7F7" height={17} width={17} />
                  <Text className="font-label text-foreground">LINK {label}</Text>
                </Pressable>
              ))}
          </View>
          {Platform.OS === "ios" && !providers.includes("apple") && (
            <Pressable
              accessibilityLabel="Link Apple account"
              className="mt-3 h-[52px] flex-row items-center justify-center gap-2 rounded-xl border border-white"
              disabled={busy}
              onPress={() => void linkIdentity("apple")}
            >
              <Apple color="#F7F7F7" fill="#F7F7F7" height={20} width={20} />
              <Text className="font-label text-foreground">LINK APPLE</Text>
            </Pressable>
          )}
          <Pressable
            className="mt-6 flex-row items-center justify-center gap-2 rounded-xl border border-border px-4 py-4"
            onPress={() => void signOut()}
          >
            <LogOut color="#F7F7F7" height={18} width={18} />
            <Text className="font-label text-foreground">SIGN OUT</Text>
          </Pressable>
        </View>
        <View className="mt-5 rounded-[28px] border border-[#FF5D73]/40 bg-surface p-6">
          <Text className="font-headline-thai text-3xl text-[#FF5D73]">ลบบัญชี</Text>
          <Text className="mt-2 font-body-thai leading-6 text-muted">
            ข้อมูลส่วนบุคคลในระบบหลักจะถูกลบภายใน 7 วัน และ backup ภายใน 30 วัน
          </Text>
          <Pressable
            className="mt-5 flex-row items-center justify-center gap-2 rounded-xl bg-[#FF5D73] px-4 py-4"
            disabled={busy}
            onPress={confirmDeletion}
          >
            <Trash2 color="#FFFFFF" height={18} width={18} />
            <Text className="font-label text-white">DELETE ACCOUNT</Text>
          </Pressable>
        </View>
        <LegalLinks />
      </ScrollView>
    </SafeAreaView>
  );
}
