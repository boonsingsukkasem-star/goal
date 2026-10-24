import type { Metadata } from "next";
import { connection } from "next/server";

import { goalApi } from "@/lib/api";
import { ExploreCatalog } from "./explore-catalog";

export const metadata: Metadata = {
  description: "ค้นพบลีก สโมสร และนักฟุตบอลจากข้อมูล API-Football ผ่าน GOAL",
  title: "Football Discovery Hub",
};

export default async function ExplorePage() {
  await connection();
  const results = await Promise.allSettled([
    goalApi().exploreFootballCatalog({ limit: 12, types: "league" }),
    goalApi().exploreFootballCatalog({ limit: 12, types: "team" }),
    goalApi().exploreFootballCatalog({ limit: 12, types: "player" }),
  ]);
  const initial = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value.data : [],
  );

  return (
    <ExploreCatalog
      initial={initial}
      initialError={results.every((result) => result.status === "rejected")}
    />
  );
}
