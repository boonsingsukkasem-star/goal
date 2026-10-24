import type { Metadata } from "next";
import { getFixtureRange } from "@goal-app/config";
import { connection } from "next/server";

import { goalApi } from "@/lib/api";
import { FixturesBrowser } from "./fixtures-browser";

export const metadata: Metadata = {
  description: "โปรแกรมการแข่งขันและผลฟุตบอลย้อนหลังจาก GOAL",
  title: "Fixtures & Results",
};

export default async function FixturesPage() {
  await connection();
  const { from, to } = getFixtureRange("today");
  const initial = await goalApi()
    .listFootballFixtures({ from, limit: 50, to })
    .then((page) => ({ error: false, page }))
    .catch(() => ({ error: true, page: { data: [], nextCursor: null } }));

  return (
    <FixturesBrowser
      initial={initial.page}
      initialError={initial.error}
      initialRange={{ from, to }}
    />
  );
}
