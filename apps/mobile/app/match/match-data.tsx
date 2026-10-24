import type { FootballFixtureDetail } from "@goal-app/api-client";
import { Link } from "expo-router";
import { Text, View } from "react-native";

function valueLabel(value: number | string | null | undefined): string {
  return value === null || value === undefined || value === "" ? "–" : String(value);
}

export function MatchData({ fixture }: { fixture: FootballFixtureDetail }) {
  const home = fixture.participants.find((item) => item.location === "home")?.team;
  const away = fixture.participants.find((item) => item.location === "away")?.team;
  const formation = new Map(fixture.formations.map((item) => [item.teamId, item.formation]));
  const teamName = new Map(fixture.participants.map(({ team }) => [team.id, team.name]));
  const momentum = fixture.momentum
    .slice()
    .sort(
      (left, right) =>
        right.minute - left.minute ||
        (right.extraMinute ?? 0) - (left.extraMinute ?? 0) ||
        right.id - left.id,
    )
    .slice(0, 12);
  const stats = new Map<string, { label: string; values: Map<number, number | string | null> }>();
  for (const item of fixture.statistics) {
    const key = item.typeCode ?? String(item.typeId);
    const group = stats.get(key) ?? {
      label: item.typeName ?? item.typeCode ?? `Statistic ${item.typeId}`,
      values: new Map(),
    };
    group.values.set(item.teamId, item.value);
    stats.set(key, group);
  }
  return (
    <>
      <View className="mt-4 rounded-[28px] border border-border bg-surface p-6">
        <Text className="font-headline-thai text-3xl text-foreground">เหตุการณ์สำคัญ</Text>
        <View className="mt-5 gap-4">
          {fixture.events.length === 0 ? (
            <Text className="font-body-thai text-sm text-muted">ยังไม่มีเหตุการณ์ในเกม</Text>
          ) : (
            fixture.events.map((event) => (
              <View className="flex-row gap-4 border-b border-border pb-3" key={event.id}>
                <Text className="w-12 font-label text-base text-primary">
                  {event.minute ?? "–"}&apos;{event.extraMinute ? `+${event.extraMinute}` : ""}
                </Text>
                <View className="flex-1">
                  <Text className="font-body-thai text-foreground">
                    {event.playerName ?? event.typeName ?? event.info ?? `Event ${event.typeId}`}
                    {event.relatedPlayerName ? ` → ${event.relatedPlayerName}` : ""}
                  </Text>
                  <Text className="font-label text-sm text-muted">
                    {[event.typeName, event.result, event.info].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </View>
      <View className="mt-4 rounded-[28px] border border-border bg-surface p-6">
        <Text className="font-headline-thai text-3xl text-foreground">แผนและรายชื่อผู้เล่น</Text>
        {fixture.lineups.length === 0 && fixture.formations.length === 0 ? (
          <Text className="mt-4 font-body-thai text-sm text-muted">ยังไม่มีการประกาศรายชื่อ</Text>
        ) : (
          <View className="mt-5 gap-5">
            {[home, away]
              .filter((team): team is NonNullable<typeof team> => Boolean(team))
              .map((team) => (
                <View className="rounded-2xl bg-background p-4" key={team.id}>
                  <View className="flex-row items-center justify-between gap-3">
                    <Link
                      className="flex-1 font-headline-thai text-xl text-foreground"
                      href={{ pathname: "/team/[teamId]", params: { teamId: team.id } }}
                    >
                      {team.name}
                    </Link>
                    <Text className="rounded-full bg-primary px-3 py-1 font-label text-black">
                      {formation.get(team.id) ?? "–"}
                    </Text>
                  </View>
                  <View className="mt-4 gap-2">
                    {fixture.lineups
                      .filter((row) => row.teamId === team.id)
                      .sort(
                        (a, b) =>
                          (a.formationPosition ?? 999) - (b.formationPosition ?? 999) ||
                          (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999),
                      )
                      .map((player) => (
                        <Link
                          className="rounded-xl border border-border px-3 py-2 font-body-thai text-foreground"
                          href={{
                            pathname: "/player/[playerId]",
                            params: { playerId: player.playerId },
                          }}
                          key={player.id}
                        >
                          {player.jerseyNumber ?? "–"} · {player.playerName}
                        </Link>
                      ))}
                  </View>
                </View>
              ))}
          </View>
        )}
      </View>
      <View className="mt-4 rounded-[28px] border border-border bg-surface p-6">
        <Text className="font-headline-thai text-3xl text-foreground">สถิติการแข่งขัน</Text>
        {stats.size === 0 ? (
          <Text className="mt-4 font-body-thai text-sm text-muted">ยังไม่มีสถิติการแข่งขัน</Text>
        ) : (
          <View className="mt-4">
            {[...stats.entries()].map(([key, group]) => (
              <View className="flex-row items-center border-b border-border py-3" key={key}>
                <Text className="w-16 text-center font-headline text-xl text-foreground">
                  {valueLabel(home ? group.values.get(home.id) : null)}
                </Text>
                <Text className="flex-1 text-center font-body-thai text-sm text-muted">
                  {group.label}
                </Text>
                <Text className="w-16 text-center font-headline text-xl text-foreground">
                  {valueLabel(away ? group.values.get(away.id) : null)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <View className="mt-4 rounded-[28px] border border-border bg-surface p-6">
        <Text className="font-headline-thai text-3xl text-foreground">รายละเอียดสกอร์</Text>
        {fixture.scores.length === 0 ? (
          <Text className="mt-4 font-body-thai text-sm text-muted">ยังไม่มีรายละเอียดสกอร์</Text>
        ) : (
          <View className="mt-4 gap-2">
            {fixture.scores.map((score, index) => (
              <View
                className="flex-row justify-between rounded-xl bg-background p-3"
                key={`${score.description}-${index}`}
              >
                <Text className="font-body-thai text-foreground">
                  {score.description} ·{" "}
                  {score.teamId
                    ? (teamName.get(score.teamId) ?? `Team ${score.teamId}`)
                    : (score.location ?? "match")}
                </Text>
                <Text className="font-headline text-xl text-primary">{score.goals ?? "–"}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      {momentum.length > 0 ? (
        <View className="mt-4 rounded-[28px] border border-accent/40 bg-surface p-6">
          <Text className="font-headline-thai text-3xl text-foreground">โมเมนตัมเกมรุก · GOAL</Text>
          <Text className="mt-1 font-body-thai text-xs text-muted">
            โมเมนตัมล่าสุดจากข้อมูลการแข่งขันจริง
          </Text>
          <View className="mt-4 gap-2">
            {momentum.map((point) => (
              <View
                className="flex-row items-center gap-3 border-b border-border py-2"
                key={point.id}
              >
                <Text className="w-14 font-label text-accent">
                  {point.minute}&apos;{point.extraMinute ? `+${point.extraMinute}` : ""}
                </Text>
                <Text className="flex-1 font-body-thai text-sm text-foreground">
                  {teamName.get(point.teamId) ?? `Team ${point.teamId}`}
                </Text>
                <Text className="font-headline text-xl text-primary">{point.value.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}
