import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { goalApi } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

export function FavoriteButton({
  entityId,
  entityType,
}: {
  entityId: number;
  entityType: "league" | "player" | "team";
}) {
  const { loading, session } = useAuth();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!session) return;
    let mounted = true;
    void goalApi
      .listMyFavorites()
      .then((favorites) => {
        if (mounted)
          setActive(
            favorites.data.some(
              (favorite) => favorite.entityId === entityId && favorite.entityType === entityType,
            ),
          );
      })
      .catch(() => mounted && setFailed(true));
    return () => {
      mounted = false;
    };
  }, [entityId, entityType, session]);

  const toggle = async () => {
    if (!session) {
      router.push("/auth");
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      if (active) await goalApi.removeMyFavorite(entityType, entityId);
      else await goalApi.addMyFavorite(entityType, entityId);
      setActive((current) => !current);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="items-start">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || loading, selected: active }}
        className={
          active
            ? "rounded-full bg-primary px-5 py-3"
            : "rounded-full border border-primary px-5 py-3"
        }
        disabled={busy || loading}
        onPress={() => void toggle()}
      >
        <Text className={active ? "font-label text-black" : "font-label text-primary"}>
          {busy ? "กำลังบันทึก…" : active ? "★ อยู่ในรายการโปรด" : "☆ เพิ่มในรายการโปรด"}
        </Text>
      </Pressable>
      {failed && (
        <Text className="mt-2 font-body-thai text-sm text-[#FF5D73]">
          บันทึกไม่สำเร็จ กรุณาลองใหม่
        </Text>
      )}
    </View>
  );
}
