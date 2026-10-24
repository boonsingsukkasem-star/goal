"use client";

import { exploreFootballCatalog, type FootballCatalogResponseDataItem } from "@goal-app/api-client";
import {
  ArrowUpRight,
  UserCircle as CircleUserRound,
  Search,
  Shield,
  WarningTriangle as TriangleAlert,
  Trophy,
} from "iconoir-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  FootballEntityAvatar,
  FootballEntityWatermark,
} from "@/components/football/entity-avatar";
import { SearchField } from "@/components/shared/search-field";
import { SectionHeading } from "@/components/shared/section-heading";
import { StatePanel } from "@/components/shared/state-panel";
import { UnderlineTabs } from "@/components/shared/underline-tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { configureGoalBrowserApi } from "@/lib/api-browser";
import {
  footballCatalogDetail as itemDetail,
  footballCatalogHref as itemHref,
  footballCatalogName as itemName,
} from "@/lib/football-catalog";

const allTypes = "league,team,player";
const filters = [
  { label: "All", value: allTypes },
  { label: "Leagues", value: "league" },
  { label: "Clubs", value: "team" },
  { label: "Players", value: "player" },
] as const;
const sourceMeta = (
  <span className="hidden font-label text-[0.65rem] tracking-[0.12em] text-muted-foreground uppercase sm:block">
    Source: API-Football
  </span>
);

function CatalogSectionAction({
  label,
  onViewAll,
}: {
  label: string;
  onViewAll: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {sourceMeta}
      <Button
        aria-label={`ดู${label}ทั้งหมด`}
        className="gap-1.5 text-[0.68rem]"
        onClick={onViewAll}
        size="sm"
        variant="link"
      >
        ดูทั้งหมด
        <ArrowUpRight aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  );
}

type CatalogItem = FootballCatalogResponseDataItem;
type LeagueItem = Extract<CatalogItem, { entityType: "league" }>;
type PlayerItem = Extract<CatalogItem, { entityType: "player" }>;
type TeamItem = Extract<CatalogItem, { entityType: "team" }>;

function CatalogMark({ item, size = "md" }: { item: CatalogItem; size?: "lg" | "md" }) {
  const name = itemName(item);
  const Icon =
    item.entityType === "league" ? Trophy : item.entityType === "team" ? Shield : CircleUserRound;
  return (
    <FootballEntityAvatar
      className={size === "lg" ? "size-16" : "size-12"}
      fallback={<Icon aria-hidden="true" className={size === "lg" ? "size-7" : "size-5"} />}
      imageUrl={item.imageUrl}
      name={name}
    />
  );
}

function LeagueCard({ item }: { item: LeagueItem }) {
  return (
    <Card className="group relative flex min-h-52 flex-col justify-between overflow-hidden bg-[#121317] p-5 transition-colors hover:border-primary">
      <div
        aria-hidden="true"
        className="absolute -top-16 -right-16 size-40 rounded-full bg-primary/8 blur-3xl"
      />
      <div className="relative flex items-start justify-between gap-4">
        <CatalogMark item={item} size="lg" />
        <span className="border border-border bg-surface px-2 py-1 font-label text-[0.62rem] tracking-[0.1em] text-muted-foreground uppercase">
          League
        </span>
      </div>
      <div className="relative mt-7">
        <p className="font-label text-[0.65rem] tracking-[0.12em] text-primary uppercase">
          {item.shortCode ?? item.type ?? "League"}
        </p>
        <Link
          className="mt-1 flex items-end justify-between gap-3 font-headline text-2xl uppercase group-hover:text-primary"
          href={itemHref(item)}
        >
          <span>{item.name}</span>
          <ArrowUpRight className="mb-1 size-5 shrink-0" />
        </Link>
      </div>
    </Card>
  );
}

function TeamCard({ item }: { item: TeamItem }) {
  return (
    <Card className="group relative flex min-h-64 flex-col justify-between overflow-hidden bg-[#121317] p-6 transition-colors hover:border-primary">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 flex w-[46%] items-center justify-center overflow-hidden"
      >
        <FootballEntityWatermark imageUrl={item.imageUrl} />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-primary/7 via-transparent to-transparent"
      />
      <div className="relative flex items-start justify-between gap-4">
        <CatalogMark item={item} size="lg" />
        <span className="border border-border px-2 py-1 font-label text-[0.65rem] tracking-[0.1em] text-muted-foreground uppercase">
          {item.shortCode ?? "Club"}
        </span>
      </div>
      <div className="relative mt-8">
        <h3 className="font-headline text-3xl leading-tight uppercase">{item.name}</h3>
        <p className="mt-2 font-label text-[0.68rem] tracking-[0.1em] text-muted-foreground uppercase">
          {item.founded ? `Established ${item.founded}` : "Football club"}
        </p>
        <Button asChild className="mt-5 w-full" variant="outline">
          <Link href={itemHref(item)}>ดูข้อมูลสโมสร</Link>
        </Button>
      </div>
    </Card>
  );
}

function PlayerCard({ item }: { item: PlayerItem }) {
  return (
    <Card className="group relative overflow-hidden bg-[#121317] transition-colors hover:border-primary">
      <div
        aria-label={item.imageUrl ? `${item.displayName} portrait` : undefined}
        className="relative grid h-52 place-items-center bg-surface-elevated bg-cover bg-top bg-no-repeat grayscale transition group-hover:grayscale-0"
        role={item.imageUrl ? "img" : undefined}
        style={
          item.imageUrl ? { backgroundImage: `url(${JSON.stringify(item.imageUrl)})` } : undefined
        }
      >
        {!item.imageUrl && <CircleUserRound aria-hidden="true" className="size-20 text-border" />}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#121317] via-transparent to-transparent"
        />
      </div>
      <div className="relative -mt-9 p-5 pt-10">
        <p className="font-label text-[0.65rem] tracking-[0.12em] text-primary uppercase">
          Player profile
        </p>
        <h3 className="mt-1 font-headline text-3xl leading-tight uppercase">{item.displayName}</h3>
        <div className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4">
          <p className="font-label text-[0.65rem] tracking-[0.09em] text-muted-foreground uppercase">
            {item.dateOfBirth ? `Born ${item.dateOfBirth.slice(0, 4)}` : "Player profile"}
          </p>
          <Button asChild size="sm">
            <Link href={itemHref(item)}>ดูข้อมูล</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

function EmptySection({ label }: { label: string }) {
  return (
    <StatePanel
      description="ข้อมูลจะแสดงเมื่อ Football Catalog พร้อมใช้งาน"
      icon={Search}
      title={`ยังไม่มีข้อมูล${label}`}
    />
  );
}

function CatalogResultCard({ item }: { item: CatalogItem }) {
  const name = itemName(item);
  return (
    <Link href={itemHref(item)}>
      <Card className="group flex min-h-24 items-center gap-4 bg-[#121317] p-5 transition-colors hover:border-primary">
        <CatalogMark item={item} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-headline text-xl uppercase group-hover:text-primary">
            {name}
          </p>
          <p className="mt-1 truncate font-label text-[0.65rem] tracking-[0.08em] text-muted-foreground uppercase">
            {item.entityType} · {itemDetail(item)}
          </p>
        </div>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
      </Card>
    </Link>
  );
}

export function ExploreCatalog({
  initial,
  initialError = false,
}: {
  initial: CatalogItem[];
  initialError?: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState(allTypes);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const normalizedQuery = query.trim();
  const defaultView = normalizedQuery.length === 0 && types === allTypes;

  useEffect(() => {
    if (defaultView) return;
    if (normalizedQuery.length === 1) {
      return;
    }
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      configureGoalBrowserApi({ optionalAuth: true });
      void exploreFootballCatalog(
        { limit: 30, q: normalizedQuery || undefined, types },
        { signal: controller.signal },
      )
        .then((result) => {
          if (!active) return;
          setItems(result.data);
          setError(false);
        })
        .catch((cause: unknown) => {
          if (active && !(cause instanceof DOMException && cause.name === "AbortError")) {
            setError(true);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [defaultView, initial, normalizedQuery, types]);

  const leagues = useMemo(
    () => initial.filter((item): item is LeagueItem => item.entityType === "league").slice(0, 3),
    [initial],
  );
  const teams = useMemo(
    () => initial.filter((item): item is TeamItem => item.entityType === "team").slice(0, 3),
    [initial],
  );
  const players = useMemo(
    () => initial.filter((item): item is PlayerItem => item.entityType === "player").slice(0, 3),
    [initial],
  );

  return (
    <main className="goal-discovery-grid min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-4 py-10 md:px-8 md:py-16">
        <section aria-labelledby="discovery-title" className="flex flex-col gap-6">
          <div>
            <p className="font-label text-[0.68rem] tracking-[0.18em] text-primary uppercase">
              Football Discovery Hub
            </p>
            <h1
              className="mt-2 font-headline text-5xl leading-none uppercase sm:text-6xl md:text-7xl"
              id="discovery-title"
            >
              Search The Pitch
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              ค้นหาลีก สโมสร และนักเตะจาก Football Catalog แล้วเปิดดูข้อมูลล่าสุดได้ทันที
            </p>
          </div>

          <SearchField
            aria-label="ค้นหาลีก สโมสร หรือนักเตะ"
            autoComplete="off"
            className="h-16 border-0 border-b-2 border-border bg-[#1a1b1f] focus-within:ring-0"
            inputClassName="text-base sm:text-lg"
            loading={loading}
            maxLength={80}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาลีก สโมสร หรือนักเตะ..."
            value={query}
          />

          <UnderlineTabs
            ariaLabel="ประเภทข้อมูล"
            items={filters}
            onValueChange={setTypes}
            value={types}
          />
        </section>

        {defaultView && error ? (
          <section aria-live="polite">
            <StatePanel
              action={
                <Button onClick={() => window.location.reload()} variant="outline">
                  ลองใหม่
                </Button>
              }
              className="border-destructive/60"
              description="ระบบไม่สามารถโหลดลีก สโมสร และนักเตะจาก Football Catalog ได้"
              icon={TriangleAlert}
              title="เชื่อมต่อ Football Catalog ไม่สำเร็จ"
            />
          </section>
        ) : !defaultView ? (
          <section aria-busy={loading} aria-live="polite" className="space-y-5">
            <SectionHeading action={sourceMeta}>ผลการค้นหา</SectionHeading>
            {normalizedQuery.length === 1 ? (
              <Card className="border-dashed p-6 text-muted-foreground">
                พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา
              </Card>
            ) : error ? (
              <StatePanel
                className="border-destructive/60"
                description="กรุณาเปลี่ยนคำค้นหาหรือลองใหม่อีกครั้ง"
                icon={TriangleAlert}
                title="ค้นหาข้อมูลไม่ได้ในขณะนี้"
              />
            ) : items.length === 0 && !loading ? (
              <EmptySection label="ที่ตรงกับคำค้นหา" />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <CatalogResultCard item={item} key={`${item.entityType}-${item.id}`} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="space-y-5">
              <SectionHeading
                action={
                  <CatalogSectionAction label="ลีก" onViewAll={() => setTypes("league")} />
                }
              >
                รายการลีก
              </SectionHeading>
              {leagues.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {leagues.map((item) => (
                    <LeagueCard item={item} key={item.id} />
                  ))}
                </div>
              ) : (
                <EmptySection label="ลีก" />
              )}
            </section>

            <section className="space-y-5">
              <SectionHeading
                action={
                  <CatalogSectionAction label="สโมสร" onViewAll={() => setTypes("team")} />
                }
              >
                รายการสโมสร
              </SectionHeading>
              {teams.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {teams.map((item) => (
                    <TeamCard item={item} key={item.id} />
                  ))}
                </div>
              ) : (
                <EmptySection label="สโมสร" />
              )}
            </section>

            <section className="space-y-5 pb-4">
              <SectionHeading
                action={
                  <CatalogSectionAction label="นักเตะ" onViewAll={() => setTypes("player")} />
                }
              >
                รายการนักเตะ
              </SectionHeading>
              {players.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {players.map((item) => (
                    <PlayerCard item={item} key={item.id} />
                  ))}
                </div>
              ) : (
                <EmptySection label="นักเตะ" />
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
