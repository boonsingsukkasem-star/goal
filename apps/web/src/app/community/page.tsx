import type { Metadata } from "next";
import Link from "next/link";

import { CommunityDashboard } from "./community-dashboard";

export const metadata: Metadata = {
  description: "รายการโปรด แมตช์ที่ติดตาม Feed ส่วนตัว และการตั้งค่าแจ้งเตือนฟุตบอล",
  title: "Community & Personalized Feed",
};

export default function CommunityPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-label text-xs tracking-[0.2em] text-accent uppercase">Goal for you</p>
          <h1 className="mt-1 font-headline text-5xl font-bold">Community &amp; alerts</h1>
        </div>
        <Link className="font-label text-sm text-primary" href="/live">
          ดูโปรแกรมการแข่งขัน →
        </Link>
      </header>
      <CommunityDashboard />
    </main>
  );
}
