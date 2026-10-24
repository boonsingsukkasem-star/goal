import { Alert, Linking, Pressable, Text, View } from "react-native";

const siteUrl = (process.env.EXPO_PUBLIC_SITE_URL ?? "https://goal.co.th").replace(/\/$/, "");
const legalLinks = [
  { label: "PRIVACY", url: `${siteUrl}/privacy` },
  { label: "SUPPORT", url: `${siteUrl}/support` },
  { label: "DELETE ACCOUNT", url: `${siteUrl}/account-deletion` },
] as const;

async function openExternalPage(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("เปิดหน้าเว็บไม่สำเร็จ", "กรุณาลองใหม่เมื่อเชื่อมต่ออินเทอร์เน็ต");
  }
}

export function LegalLinks() {
  return (
    <View className="mt-6 rounded-[28px] border border-border bg-surface p-5">
      <Text className="font-label text-xs tracking-[2px] text-muted">LEGAL &amp; SUPPORT</Text>
      <View className="mt-4 flex-row flex-wrap gap-3">
        {legalLinks.map((link) => (
          <Pressable
            accessibilityHint="เปิดในเว็บเบราว์เซอร์"
            accessibilityRole="link"
            className="rounded-xl border border-border px-4 py-3"
            key={link.url}
            onPress={() => void openExternalPage(link.url)}
          >
            <Text className="font-label text-sm text-foreground">{link.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
