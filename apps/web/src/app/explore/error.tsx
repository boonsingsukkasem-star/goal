"use client";

import Link from "next/link";

import { StatePanel } from "@/components/shared/state-panel";
import { Button } from "@/components/ui/button";

export default function ExploreError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-3xl place-items-center px-5">
      <StatePanel
        action={
          <div className="flex gap-3">
            <Button onClick={reset} type="button">
              ลองใหม่
            </Button>
            <Button asChild variant="outline">
              <Link href="/">หน้าแรก</Link>
            </Button>
          </div>
        }
        className="w-full border-primary/40"
        description="ระบบอาจเชื่อมต่อข้อมูลฟุตบอลไม่ได้ชั่วคราว"
        title="เปิด Explore ไม่สำเร็จ"
      />
    </main>
  );
}
