import {
  ArchivoNarrow_400Regular,
  ArchivoNarrow_600SemiBold,
  ArchivoNarrow_700Bold,
} from "@expo-google-fonts/archivo-narrow";
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
} from "@expo-google-fonts/hanken-grotesk";
import {
  NotoSansThai_400Regular,
  NotoSansThai_500Medium,
  NotoSansThai_600SemiBold,
  NotoSansThai_700Bold,
} from "@expo-google-fonts/noto-sans-thai";
import { semanticColors } from "@goal-app/design-tokens";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

import { AuthProvider, useAuth } from "@/lib/auth/auth-context";
import { refreshPushRegistrationIfGranted } from "@/lib/notifications/register";

import "../global.css";

void SplashScreen.preventAutoHideAsync();

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

function PushRegistrationLifecycle() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session || Platform.OS === "web") return;
    const refresh = () => void refreshPushRegistrationIfGranted().catch(() => undefined);
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, [session]);

  return null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ArchivoNarrow_400Regular,
    ArchivoNarrow_600SemiBold,
    ArchivoNarrow_700Bold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    NotoSansThai_400Regular,
    NotoSansThai_500Medium,
    NotoSansThai_600SemiBold,
    NotoSansThai_700Bold,
  });

  useEffect(() => {
    if (loaded || error) {
      void SplashScreen.hideAsync();
    }
  }, [error, loaded]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const openFixture = (response: Notifications.NotificationResponse | null) => {
      const articleId = response?.notification.request.content.data?.articleId;
      if (typeof articleId === "string" && articleId.length > 0) {
        router.push("/news");
        void Notifications.clearLastNotificationResponseAsync();
        return;
      }
      const fixtureId = Number(response?.notification.request.content.data?.fixtureId);
      if (Number.isInteger(fixtureId) && fixtureId > 0) {
        router.push({ pathname: "/match/[fixtureId]", params: { fixtureId: String(fixtureId) } });
        void Notifications.clearLastNotificationResponseAsync();
      }
    };
    void Notifications.getLastNotificationResponseAsync().then(openFixture);
    const subscription = Notifications.addNotificationResponseReceivedListener(openFixture);
    return () => subscription.remove();
  }, []);

  if (!loaded && !error) return null;

  return (
    <AuthProvider>
      <PushRegistrationLifecycle />
      <Stack
        screenOptions={{
          animation: "fade",
          contentStyle: { backgroundColor: semanticColors.background },
          headerShown: false,
        }}
      />
    </AuthProvider>
  );
}
