"use client";

import {
  ApiRequestError,
  getAiComparison,
  getFootballPlayer,
  getFootballTeam,
  listFootballComparisonOptions,
  requestAiComparison,
  type AiComparisonResponse,
  type FootballComparisonOptionsResponseDataItem,
  type FootballPlayerProfile,
  type FootballTeamProfile,
} from "@goal-app/api-client";
import {
  Activity,
  ArrowSeparate as ArrowRightLeft,
  Brain as BrainCircuit,
  Calendar as CalendarDays,
  WarningTriangle as TriangleAlert,
} from "iconoir-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { FootballEntityAvatar } from "@/components/football/entity-avatar";
import { SearchCombobox } from "@/components/shared/search-combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { configureGoalBrowserApi } from "@/lib/api-browser";
import { footballCatalogName as itemName } from "@/lib/football-catalog";

type EntityType = "player" | "team";
type ComparableItem = Extract<
  FootballComparisonOptionsResponseDataItem,
  { entityType: EntityType }
>;
type EntityProfile = FootballPlayerProfile | FootballTeamProfile;
const emptyCatalogItems: FootballComparisonOptionsResponseDataItem[] = [];

function itemMeta(item: ComparableItem) {
  if (item.entityType === "player") {
    return item.dateOfBirth
      ? `เกิด ${new Date(item.dateOfBirth).toLocaleDateString("th-TH")}`
      : "Player";
  }
  return item.shortCode ?? (item.founded ? `ก่อตั้ง ${item.founded}` : "Team");
}

function configureClient() {
  return configureGoalBrowserApi();
}

function isPlayerProfile(profile: EntityProfile): profile is FootballPlayerProfile {
  return "player" in profile;
}

export function AiComparePanel({
  initialHasMore = false,
  initialItems = emptyCatalogItems,
}: {
  initialHasMore?: boolean;
  initialItems?: FootballComparisonOptionsResponseDataItem[];
}) {
  const initialPlayers = useMemo(
    () => initialItems.filter((item): item is ComparableItem => item.entityType === "player"),
    [initialItems],
  );
  const [entityType, setEntityType] = useState<EntityType>("player");
  const [left, setLeft] = useState<ComparableItem | null>(null);
  const [right, setRight] = useState<ComparableItem | null>(null);
  const [leftProfile, setLeftProfile] = useState<EntityProfile | null>(null);
  const [rightProfile, setRightProfile] = useState<EntityProfile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<AiComparisonResponse | null>(null);
  const [status, setStatus] = useState<AiComparisonResponse["status"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const pollingDeadline = useRef<number | null>(null);

  useEffect(() => {
    try {
      const supabase = configureClient();
      void supabase.auth.getSession().then(({ data }) => {
        setSignedIn(Boolean(data.session));
      });
    } catch {
      void Promise.resolve().then(() => {
        setError("ยังไม่ได้ตั้งค่า API สำหรับเบราว์เซอร์");
      });
    }
  }, []);

  useEffect(() => {
    if (!comparisonId || (status !== "queued" && status !== "running")) {
      pollingDeadline.current = null;
      return;
    }
    pollingDeadline.current ??= Date.now() + 3 * 60_000;

    const poll = () => {
      if (pollingDeadline.current && Date.now() >= pollingDeadline.current) {
        setError("การเปรียบเทียบใช้เวลานานกว่าปกติ กรุณาลองส่งคำขอใหม่");
        return;
      }
      configureClient();
      void getAiComparison(comparisonId)
        .then((value) => {
          setComparison(value);
          setStatus(value.status);
          if (value.status === "failed") {
            setError("AI ไม่สามารถสร้างผลเปรียบเทียบจากข้อมูลชุดนี้ได้");
          }
        })
        .catch(() => setError("อัปเดตผลเปรียบเทียบไม่ได้ชั่วคราว"));
    };

    const initialPoll = window.setTimeout(poll, 750);
    const interval = window.setInterval(poll, 5_000);
    return () => {
      window.clearTimeout(initialPoll);
      window.clearInterval(interval);
    };
  }, [comparisonId, status]);

  const loadProfile = useCallback(async (side: "left" | "right", item: ComparableItem) => {
    try {
      configureClient();
      const profile =
        item.entityType === "player"
          ? await getFootballPlayer(item.id)
          : await getFootballTeam(item.id);
      if (side === "left") setLeftProfile(profile);
      else setRightProfile(profile);
    } catch {
      if (side === "left") setLeftProfile(null);
      else setRightProfile(null);
    }
  }, []);

  const selectEntity = (side: "left" | "right", item: ComparableItem) => {
    setComparison(null);
    setComparisonId(null);
    setStatus(null);
    setError(null);
    if (side === "left") {
      setLeft(item);
      setLeftProfile(null);
    } else {
      setRight(item);
      setRightProfile(null);
    }
    void loadProfile(side, item);
  };

  const changeEntityType = (nextType: EntityType) => {
    setEntityType(nextType);
    setLeft(null);
    setRight(null);
    setLeftProfile(null);
    setRightProfile(null);
    setComparison(null);
    setComparisonId(null);
    setStatus(null);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!left || !right) {
      setError(`กรุณาเลือก${entityType === "player" ? "นักเตะ" : "ทีม"}ทั้งสองฝั่ง`);
      return;
    }
    if (left.id === right.id) {
      setError("ต้องเลือกข้อมูลสองฝั่งที่ต่างกัน");
      return;
    }
    if (!signedIn) {
      setError("กรุณาเข้าสู่ระบบก่อนใช้ AI Comparison");
      return;
    }

    setRequesting(true);
    setComparison(null);
    try {
      configureClient();
      pollingDeadline.current = Date.now() + 3 * 60_000;
      const queued = await requestAiComparison({
        entityType,
        language: "th",
        leftId: left.id,
        rightId: right.id,
      });
      setComparisonId(queued.comparisonId);
      setStatus(queued.status);
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError && requestError.status === 429
          ? "ใช้สิทธิ์ AI ครบสำหรับวันนี้แล้ว"
          : requestError instanceof ApiRequestError && requestError.status === 401
            ? "กรุณาเข้าสู่ระบบใหม่ก่อนใช้ AI Comparison"
            : "ส่งคำขอเปรียบเทียบไม่ได้ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง",
      );
    } finally {
      setRequesting(false);
    }
  };

  const result = comparison?.result ?? null;
  const isWorking = requesting || status === "queued" || status === "running";

  return (
    <main className="min-h-screen bg-[#0d0e12]">
      <section className="border-b border-border bg-[#0d0e12]/95">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 md:px-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge className="mb-4 gap-2" variant="outline">
              <span
                className={`size-2 rounded-full ${isWorking ? "animate-pulse bg-primary" : "bg-primary"}`}
              />
              {isWorking ? "Engine Processing" : "Engine Ready"}
            </Badge>
            <h1 className="font-headline text-4xl leading-none tracking-[0.035em] uppercase sm:text-5xl">
              Matchup Engine
            </h1>
            <p className="sr-only">Player vs Player · Team vs Team</p>
          </div>
          <AiVerdict
            leftName={left ? itemName(left) : null}
            result={result}
            rightName={right ? itemName(right) : null}
            signedIn={signedIn}
          />
        </div>
      </section>

      <form
        className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 py-8 md:px-8"
        onSubmit={submit}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-label text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
            Compare mode:
          </span>
          <ToggleGroup
            aria-label="ประเภทการเปรียบเทียบ"
            onValueChange={(value) => value && changeEntityType(value as EntityType)}
            type="single"
            value={entityType}
            variant="outline"
          >
            <ToggleGroupItem value="player">Player vs Player</ToggleGroupItem>
            <ToggleGroupItem value="team">Team vs Team</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <section className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[1fr_4rem_1fr]">
          <ComparisonSide
            entityType={entityType}
            excludedId={right?.id ?? null}
            initialHasMore={entityType === "player" && initialHasMore}
            initialItems={entityType === "player" ? initialPlayers : []}
            item={left}
            label="A"
            onSelect={(item) => selectEntity("left", item)}
          />

          <div className="flex items-center justify-center lg:flex-col">
            <span className="h-px flex-1 bg-border lg:h-auto lg:w-px" />
            <span className="goal-news-ai-glow grid size-12 shrink-0 place-items-center border border-border bg-surface-elevated font-headline text-2xl text-primary">
              VS
            </span>
            <span className="h-px flex-1 bg-border lg:h-auto lg:w-px" />
          </div>

          <ComparisonSide
            entityType={entityType}
            excludedId={left?.id ?? null}
            initialHasMore={entityType === "player" && initialHasMore}
            initialItems={entityType === "player" ? initialPlayers : []}
            item={right}
            label="B"
            onSelect={(item) => selectEntity("right", item)}
          />
        </section>

        <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          {!signedIn ? (
            <Button asChild className="rounded-none" size="lg">
              <Link href="/login">เข้าสู่ระบบเพื่อใช้ AI Compare</Link>
            </Button>
          ) : (
            <Button
              className="rounded-none"
              disabled={!left || !right || isWorking}
              size="lg"
              type="submit"
            >
              <ArrowRightLeft />
              {isWorking ? "AI กำลังเปรียบเทียบ…" : "เริ่ม AI Comparison"}
            </Button>
          )}
          {left && right ? (
            <span className="text-center font-label text-[0.65rem] tracking-[0.08em] text-muted-foreground uppercase">
              ใช้โปรไฟล์ล่าสุดจาก API-Football และบริบทการแข่งขันที่ Goal ตรวจสอบแล้ว
            </span>
          ) : null}
        </div>

        {error ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription className="text-current">{error}</AlertDescription>
          </Alert>
        ) : null}

        <ComparisonDimensions result={result} />

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RecentContext item={left} profile={leftProfile} side="A" />
          <RecentContext item={right} profile={rightProfile} side="B" />
        </section>

        {result?.caveats.length ? (
          <p className="border-l-2 border-primary pl-4 text-xs leading-6 text-muted-foreground">
            <strong className="font-label text-primary uppercase">Data caveat:</strong>{" "}
            {result.caveats.join(" · ")}
          </p>
        ) : null}
      </form>
    </main>
  );
}

function AiVerdict({
  leftName,
  result,
  rightName,
  signedIn,
}: {
  leftName: string | null;
  result: NonNullable<AiComparisonResponse["result"]> | null;
  rightName: string | null;
  signedIn: boolean;
}) {
  let message = "เลือกข้อมูลสองฝั่ง แล้วให้ AI เปรียบเทียบจากโปรไฟล์และการแข่งขันที่ตรวจสอบได้";
  if (leftName && rightName && !signedIn) {
    message = `พร้อมเปรียบเทียบ ${leftName} กับ ${rightName} หลังเข้าสู่ระบบ`;
  } else if (leftName && rightName) {
    message = `พร้อมวิเคราะห์ ${leftName} เทียบกับ ${rightName}`;
  }
  if (result) message = result.verdict;

  return (
    <Card className="goal-news-ai-glow relative w-full overflow-hidden bg-surface/70 backdrop-blur-xl lg:max-w-2xl">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent"
      />
      <CardContent className="relative flex gap-4 p-4">
        <BrainCircuit className="size-8 shrink-0 text-primary" />
        <div>
          <p className="font-label text-[0.65rem] font-bold tracking-[0.12em] text-primary uppercase">
            AI Verdict {result ? `· Confidence ${Math.round(result.confidence * 100)}%` : ""}
          </p>
          {result ? (
            <h2 className="mt-1 font-headline text-xl uppercase">{result.headline}</h2>
          ) : null}
          <p className="mt-1 text-sm leading-6 text-foreground-warm">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonSide({
  entityType,
  excludedId,
  initialHasMore,
  initialItems,
  item,
  label,
  onSelect,
}: {
  entityType: EntityType;
  excludedId: number | null;
  initialHasMore: boolean;
  initialItems: ComparableItem[];
  item: ComparableItem | null;
  label: "A" | "B";
  onSelect: (item: ComparableItem) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <EntitySearch
        entityType={entityType}
        excludedId={excludedId}
        initialHasMore={initialHasMore}
        initialItems={initialItems}
        item={item}
        key={`${entityType}-${label}`}
        label={label}
        onSelect={onSelect}
      />
      <EntityProfileCard entityType={entityType} item={item} label={label} />
    </div>
  );
}

function EntitySearch({
  entityType,
  excludedId,
  initialHasMore,
  initialItems,
  item,
  label,
  onSelect,
}: {
  entityType: EntityType;
  excludedId: number | null;
  initialHasMore: boolean;
  initialItems: ComparableItem[];
  item: ComparableItem | null;
  label: "A" | "B";
  onSelect: (item: ComparableItem) => void;
}) {
  const [query, setQuery] = useState(item ? itemName(item) : "");
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const loadingMoreRef = useRef(false);
  const latestQueryRef = useRef(query.trim());

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length === 1 || (!normalized && initialItems.length > 0)) return;
    latestQueryRef.current = normalized;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setHasMore(false);
      configureClient();
      void listFootballComparisonOptions(
        { entityType, page: 1, perPage: 20, q: normalized || undefined },
        { signal: controller.signal },
      )
        .then((result) => {
          setItems(
            result.data.filter(
              (candidate): candidate is ComparableItem => candidate.entityType === entityType,
            ),
          );
          setHasMore(result.hasMore);
          setPage(result.page);
          setError(false);
        })
        .catch((cause: unknown) => {
          if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [entityType, initialHasMore, initialItems, query]);

  const loadMore = useCallback(() => {
    const normalized = query.trim();
    if (!open || !hasMore || loading || loadingMoreRef.current || normalized.length === 1) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    configureClient();
    void listFootballComparisonOptions({
      entityType,
      page: page + 1,
      perPage: 20,
      q: normalized || undefined,
    })
      .then((result) => {
        if (latestQueryRef.current !== normalized) return;
        const additions = result.data.filter(
          (candidate): candidate is ComparableItem => candidate.entityType === entityType,
        );
        setItems((current) => {
          const known = new Set(
            current.map((candidate) => `${candidate.entityType}-${candidate.id}`),
          );
          return [
            ...current,
            ...additions.filter(
              (candidate) => !known.has(`${candidate.entityType}-${candidate.id}`),
            ),
          ];
        });
        setHasMore(result.hasMore);
        setPage(result.page);
        setError(false);
      })
      .catch(() => {
        if (latestQueryRef.current === normalized) {
          setError(true);
          setHasMore(false);
        }
      })
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [entityType, hasMore, loading, open, page, query]);

  const visibleItems = items.filter((candidate) => candidate.id !== excludedId);
  const entityLabel = entityType === "player" ? "Player" : "Team";

  return (
    <div className="relative z-20">
      <SearchCombobox
        aria-label={`ค้นหา ${entityLabel} ${label}`}
        autoComplete="off"
        className="h-16 border-0 border-b-2 border-border bg-surface-elevated focus-within:ring-0"
        emptyContent="ไม่พบข้อมูลที่ตรงกับคำค้นหา"
        getItemKey={(candidate) => `${candidate.entityType}-${candidate.id}`}
        getItemValue={(candidate) => `${itemName(candidate)} ${itemMeta(candidate)}`}
        hasMore={hasMore}
        inputClassName="font-headline text-xl sm:text-2xl"
        items={visibleItems}
        loading={loading}
        loadingMore={loadingMore}
        maxLength={80}
        onChange={(event) => {
          const nextQuery = event.target.value;
          const normalized = nextQuery.trim();
          latestQueryRef.current = normalized;
          setQuery(nextQuery);
          setOpen(true);
          setHasMore(false);
          if (!normalized && initialItems.length > 0) {
            setItems(initialItems);
            setHasMore(initialHasMore);
            setPage(1);
            setError(false);
          }
        }}
        onFocus={() => setOpen(true)}
        onItemSelect={(candidate) => {
          const selectedName = itemName(candidate);
          latestQueryRef.current = selectedName.trim();
          setQuery(selectedName);
          setOpen(false);
          onSelect(candidate);
        }}
        onLoadMore={loadMore}
        onOpenChange={setOpen}
        open={open}
        placeholder={`Search ${entityLabel} ${label}...`}
        renderItem={(candidate) => (
          <>
            <EntityAvatar item={candidate} small />
            <span className="min-w-0">
              <span className="block truncate font-headline text-lg uppercase">
                {itemName(candidate)}
              </span>
              <span className="block font-label text-[0.6rem] tracking-[0.08em] text-muted-foreground uppercase">
                {itemMeta(candidate)} · ID {candidate.id}
              </span>
            </span>
          </>
        )}
        statusContent={
          query.trim().length === 1 ? (
            "พิมพ์อย่างน้อย 2 ตัวอักษร"
          ) : loading ? (
            <span className="font-label text-xs text-primary uppercase">Searching…</span>
          ) : error && visibleItems.length === 0 ? (
            <span className="text-destructive">โหลดข้อมูลฟุตบอลไม่สำเร็จ</span>
          ) : undefined
        }
        value={query}
      />
    </div>
  );
}

function EntityProfileCard({
  entityType,
  item,
  label,
}: {
  entityType: EntityType;
  item: ComparableItem | null;
  label: "A" | "B";
}) {
  return (
    <Card className="goal-scanline relative min-h-40 overflow-hidden bg-background">
      <CardContent className="flex min-h-40 items-center gap-4 p-4 sm:gap-5">
        {item ? (
          <EntityAvatar item={item} />
        ) : (
          <div className="size-24 shrink-0 border border-dashed border-border bg-surface" />
        )}
        <div className="min-w-0">
          <p className="font-label text-[0.65rem] tracking-[0.12em] text-primary uppercase">
            {entityType} {label}
          </p>
          <p className="mt-2 truncate font-headline text-3xl leading-none uppercase sm:text-4xl">
            {item ? itemName(item) : `Select ${entityType}`}
          </p>
          {item ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">{itemMeta(item)}</Badge>
              <Badge variant="outline">ID {item.id}</Badge>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">ค้นหาและเลือกจากข้อมูลล่าสุด</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EntityAvatar({ item, small = false }: { item: ComparableItem; small?: boolean }) {
  const name = itemName(item);
  return (
    <FootballEntityAvatar
      className={small ? "size-11" : "size-24"}
      imageClassName="object-cover grayscale transition hover:grayscale-0"
      imageUrl={item.imageUrl}
      name={name}
    />
  );
}

function ComparisonDimensions({
  result,
}: {
  result: NonNullable<AiComparisonResponse["result"]> | null;
}) {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="font-label text-xs tracking-[0.16em] text-muted-foreground">
          Evidence Dimensions Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {result ? (
          <div className="space-y-3">
            {result.dimensions.map((dimension) => (
              <article
                className="grid gap-3 border-b border-border py-4 last:border-0 md:grid-cols-[1fr_9rem_1fr] md:items-center"
                key={dimension.name}
              >
                <div
                  className={`border-l-2 p-3 md:text-right ${dimension.edge === "left" ? "border-primary bg-primary/5" : "border-border bg-surface-elevated"}`}
                >
                  <p className="text-sm leading-6">{dimension.left}</p>
                </div>
                <div className="text-center">
                  <p className="font-headline text-lg tracking-[0.03em] uppercase text-muted-foreground">
                    {dimension.name}
                  </p>
                  <p className="mt-1 font-label text-[0.6rem] tracking-[0.1em] text-primary uppercase">
                    {dimension.edge === "even" ? "Even" : `${dimension.edge} edge`}
                  </p>
                </div>
                <div
                  className={`border-r-2 p-3 ${dimension.edge === "right" ? "border-primary bg-primary/5" : "border-border bg-surface-elevated"}`}
                >
                  <p className="text-sm leading-6">{dimension.right}</p>
                </div>
                <p className="text-sm leading-6 text-muted-foreground md:col-span-3 md:text-center">
                  {dimension.explanation}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid min-h-40 place-items-center text-center">
            <div>
              <Activity className="mx-auto size-7 text-primary" />
              <p className="mt-3 font-headline text-2xl uppercase">
                Select two profiles to compare
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                ผลลัพธ์จะแสดงเฉพาะมิติที่ AI สรุปได้จากข้อมูลจริง ไม่สร้างคะแนน Pace หรือ xG
                เพิ่มเอง
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentContext({
  item,
  profile,
  side,
}: {
  item: ComparableItem | null;
  profile: EntityProfile | null;
  side: "A" | "B";
}) {
  return (
    <Card className="bg-surface-elevated">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <p className="font-label text-[0.6rem] tracking-[0.12em] text-primary uppercase">
            Side {side}
          </p>
          <h2 className="mt-1 font-label text-xs font-bold tracking-[0.12em] uppercase">
            Verified Recent Context
          </h2>
        </div>
        <CalendarDays className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {!item ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            เลือกข้อมูลเพื่อดูประวัติล่าสุด
          </p>
        ) : !profile ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            ยังไม่มีรายละเอียดโปรไฟล์จาก Football API
          </p>
        ) : isPlayerProfile(profile) ? (
          profile.recentFixtures.length > 0 ? (
            <div className="divide-y divide-border font-label text-xs">
              {profile.recentFixtures.slice(0, 5).map((fixture) => (
                <Link
                  className="grid grid-cols-[4.5rem_1fr_auto] gap-3 py-3 hover:text-primary"
                  href={`/match/${fixture.fixtureId}`}
                  key={fixture.fixtureId}
                >
                  <time dateTime={fixture.startsAt}>
                    {new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short" }).format(
                      new Date(fixture.startsAt),
                    )}
                  </time>
                  <span className="truncate">{fixture.fixtureName}</span>
                  <span className="text-muted-foreground">#{fixture.jerseyNumber ?? "–"}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              ยังไม่มีการแข่งขันล่าสุด
            </p>
          )
        ) : profile.fixtures.length > 0 ? (
          <div className="divide-y divide-border font-label text-xs">
            {profile.fixtures.slice(0, 5).map((fixture) => (
              <Link
                className="grid grid-cols-[4.5rem_1fr_auto] gap-3 py-3 hover:text-primary"
                href={`/match/${fixture.id}`}
                key={fixture.id}
              >
                <time dateTime={fixture.startsAt}>
                  {new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short" }).format(
                    new Date(fixture.startsAt),
                  )}
                </time>
                <span className="truncate">{fixture.name}</span>
                <span className="text-muted-foreground">
                  {fixture.homeScore === null || fixture.awayScore === null
                    ? fixture.state.code
                    : `${fixture.homeScore}–${fixture.awayScore}`}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีการแข่งขันล่าสุด</p>
        )}
      </CardContent>
    </Card>
  );
}
