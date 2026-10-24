import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

type Fixture = {
  awayScore: number | null;
  homeScore: number | null;
  id: number;
  league: { name: string };
  participants: Array<{ location: "away" | "home"; team: { name: string } }>;
  startsAt: string;
};

export function FootballFixtureList({ fixtures }: { fixtures: Fixture[] }) {
  if (fixtures.length === 0) {
    return (
      <Text className="mt-4 font-body-thai text-sm text-muted">
        ยังไม่มีโปรแกรมการแข่งขันในช่วงนี้
      </Text>
    );
  }
  return (
    <View className="mt-5 gap-3">
      {fixtures.map((fixture) => {
        const home =
          fixture.participants.find((item) => item.location === "home")?.team.name ?? "Home";
        const away =
          fixture.participants.find((item) => item.location === "away")?.team.name ?? "Away";
        return (
          <Link
            asChild
            href={{ pathname: "/match/[fixtureId]", params: { fixtureId: fixture.id } }}
            key={fixture.id}
          >
            <Pressable className="rounded-2xl border border-border bg-background p-4">
              <Text className="font-label text-xs text-muted">
                {fixture.league.name} · {new Date(fixture.startsAt).toLocaleString("th-TH")}
              </Text>
              <View className="mt-2 flex-row items-center justify-between gap-3">
                <Text className="flex-1 font-body-thai text-foreground">
                  {home} — {away}
                </Text>
                <Text className="font-headline text-xl text-primary">
                  {fixture.homeScore ?? "–"} : {fixture.awayScore ?? "–"}
                </Text>
              </View>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}
