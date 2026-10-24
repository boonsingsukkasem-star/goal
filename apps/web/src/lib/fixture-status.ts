import type { FootballFixturePageDataItem } from "@goal-app/api-client";
type Fixture = Pick<FootballFixturePageDataItem, "state" | "startsAt" | "isLive">;
export function isFixtureFinished(fixture: Fixture) {
  return ["FT", "AET", "PEN", "AWD", "WO"].includes(fixture.state.code ?? "");
}
export function isFixtureUpcoming(fixture: Fixture) {
  return ["NS", "TBD"].includes(fixture.state.code ?? "");
}
const labels: Record<string, string> = {
  "1H": "ครึ่งแรก",
  HT: "HT",
  "2H": "ครึ่งหลัง",
  FT: "FT",
  ET: "ต่อเวลา",
  AET: "AET",
  PEN: "FT · จุดโทษ",
  P: "ดวลจุดโทษ",
  PST: "เลื่อนแข่ง",
  SUSP: "พักการแข่งขัน",
  CANC: "ยกเลิก",
  TBD: "รอยืนยันเวลา",
  WO: "ชนะบาย",
  ABD: "ยุติการแข่งขัน",
  AWD: "ตัดสินผล",
  INT: "หยุดชั่วคราว",
  BT: "พักช่วงต่อเวลา",
  LIVE: "LIVE",
};
export function fixtureStatus(fixture: Fixture) {
  if (fixture.state.code !== "NS")
    return labels[fixture.state.code ?? ""] ?? fixture.state.name ?? "รออัปเดต";
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(fixture.startsAt));
}
