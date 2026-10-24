import { router } from "expo-router";
import { Apple, ArrowLeft, Facebook, Google } from "iconoir-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { continueWithApple } from "@/lib/auth/apple";
import { continueWithOAuth } from "@/lib/auth/oauth";
import { getSupabaseClient } from "@/lib/auth/supabase";

const oauthProviders = [
  { icon: Google, label: "GOOGLE", provider: "google" },
  { icon: Facebook, label: "FACEBOOK", provider: "facebook" },
] as const;

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [signUp, setSignUp] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<boolean | void>) {
    setBusy(true);
    try {
      const completed = await action();
      if (completed !== false) router.replace("/account");
    } catch {
      Alert.alert("เข้าสู่ระบบไม่สำเร็จ", "กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  async function passwordAuth(): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Authentication is not configured");
    if (signUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        options: { data: { display_name: displayName } },
        password,
      });
      if (error) throw error;
      if (!data.session) {
        Alert.alert("ยืนยันอีเมล", "กรุณาเปิดลิงก์ยืนยันที่ส่งไปทางอีเมล");
        return false;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    return true;
  }

  return (
    <SafeAreaView className="flex-1 bg-background px-5 py-6">
      <Pressable
        accessibilityLabel="กลับ"
        accessibilityRole="button"
        className="flex-row items-center gap-2 self-start"
        onPress={() => router.back()}
      >
        <ArrowLeft color="#FFD700" height={18} width={18} />
        <Text className="font-label text-lg text-primary">GOAL</Text>
      </Pressable>
      <View className="mt-8 rounded-[28px] border border-border bg-surface p-6">
        <Text className="font-label text-sm tracking-[2px] text-accent">YOUR FOOTBALL</Text>
        <Text className="mt-2 font-headline-thai text-5xl text-foreground">
          {signUp ? "สร้างบัญชี" : "เข้าสู่ระบบ"}
        </Text>
        {signUp && (
          <TextInput
            autoCapitalize="words"
            className="mt-6 rounded-xl border border-border bg-background px-4 py-4 font-body-thai text-foreground"
            onChangeText={setDisplayName}
            placeholder="ชื่อที่แสดง"
            placeholderTextColor="#9A9381"
            value={displayName}
          />
        )}
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          className="mt-4 rounded-xl border border-border bg-background px-4 py-4 font-body text-foreground"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#9A9381"
          value={email}
        />
        <TextInput
          autoComplete={signUp ? "new-password" : "current-password"}
          className="mt-4 rounded-xl border border-border bg-background px-4 py-4 font-body text-foreground"
          onChangeText={setPassword}
          placeholder="Password (8+ characters)"
          placeholderTextColor="#9A9381"
          secureTextEntry
          value={password}
        />
        <Pressable
          className="mt-4 items-center rounded-xl bg-primary px-4 py-4"
          disabled={busy || password.length < 8 || !email}
          onPress={() => void run(passwordAuth)}
        >
          <Text className="font-label text-base text-black">
            {signUp ? "CREATE ACCOUNT" : "SIGN IN"}
          </Text>
        </Pressable>
        <View className="my-5 h-px bg-border" />
        <View className="flex-row gap-3">
          {oauthProviders.map(({ icon: ProviderIcon, label, provider }) => (
            <Pressable
              accessibilityLabel={`Continue with ${label}`}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-4"
              disabled={busy}
              key={provider}
              onPress={() => void run(() => continueWithOAuth(provider))}
            >
              <ProviderIcon color="#F7F7F7" height={18} width={18} />
              <Text className="font-label text-foreground">{label}</Text>
            </Pressable>
          ))}
        </View>
        {Platform.OS === "ios" && (
          <Pressable
            accessibilityLabel="Continue with Apple"
            accessibilityRole="button"
            className="mt-3 h-[52px] flex-row items-center justify-center gap-2 rounded-xl bg-white"
            disabled={busy}
            onPress={() => void run(continueWithApple)}
          >
            <Apple color="#000000" fill="#000000" height={20} width={20} />
            <Text className="font-label text-black">CONTINUE WITH APPLE</Text>
          </Pressable>
        )}
        {busy && <ActivityIndicator className="mt-4" color="#FFD700" />}
        <Pressable className="mt-5 items-center" onPress={() => setSignUp((value) => !value)}>
          <Text className="font-body-thai text-accent">
            {signUp ? "มีบัญชีแล้ว? เข้าสู่ระบบ" : "ยังไม่มีบัญชี? สร้างบัญชี"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
