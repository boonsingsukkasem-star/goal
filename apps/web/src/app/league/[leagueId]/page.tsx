import { ApiRequestError } from "@goal-app/api-client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { FavoriteButton } from "@/components/community/favorite-button";
import { FixtureList } from "@/components/football/fixture-list";
import {
  FootballProfileHeader,
  FootballProfilePage,
  FootballProfilePanel,
} from "@/components/football/profile-shell";
import { StatePanel } from "@/components/shared/state-panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { goalApi } from "@/lib/api";

export default async function LeaguePage({ params }: { params: Promise<{ leagueId: string }> }) {
  await connection();
  const id = Number((await params).leagueId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const profile = await goalApi()
    .getFootballLeague(id)
    .catch((error: unknown) => {
      if (error instanceof ApiRequestError && error.status === 404) notFound();
      throw error;
    });
  return (
    <FootballProfilePage className="max-w-6xl">
      <FootballProfileHeader
        action={<FavoriteButton entityId={profile.league.id} entityType="league" />}
        description={[profile.league.shortCode, profile.season?.name, profile.league.type]
          .filter(Boolean)
          .join(" · ")}
        eyebrow="League profile"
        imageUrl={profile.league.imageUrl}
        title={profile.league.name}
      />
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <FootballProfilePanel title="ตารางคะแนน">
          {profile.standings.length === 0 ? (
            <StatePanel
              className="min-h-40 border-0 bg-transparent"
              description={
                profile.standingsStatus?.state === "plan_limited"
                  ? "แพ็กเกจ API-Football ปัจจุบันไม่เปิดให้เข้าถึงตารางคะแนนฤดูกาลนี้"
                  : profile.standingsStatus?.state === "unsupported"
                    ? "ผู้ให้บริการไม่รองรับตารางคะแนนสำหรับรายการและฤดูกาลนี้"
                    : profile.standingsStatus?.state === "error"
                      ? "ดึงตารางคะแนนไม่สำเร็จ ระบบจะลองใหม่ภายหลัง"
                      : "ตารางคะแนนจะแสดงเมื่อผู้ให้บริการมีข้อมูลสำหรับฤดูกาลปัจจุบัน"
              }
              title="ยังไม่มีข้อมูลตารางคะแนน"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[30rem]">
                <TableHeader className="font-label text-xs text-muted-foreground uppercase">
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>ทีม</TableHead>
                    <TableHead className="text-right">แข่ง</TableHead>
                    <TableHead className="text-right">GD</TableHead>
                    <TableHead className="text-right">แต้ม</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profile.standings.map((row) => (
                    <TableRow key={`${row.groupName ?? ""}:${row.team.id}`}>
                      <TableCell className="font-label text-primary">{row.position}</TableCell>
                      <TableCell>
                        <Link
                          className="font-semibold hover:text-primary"
                          href={`/team/${row.team.id}`}
                        >
                          {row.team.name}
                          {row.groupName && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {row.groupName}
                            </span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.details.PLAYED ?? row.details.OVERALL_MATCHES_PLAYED ?? "–"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.details.GOAL_DIFFERENCE ?? row.details.OVERALL_GOAL_DIFFERENCE ?? "–"}
                      </TableCell>
                      <TableCell className="text-right font-bold">{row.points}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </FootballProfilePanel>
        <FootballProfilePanel title="โปรแกรมล่าสุด">
          <FixtureList fixtures={profile.fixtures} />
        </FootballProfilePanel>
      </div>
    </FootballProfilePage>
  );
}
