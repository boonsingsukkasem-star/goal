export const appConfig = {
  bundleIdentifier: "th.co.goal.app",
  codename: "Goal",
  defaultLocale: "th-TH",
  domain: "goal.co.th",
  environments: ["nonprod", "prod"],
  navigation: ["home", "live", "match", "ai-analysis", "news", "explore"],
} as const;

export const defaultTimeZone = "Asia/Bangkok";

export type FixtureRangeMode = "results" | "today" | "upcoming";

export function getDateKey(date = new Date(), timeZone = defaultTimeZone): string {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function getBangkokDayWindow(dateKey = getDateKey()): { from: string; to: string } {
  const from = new Date(`${dateKey}T00:00:00+07:00`);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 1);
  to.setUTCMilliseconds(to.getUTCMilliseconds() - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function getFixtureRange(mode: FixtureRangeMode, date = new Date()) {
  const today = new Date(getBangkokDayWindow(getDateKey(date)).from);
  const from = new Date(today);
  const to = new Date(today);

  if (mode === "results") {
    from.setUTCDate(from.getUTCDate() - 30);
    to.setUTCMilliseconds(to.getUTCMilliseconds() - 1);
  } else if (mode === "today") {
    to.setUTCDate(to.getUTCDate() + 1);
    to.setUTCMilliseconds(to.getUTCMilliseconds() - 1);
  } else {
    from.setUTCDate(from.getUTCDate() + 1);
    to.setUTCDate(to.getUTCDate() + 31);
    to.setUTCMilliseconds(to.getUTCMilliseconds() - 1);
  }

  return { from: from.toISOString(), to: to.toISOString() };
}
