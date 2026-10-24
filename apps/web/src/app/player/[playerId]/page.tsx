import { ApiRequestError } from "@goal-app/api-client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { FavoriteButton } from "@/components/community/favorite-button";
import {
  FootballProfileHeader,
  FootballProfilePage,
  FootballProfilePanel,
} from "@/components/football/profile-shell";
import { StatePanel } from "@/components/shared/state-panel";
import { goalApi } from "@/lib/api";

export default async function PlayerPage({ params }: { params: Promise<{ playerId: string }> }) {
  await connection();
  const id = Number((await params).playerId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const profile = await goalApi()
    .getFootballPlayer(id)
    .catch((error: unknown) => {
      if (error instanceof ApiRequestError && error.status === 404) notFound();
      throw error;
    });
  return (
    <FootballProfilePage>
      <FootballProfileHeader
        action={<FavoriteButton entityId={profile.player.id} entityType="player" />}
        description={
          profile.player.dateOfBirth
            ? `เกิด ${new Date(profile.player.dateOfBirth).toLocaleDateString("th-TH", { dateStyle: "long" })}`
            : "Football player"
        }
        eyebrow="Player profile"
        imageUrl={profile.player.imageUrl}
        title={profile.player.displayName}
      />
      <FootballProfilePanel className="mt-5" title="การแข่งขันล่าสุด">
        <div className="space-y-3">
          {profile.recentFixtures.length === 0 ? (
            <StatePanel
              className="min-h-40 border-0 bg-transparent"
              description="การแข่งขันที่นักเตะมีส่วนร่วมจะแสดงเมื่อผู้ให้บริการมีข้อมูล"
              title="ยังไม่มีข้อมูลการแข่งขันล่าสุด"
            />
          ) : (
            profile.recentFixtures.map((fixture) => (
              <Link
                className="block border border-border bg-background p-4 hover:border-primary/60"
                href={`/match/${fixture.fixtureId}`}
                key={fixture.fixtureId}
              >
                <p className="font-semibold">{fixture.fixtureName}</p>
                <p className="mt-1 font-label text-xs text-muted-foreground">
                  {new Date(fixture.startsAt).toLocaleString("th-TH", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {fixture.jerseyNumber ? ` · หมายเลข ${fixture.jerseyNumber}` : ""}
                </p>
              </Link>
            ))
          )}
        </div>
      </FootballProfilePanel>
    </FootballProfilePage>
  );
}
