"use client";

import {
  getNotificationPreferences,
  getPersonalizedFootballFeed,
  listMyFavorites,
  listMyMatchFollows,
  listMyNotifications,
  removeMyFavorite,
  unfollowMatch,
  updateNotificationPreferences,
  type FavoritesResponse,
  type MatchFollowsResponse,
  type NotificationHistoryResponse,
  type NotificationPreferences,
  type PersonalizedFeedResponse,
} from "@goal-app/api-client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FavoriteChip } from "@/components/community/favorite-chip";
import { FollowedMatchRow } from "@/components/community/followed-match-row";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { configureGoalBrowserApi } from "@/lib/api-browser";

const preferenceLabels: Array<[keyof NotificationPreferences, string]> = [
  ["goal", "ประตู"],
  ["redCard", "ใบแดง"],
  ["halftimeFulltime", "พักครึ่ง / จบเกม"],
  ["kickoffReminder", "เตือนก่อนเริ่มแข่ง"],
  ["lineup", "รายชื่อผู้เล่น"],
  ["substitution", "เปลี่ยนตัว"],
  ["yellowCard", "ใบเหลือง"],
  ["aiContext", "AI อธิบายบริบทเกม"],
  ["newsBreaking", "ข่าวด่วนฟุตบอล"],
  ["trendingNews", "ข่าวฟุตบอลมาแรง"],
];

export function CommunityDashboard() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [favorites, setFavorites] = useState<FavoritesResponse["data"]>([]);
  const [follows, setFollows] = useState<MatchFollowsResponse["data"]>([]);
  const [feed, setFeed] = useState<PersonalizedFeedResponse["data"]>([]);
  const [history, setHistory] = useState<NotificationHistoryResponse["data"]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const configure = useCallback(() => {
    return configureGoalBrowserApi();
  }, []);

  const load = useCallback(async () => {
    configure();
    const [favoriteResult, followResult, feedResult, preferenceResult, historyResult] =
      await Promise.all([
        listMyFavorites(),
        listMyMatchFollows(),
        getPersonalizedFootballFeed({ limit: 20 }),
        getNotificationPreferences(),
        listMyNotifications({ limit: 10 }),
      ]);
    setFavorites(favoriteResult.data);
    setFollows(followResult.data);
    setFeed(feedResult.data);
    setPreferences(preferenceResult);
    setHistory(historyResult.data);
  }, [configure]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => configure())
      .then((supabase) => supabase.auth.getSession())
      .then(({ data }) => {
        const authenticated = Boolean(data.session);
        setSignedIn(authenticated);
        if (authenticated) void load().catch(() => setMessage("โหลดข้อมูลส่วนตัวไม่ได้ชั่วคราว"));
      })
      .catch(() => setSignedIn(false));
  }, [configure, load]);

  const savePreferences = async () => {
    if (!preferences) return;
    setBusy(true);
    setMessage(null);
    try {
      configure();
      setPreferences(await updateNotificationPreferences(preferences));
      setMessage("บันทึกการแจ้งเตือนแล้ว");
    } catch {
      setMessage("บันทึกการแจ้งเตือนไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  if (signedIn === null) {
    return (
      <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> กำลังโหลดข้อมูลของคุณ…
      </div>
    );
  }
  if (!signedIn) {
    return (
      <section className="mt-8 rounded-[2rem] border border-primary/30 bg-surface p-8 text-center">
        <h2 className="font-headline text-4xl font-bold">สร้างหน้าฟุตบอลที่เป็นของคุณ</h2>
        <p className="mx-auto mt-3 max-w-xl text-foreground-warm">
          เข้าสู่ระบบเพื่อติดตามทีม นักเตะ ลีก และแมตช์ พร้อมควบคุมการแจ้งเตือนทุกประเภท
        </p>
        <Button asChild className="mt-6">
          <Link href="/login">เข้าสู่ระบบ</Link>
        </Button>
      </section>
    );
  }

  return (
    <div className="mt-8 grid gap-5 lg:grid-cols-2">
      {message && (
        <Alert className="lg:col-span-2" role="status" variant="success">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>รายการโปรด</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            ค้นหาทีม นักเตะ หรือลีก แล้วกดดาวจากหน้าโปรไฟล์
          </p>
          <Button asChild className="mt-4">
            <Link href="/explore">ไปที่ Explore</Link>
          </Button>
          <div className="mt-5 flex flex-wrap gap-2">
            {favorites.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีทีม นักเตะ หรือลีกที่ติดตาม</p>
            ) : (
              favorites.map((favorite) => (
                <FavoriteChip
                  busy={busy}
                  href={`/${favorite.entityType}/${favorite.entityId}`}
                  key={`${favorite.entityType}-${favorite.entityId}`}
                  label={favorite.name}
                  onRemove={() => {
                    setBusy(true);
                    configure();
                    void removeMyFavorite(favorite.entityType, favorite.entityId)
                      .then(load)
                      .catch(() => setMessage("ลบรายการโปรดไม่ได้"))
                      .finally(() => setBusy(false));
                  }}
                  variant="pill"
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>แมตช์ที่ Follow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {follows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              กด Follow ได้จากหน้ารายละเอียดการแข่งขัน
            </p>
          ) : (
            follows.map((follow) => (
              <FollowedMatchRow
                action={
                  <Button
                    className="text-muted-foreground"
                    onClick={() => {
                      setBusy(true);
                      configure();
                      void unfollowMatch(follow.fixtureId)
                        .then(load)
                        .catch(() => setMessage("ยกเลิก Follow ไม่ได้"))
                        .finally(() => setBusy(false));
                    }}
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

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Feed สำหรับคุณ</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {feed.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              เพิ่มรายการโปรดหรือ Follow แมตช์เพื่อสร้าง Feed
            </p>
          ) : (
            feed.map(({ fixture, reasons }) => (
              <Link
                className="rounded-2xl border border-border bg-background p-4"
                href={`/match/${fixture.id}`}
                key={fixture.id}
              >
                <p className="font-label text-xs text-accent">{fixture.league.name}</p>
                <p className="mt-2 font-semibold">
                  {fixture.participants.map(({ team }) => team.name).join(" vs ")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{reasons.join(" · ")}</p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {preferences && (
        <Card>
          <CardHeader>
            <CardTitle>การแจ้งเตือน</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {preferenceLabels.map(([key, label]) => (
                <Field className="flex-row items-center" key={key}>
                  <Checkbox
                    checked={Boolean(preferences[key])}
                    id={`community-pref-${key}`}
                    onCheckedChange={(checked) =>
                      setPreferences((current) =>
                        current ? { ...current, [key]: Boolean(checked) } : current,
                      )
                    }
                  />
                  <FieldLabel
                    className="font-body text-sm normal-case tracking-normal"
                    htmlFor={`community-pref-${key}`}
                  >
                    {label}
                  </FieldLabel>
                </Field>
              ))}
            </div>
            <Field className="mt-5" orientation="horizontal">
              <FieldContent>
                <FieldLabel
                  className="font-body text-sm normal-case tracking-normal"
                  htmlFor="community-quiet-hours"
                >
                  เปิด Quiet hours
                </FieldLabel>
              </FieldContent>
              <Switch
                checked={preferences.quietHoursEnabled}
                id="community-quiet-hours"
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, quietHoursEnabled: checked })
                }
              />
            </Field>
            <div className="mt-3 flex gap-3">
              <Field className="max-w-36">
                <FieldLabel htmlFor="community-quiet-hours-start">เริ่ม</FieldLabel>
                <Input
                  id="community-quiet-hours-start"
                  onChange={(event) =>
                    setPreferences({ ...preferences, quietHoursStart: event.target.value })
                  }
                  type="time"
                  value={preferences.quietHoursStart}
                />
              </Field>
              <Field className="max-w-36">
                <FieldLabel htmlFor="community-quiet-hours-end">สิ้นสุด</FieldLabel>
                <Input
                  id="community-quiet-hours-end"
                  onChange={(event) =>
                    setPreferences({ ...preferences, quietHoursEnd: event.target.value })
                  }
                  type="time"
                  value={preferences.quietHoursEnd}
                />
              </Field>
            </div>
            <Button className="mt-5" disabled={busy} onClick={savePreferences} type="button">
              บันทึก
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ประวัติการแจ้งเตือน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีการแจ้งเตือน</p>
          ) : (
            history.map((item) => (
              <article className="border-b border-border pb-3" key={item.id}>
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-foreground-warm">{item.body}</p>
                <p className="mt-1 font-label text-xs text-muted-foreground">
                  {item.category} · {item.status}
                </p>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
