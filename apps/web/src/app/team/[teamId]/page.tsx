import { ApiRequestError } from "@goal-app/api-client";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { FavoriteButton } from "@/components/community/favorite-button";
import { FixtureList } from "@/components/football/fixture-list";
import {
  FootballProfileHeader,
  FootballProfilePage,
  FootballProfilePanel,
} from "@/components/football/profile-shell";
import { goalApi } from "@/lib/api";

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  await connection();
  const id = Number((await params).teamId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const profile = await goalApi()
    .getFootballTeam(id)
    .catch((error: unknown) => {
      if (error instanceof ApiRequestError && error.status === 404) notFound();
      throw error;
    });
  return (
    <FootballProfilePage>
      <FootballProfileHeader
        action={<FavoriteButton entityId={profile.team.id} entityType="team" />}
        description={
          [profile.team.shortCode, profile.team.founded ? `ก่อตั้ง ${profile.team.founded}` : null]
            .filter(Boolean)
            .join(" · ") || "Football club"
        }
        eyebrow="Team profile"
        imageUrl={profile.team.imageUrl}
        title={profile.team.name}
      />
      <FootballProfilePanel className="mt-5" title="โปรแกรมและผลการแข่งขัน">
        <FixtureList fixtures={profile.fixtures} />
      </FootballProfilePanel>
    </FootballProfilePage>
  );
}
