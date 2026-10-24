"use client";

import {
  addMyFavorite,
  exploreFootballCatalog,
  getNotificationPreferences,
  listMyFavorites,
  listMyMatchFollows,
  removeMyFavorite,
  unfollowMatch,
  updateNotificationPreferences,
  type FavoritesResponseDataItem,
  type FootballCatalogResponseDataItem,
  type MatchFollowsResponseDataItem,
  type NotificationPreferences,
} from "@goal-app/api-client";
import {
  BellNotification as BellRing,
  Clock as Clock3,
  Link as Link2,
  LogOut,
  Google,
  Facebook,
  HalfMoon as Moon,
  EditPencil as Pencil,
  Plus,
  ShieldAlert,
  Star,
  Trash as Trash2,
} from "iconoir-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { FavoriteChip } from "@/components/community/favorite-chip";
import { FollowedMatchRow } from "@/components/community/followed-match-row";
import { FootballEntityAvatar } from "@/components/football/entity-avatar";
import { SearchCombobox } from "@/components/shared/search-combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { configureGoalBrowserApi } from "@/lib/api-browser";
import { footballCatalogName as catalogName } from "@/lib/football-catalog";
import { deleteAccount, linkProvider, signOut, updateProfile } from "@/lib/auth/actions";

const defaultPreferences: NotificationPreferences = {
  aiContext: true,
  allowLiveDuringQuietHours: false,
  goal: true,
  halftimeFulltime: true,
  kickoffReminder: true,
  lineup: true,
  newsBreaking: false,
  quietHoursEnabled: true,
  quietHoursEnd: "07:30",
  quietHoursStart: "22:30",
  redCard: true,
  substitution: false,
  timezone: "Asia/Bangkok",
  trendingNews: false,
  yellowCard: false,
};

type BooleanPreferenceKey = {
  [Key in keyof NotificationPreferences]: NotificationPreferences[Key] extends boolean
    ? Key
    : never;
}[keyof NotificationPreferences];

const alertGroups: Array<{
  description: string;
  key: BooleanPreferenceKey;
  label: string;
}> = [
  { description: "เตือนก่อนการแข่งขันเริ่ม", key: "kickoffReminder", label: "Match Start" },
  { description: "ประตูสำคัญจากแมตช์ที่ติดตาม", key: "goal", label: "Goals" },
  { description: "การไล่ออกจากสนาม", key: "redCard", label: "Red Cards" },
  { description: "ผลช่วงพักครึ่งและหลังจบเกม", key: "halftimeFulltime", label: "Half / Full Time" },
  { description: "รายชื่อผู้เล่นตัวจริง", key: "lineup", label: "Lineups" },
  { description: "การเปลี่ยนตัวระหว่างเกม", key: "substitution", label: "Substitutions" },
  { description: "ใบเหลืองจากแมตช์ที่ติดตาม", key: "yellowCard", label: "Yellow Cards" },
  { description: "AI อธิบายบริบทของเกม", key: "aiContext", label: "AI Context" },
  { description: "ข่าวด่วนของทีมและนักเตะที่ติดตาม", key: "newsBreaking", label: "Breaking News" },
  { description: "ข่าวฟุตบอลที่กำลังมาแรง", key: "trendingNews", label: "Trending News" },
];

type AccountUser = {
  avatarUrl: string | null;
  createdAt: string;
  displayName: string;
  email: string;
  locale: string;
  providers: string[];
  timezone: string;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ToggleRow({
  checked,
  description,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <Field
      className="min-h-16 border border-border bg-[#1a1b1f] px-4 py-3 transition-colors hover:border-[#4c4546]"
      data-disabled={disabled || undefined}
      orientation="horizontal"
    >
      <FieldContent>
        <FieldLabel
          className="font-body text-sm font-medium normal-case tracking-normal"
          htmlFor={id}
        >
          {label}
        </FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Switch checked={checked} disabled={disabled} id={id} onCheckedChange={onCheckedChange} />
    </Field>
  );
}

export function AccountDashboard({
  feedback,
  user,
}: {
  feedback: { error?: string; linked: boolean; updated: boolean };
  user: AccountUser;
}) {
  const [editing, setEditing] = useState(false);
  const [favorites, setFavorites] = useState<FavoritesResponseDataItem[]>([]);
  const [follows, setFollows] = useState<MatchFollowsResponseDataItem[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    ...defaultPreferences,
    timezone: user.timezone,
  });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FootballCatalogResponseDataItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [dirtyPreferences, setDirtyPreferences] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const configure = useCallback(() => {
    configureGoalBrowserApi();
  }, []);

  const loadPrivateData = useCallback(async () => {
    configure();
    const [favoriteResult, followResult, preferenceResult] = await Promise.allSettled([
      listMyFavorites(),
      listMyMatchFollows(),
      getNotificationPreferences(),
    ]);
    if (favoriteResult.status === "fulfilled") setFavorites(favoriteResult.value.data);
    if (followResult.status === "fulfilled") setFollows(followResult.value.data);
    if (preferenceResult.status === "fulfilled") {
      setPreferences(preferenceResult.value);
      setDirtyPreferences(false);
    }
    if (
      [favoriteResult, followResult, preferenceResult].some(
        (result) => result.status === "rejected",
      )
    ) {
      throw new Error("Some account data could not be loaded");
    }
  }, [configure]);

  useEffect(() => {
    void Promise.resolve()
      .then(loadPrivateData)
      .catch(() => setMessage("โหลดข้อมูลการติดตามและการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่"))
      .finally(() => setLoading(false));
  }, [loadPrivateData]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      configure();
      void exploreFootballCatalog(
        { limit: 8, q: normalized, types: "team,player,league" },
        { signal: controller.signal },
      )
        .then((result) => setResults(result.data))
        .catch((cause: unknown) => {
          if (!(cause instanceof DOMException && cause.name === "AbortError")) {
            setMessage("ค้นหาทีม นักเตะ หรือลีกไม่ได้ในขณะนี้");
          }
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [configure, query]);

  const groupedFavorites = useMemo(
    () => ({
      league: favorites.filter((favorite) => favorite.entityType === "league"),
      player: favorites.filter((favorite) => favorite.entityType === "player"),
      team: favorites.filter((favorite) => favorite.entityType === "team"),
    }),
    [favorites],
  );

  const changePreference = (key: BooleanPreferenceKey, checked: boolean) => {
    setPreferences((current) => ({ ...current, [key]: checked }));
    setDirtyPreferences(true);
  };

  const addFavorite = async (item: FootballCatalogResponseDataItem) => {
    const key = `add-${item.entityType}-${item.id}`;
    setBusyKey(key);
    setMessage(null);
    try {
      configure();
      await addMyFavorite(item.entityType, item.id);
      const favoriteResult = await listMyFavorites();
      setFavorites(favoriteResult.data);
      setQuery("");
      setResults([]);
      setSearchOpen(false);
      setMessage(`ติดตาม ${catalogName(item)} แล้ว`);
    } catch {
      setMessage("เพิ่มรายการติดตามไม่สำเร็จ");
    } finally {
      setBusyKey(null);
    }
  };

  const removeFavorite = async (favorite: FavoritesResponseDataItem) => {
    const key = `remove-${favorite.entityType}-${favorite.entityId}`;
    setBusyKey(key);
    setMessage(null);
    try {
      configure();
      await removeMyFavorite(favorite.entityType, favorite.entityId);
      setFavorites((current) =>
        current.filter(
          (item) => item.entityId !== favorite.entityId || item.entityType !== favorite.entityType,
        ),
      );
      setMessage(`เลิกติดตาม ${favorite.name} แล้ว`);
    } catch {
      setMessage("ลบรายการติดตามไม่สำเร็จ");
    } finally {
      setBusyKey(null);
    }
  };

  const removeFollow = async (fixtureId: number) => {
    setBusyKey(`follow-${fixtureId}`);
    setMessage(null);
    try {
      configure();
      await unfollowMatch(fixtureId);
      setFollows((current) => current.filter((follow) => follow.fixtureId !== fixtureId));
      setMessage(`ยกเลิกติดตาม Match #${fixtureId} แล้ว`);
    } catch {
      setMessage("ยกเลิกติดตามแมตช์ไม่สำเร็จ");
    } finally {
      setBusyKey(null);
    }
  };

  const savePreferences = async () => {
    setBusyKey("preferences");
    setMessage(null);
    try {
      configure();
      const saved = await updateNotificationPreferences(preferences);
      setPreferences(saved);
      setDirtyPreferences(false);
      setMessage("บันทึกการแจ้งเตือนแล้ว");
    } catch {
      setMessage("บันทึกการแจ้งเตือนไม่สำเร็จ");
    } finally {
      setBusyKey(null);
    }
  };

  const username = user.email.split("@")[0] || "goal-fan";
  const memberYear = new Date(user.createdAt).getFullYear();

  return (
    <main className="mx-auto min-h-[calc(100vh-4.75rem)] w-full max-w-[1440px] px-4 py-8 md:px-8 md:py-10">
      <section className="flex flex-col items-center gap-6 border-b border-border pb-8 text-center sm:flex-row sm:items-start sm:text-left">
        <div className="relative shrink-0">
          <FootballEntityAvatar
            className="size-32 border-2 text-5xl md:size-40"
            fallback={initials(user.displayName)}
            imageClassName="object-cover grayscale transition duration-300 hover:grayscale-0"
            imageUrl={user.avatarUrl}
            name={`รูปโปรไฟล์ของ ${user.displayName}`}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 to-transparent"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center pt-1 sm:items-start">
          <p className="font-label text-xs font-bold tracking-[0.12em] text-primary uppercase">
            Profile &amp; preferences
          </p>
          <h1 className="mt-2 break-words font-headline text-4xl leading-none uppercase sm:text-5xl">
            {user.displayName}
          </h1>
          <p className="mt-3 font-label text-xs tracking-[0.08em] text-muted-foreground uppercase">
            @{username} · Member since {Number.isNaN(memberYear) ? "—" : memberYear}
          </p>
          <Button
            className="mt-5"
            onClick={() => setEditing((current) => !current)}
            variant="outline"
          >
            <Pencil /> {editing ? "Close editor" : "Edit profile"}
          </Button>
        </div>
      </section>

      {(feedback.updated || feedback.linked || feedback.error || message) && (
        <Alert
          aria-live="polite"
          className="mt-5"
          role={feedback.error ? "alert" : "status"}
          variant={feedback.error ? "destructive" : "success"}
        >
          <AlertDescription className={feedback.error ? "text-current" : undefined}>
            {feedback.error
              ? "ดำเนินการไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองใหม่"
              : feedback.updated
                ? "อัปเดตโปรไฟล์แล้ว"
                : feedback.linked
                  ? "เชื่อมต่อบัญชีแล้ว"
                  : message}
          </AlertDescription>
        </Alert>
      )}

      {editing && (
        <Card className="mt-6 shadow-[4px_4px_0_#000]">
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateProfile} className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="profile-display-name">Display name</FieldLabel>
                <Input
                  defaultValue={user.displayName}
                  id="profile-display-name"
                  maxLength={80}
                  name="displayName"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-avatar-url">Avatar URL (HTTPS)</FieldLabel>
                <Input
                  defaultValue={user.avatarUrl ?? ""}
                  id="profile-avatar-url"
                  name="avatarUrl"
                  placeholder="https://..."
                  type="url"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-locale">Language</FieldLabel>
                <NativeSelect defaultValue={user.locale} id="profile-locale" name="locale">
                  <NativeSelectOption value="th-TH">ไทย</NativeSelectOption>
                  <NativeSelectOption value="en-US">English</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-timezone">Timezone</FieldLabel>
                <Input
                  defaultValue={user.timezone}
                  id="profile-timezone"
                  maxLength={64}
                  name="timezone"
                  placeholder="Asia/Bangkok"
                  required
                />
              </Field>
              <Button className="md:col-span-2 md:justify-self-start" type="submit">
                Save profile
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <Card className="shadow-[4px_4px_0_#000]">
            <CardHeader className="flex flex-row items-center gap-2">
              <Star className="size-5 fill-primary text-primary" />
              <CardTitle>Following</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative z-20">
                <SearchCombobox
                  aria-label="ค้นหาทีม นักเตะ หรือลีกเพื่อติดตาม"
                  autoComplete="off"
                  className="border-0 border-b-2 border-[#4c4546] bg-surface-elevated focus-within:ring-0"
                  getItemKey={(item) => `${item.entityType}-${item.id}`}
                  getItemValue={(item) => `${catalogName(item)} ${item.entityType}`}
                  inputClassName="font-label text-xs"
                  isItemDisabled={(item) =>
                    favorites.some(
                      (favorite) =>
                        favorite.entityType === item.entityType && favorite.entityId === item.id,
                    ) || busyKey !== null
                  }
                  items={results}
                  loading={searching}
                  maxLength={80}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setQuery(nextQuery);
                    const ready = nextQuery.trim().length >= 2;
                    setSearchOpen(ready);
                    if (!ready) setResults([]);
                  }}
                  onFocus={() => setSearchOpen(query.trim().length >= 2)}
                  onItemSelect={(item) => void addFavorite(item)}
                  onOpenChange={(nextOpen) => setSearchOpen(nextOpen && query.trim().length >= 2)}
                  open={searchOpen}
                  placeholder="Search teams, players, leagues..."
                  renderItem={(item) => {
                    const alreadyFollowing = favorites.some(
                      (favorite) =>
                        favorite.entityType === item.entityType && favorite.entityId === item.id,
                    );
                    return (
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{catalogName(item)}</span>
                          <span className="font-label text-[0.65rem] tracking-[0.1em] text-muted-foreground uppercase">
                            {item.entityType}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 font-label text-[0.65rem] text-primary uppercase">
                          {alreadyFollowing ? (
                            "Following"
                          ) : (
                            <>
                              <Plus className="size-3" /> Add
                            </>
                          )}
                        </span>
                      </div>
                    );
                  }}
                  statusContent={
                    searching ? (
                      <span className="font-label text-xs text-primary uppercase">Searching…</span>
                    ) : undefined
                  }
                  type="search"
                  value={query}
                />
              </div>

              <div className="mt-6 space-y-5" aria-busy={loading}>
                {(
                  [
                    ["team", "Teams"],
                    ["player", "Players"],
                    ["league", "Leagues"],
                  ] as const
                ).map(([type, label]) => (
                  <section key={type}>
                    <h3 className="border-b border-border pb-1 font-label text-xs tracking-[0.1em] text-muted-foreground uppercase">
                      {label}
                    </h3>
                    <div className="mt-3 flex min-h-9 flex-wrap gap-2">
                      {groupedFavorites[type].map((favorite) => (
                        <FavoriteChip
                          busy={busyKey !== null}
                          href={`/${favorite.entityType}/${favorite.entityId}`}
                          key={`${favorite.entityType}-${favorite.entityId}`}
                          label={favorite.name}
                          onRemove={() => void removeFavorite(favorite)}
                        />
                      ))}
                      {!loading && groupedFavorites[type].length === 0 && (
                        <p className="py-2 text-sm text-muted-foreground">
                          ยังไม่มีรายการที่ติดตาม
                        </p>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-[4px_4px_0_#000]">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Clock3 className="size-5 text-primary" />
                <CardTitle>Followed Matches</CardTitle>
              </div>
              <Button asChild size="sm" variant="ghost">
                <Link href="/fixtures">Find matches</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {!loading && follows.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีแมตช์ที่ติดตาม</p>
              ) : (
                follows.map((follow) => (
                  <FollowedMatchRow
                    action={
                      <Button
                        className="text-muted-foreground hover:text-destructive"
                        disabled={busyKey !== null}
                        onClick={() => void removeFollow(follow.fixtureId)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Unfollow
                      </Button>
                    }
                    fixture={follow.fixture}
                    key={follow.fixtureId}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card className="shadow-[4px_4px_0_#000]">
            <CardHeader className="flex flex-row items-center gap-2">
              <Link2 className="size-5 text-primary" />
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="break-all text-sm text-muted-foreground">{user.email}</p>
              <p className="mt-2 font-label text-[0.65rem] tracking-[0.08em] text-muted-foreground uppercase">
                Connected: {user.providers.length ? user.providers.join(" · ") : "email"}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(["google", "facebook"] as const)
                  .filter((provider) => !user.providers.includes(provider))
                  .map((provider) => {
                    const ProviderIcon = provider === "google" ? Google : Facebook;
                    return (
                      <form action={linkProvider} key={provider}>
                        <input name="provider" type="hidden" value={provider} />
                        <Button size="sm" type="submit" variant="outline">
                          <ProviderIcon /> Connect {provider}
                        </Button>
                      </form>
                    );
                  })}
                <form action={signOut}>
                  <Button size="sm" type="submit" variant="secondary">
                    <LogOut /> Sign out
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader className="flex flex-row items-center gap-2 border-destructive/30">
              <ShieldAlert className="size-5 text-destructive" />
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                เซสชันจะถูกเพิกถอนทันที และข้อมูลส่วนบุคคลจะถูกลบตามนโยบายภายใน 7 วัน
              </p>
              <form action={deleteAccount} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <Field>
                  <FieldLabel className="sr-only" htmlFor="delete-account-confirmation">
                    พิมพ์ DELETE เพื่อยืนยันการลบบัญชี
                  </FieldLabel>
                  <Input
                    className="border-destructive/50 focus-visible:border-destructive focus-visible:ring-destructive/30"
                    id="delete-account-confirmation"
                    name="confirmation"
                    placeholder="พิมพ์ DELETE เพื่อยืนยัน"
                    required
                  />
                </Field>
                <Button type="submit" variant="destructive">
                  <Trash2 /> Delete account
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <Card className="shadow-[4px_4px_0_#000]">
            <CardHeader className="flex flex-row items-center gap-2">
              <BellRing className="size-5 fill-primary/15 text-primary" />
              <CardTitle>Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alertGroups.map((preference) => (
                <ToggleRow
                  checked={Boolean(preferences[preference.key])}
                  description={preference.description}
                  disabled={loading || busyKey === "preferences"}
                  key={preference.key}
                  label={preference.label}
                  onCheckedChange={(checked) => changePreference(preference.key, checked)}
                />
              ))}
              <Button
                className="mt-3 w-full"
                disabled={loading || !dirtyPreferences || busyKey === "preferences"}
                onClick={() => void savePreferences()}
              >
                {busyKey === "preferences" && <Spinner />}
                Save alerts
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-[4px_4px_0_#000]">
            <CardHeader className="flex flex-row items-center gap-2">
              <Moon className="size-5 text-primary" />
              <CardTitle>Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4 py-1">
                <div>
                  <p className="font-medium">Theme</p>
                  <p className="text-xs text-muted-foreground">GOAL high-contrast dark theme</p>
                </div>
                <span className="border border-border bg-surface-elevated px-3 py-1.5 font-label text-xs font-bold text-primary uppercase">
                  Dark
                </span>
              </div>
              <ToggleRow
                checked={preferences.quietHoursEnabled}
                description="พักการแจ้งเตือนตามช่วงเวลาที่กำหนด"
                disabled={loading || busyKey === "preferences"}
                label="Quiet Hours"
                onCheckedChange={(checked) => changePreference("quietHoursEnabled", checked)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel
                    className="text-[0.65rem] text-muted-foreground"
                    htmlFor="quiet-hours-start"
                  >
                    From
                  </FieldLabel>
                  <Input
                    disabled={!preferences.quietHoursEnabled}
                    id="quiet-hours-start"
                    onChange={(event) => {
                      setPreferences((current) => ({
                        ...current,
                        quietHoursStart: event.target.value,
                      }));
                      setDirtyPreferences(true);
                    }}
                    type="time"
                    value={preferences.quietHoursStart}
                  />
                </Field>
                <Field>
                  <FieldLabel
                    className="text-[0.65rem] text-muted-foreground"
                    htmlFor="quiet-hours-end"
                  >
                    To
                  </FieldLabel>
                  <Input
                    disabled={!preferences.quietHoursEnabled}
                    id="quiet-hours-end"
                    onChange={(event) => {
                      setPreferences((current) => ({
                        ...current,
                        quietHoursEnd: event.target.value,
                      }));
                      setDirtyPreferences(true);
                    }}
                    type="time"
                    value={preferences.quietHoursEnd}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel
                  className="text-[0.65rem] text-muted-foreground"
                  htmlFor="notification-timezone"
                >
                  Notification timezone
                </FieldLabel>
                <Input
                  id="notification-timezone"
                  maxLength={64}
                  onChange={(event) => {
                    setPreferences((current) => ({ ...current, timezone: event.target.value }));
                    setDirtyPreferences(true);
                  }}
                  placeholder="Asia/Bangkok"
                  value={preferences.timezone}
                />
              </Field>
              <ToggleRow
                checked={preferences.allowLiveDuringQuietHours}
                description="ให้ประตูและใบแดงผ่าน Quiet Hours"
                disabled={loading || busyKey === "preferences"}
                label="Critical live alerts"
                onCheckedChange={(checked) =>
                  changePreference("allowLiveDuringQuietHours", checked)
                }
              />
              <Button
                className="w-full"
                disabled={loading || !dirtyPreferences || busyKey === "preferences"}
                onClick={() => void savePreferences()}
              >
                Save preferences
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
