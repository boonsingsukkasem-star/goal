"use client";

import { Refresh as RefreshCw, WarningTriangle as TriangleAlert } from "iconoir-react";

import { StatePanel } from "@/components/shared/state-panel";
import { Button } from "@/components/ui/button";

export default function MatchError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-5 py-10">
      <StatePanel
        action={
          <Button onClick={reset}>
            <RefreshCw /> ลองใหม่
          </Button>
        }
        className="w-full border-primary/40"
        description="ข้อมูลอาจขัดข้องชั่วคราว กรุณาลองอีกครั้ง"
        icon={TriangleAlert}
        title="โหลดรายละเอียดการแข่งขันไม่ได้"
      />
    </main>
  );
}
