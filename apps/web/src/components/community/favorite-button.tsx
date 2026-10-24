"use client";

import { addMyFavorite, listMyFavorites, removeMyFavorite } from "@goal-app/api-client";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { configureGoalBrowserApi } from "@/lib/api-browser";

export function FavoriteButton({
  entityId,
  entityType,
}: {
  entityId: number;
  entityType: "league" | "player" | "team";
}) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const supabase = configureGoalBrowserApi();
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const authenticated = Boolean(data.session);
      setSignedIn(authenticated);
      if (!authenticated) return;
      try {
        const favorites = await listMyFavorites();
        if (mounted) {
          setActive(
            favorites.data.some(
              (favorite) => favorite.entityId === entityId && favorite.entityType === entityType,
            ),
          );
        }
      } catch {
        if (mounted) setFailed(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, [entityId, entityType]);

  if (signedIn === false) {
    return (
      <Button asChild variant="outline">
        <Link href="/login">เข้าสู่ระบบเพื่อเพิ่มรายการโปรด</Link>
      </Button>
    );
  }

  const toggle = async () => {
    setBusy(true);
    setFailed(false);
    try {
      if (active) await removeMyFavorite(entityType, entityId);
      else await addMyFavorite(entityType, entityId);
      setActive((current) => !current);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        aria-pressed={active}
        disabled={busy || signedIn === null}
        onClick={() => void toggle()}
        type="button"
        variant={active ? "default" : "outline"}
      >
        {busy ? "กำลังบันทึก…" : active ? "★ อยู่ในรายการโปรด" : "☆ เพิ่มในรายการโปรด"}
      </Button>
      {failed && <span className="text-sm text-destructive">บันทึกไม่สำเร็จ กรุณาลองใหม่</span>}
    </div>
  );
}
