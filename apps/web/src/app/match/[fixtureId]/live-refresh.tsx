"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function LiveRefresh({ intervalMs }: { intervalMs: number | null }) {
  const router = useRouter();
  useEffect(() => {
    if (intervalMs === null) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [router, intervalMs]);
  return null;
}
