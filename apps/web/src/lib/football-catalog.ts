import type { FootballCatalogResponseDataItem } from "@goal-app/api-client";

export function footballCatalogName(item: FootballCatalogResponseDataItem): string {
  return item.entityType === "player" ? item.displayName : item.name;
}

export function footballCatalogHref(item: FootballCatalogResponseDataItem): string {
  return `/${item.entityType}/${item.id}`;
}

export function footballCatalogDetail(item: FootballCatalogResponseDataItem): string {
  if (item.entityType === "league") return item.type ?? item.shortCode ?? "League";
  if (item.entityType === "team") {
    return (
      [item.shortCode, item.founded ? `ก่อตั้ง ${item.founded}` : null]
        .filter(Boolean)
        .join(" · ") || "Football club"
    );
  }
  return item.dateOfBirth ? `เกิดปี ${item.dateOfBirth.slice(0, 4)}` : "Football player";
}
