import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { goalApi } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { AccountDashboard } from "./account-dashboard";

export const metadata: Metadata = {
  description: "จัดการโปรไฟล์ ทีมและนักเตะที่ติดตาม รวมถึงการแจ้งเตือนฟุตบอลของคุณ",
  title: "โปรไฟล์และการตั้งค่า",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; linked?: string; updated?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: sessionData } = await supabase.auth.getSession();
  const apiProfile = sessionData.session
    ? await goalApi()
        .getMyProfile({
          headers: { authorization: `Bearer ${sessionData.session.access_token}` },
        })
        .catch(() => null)
    : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_url,created_at,display_name,locale,timezone")
    .eq("user_id", userData.user.id)
    .single();
  const providers = (userData.user.app_metadata.providers as string[] | undefined) ?? [];
  const metadata = userData.user.user_metadata as Record<string, unknown>;
  const metadataName = [metadata.display_name, metadata.full_name, metadata.name].find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  const metadataAvatar = [metadata.avatar_url, metadata.picture].find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.startsWith("https://"),
  );

  return (
    <AccountDashboard
      feedback={{
        error: params.error,
        linked: Boolean(params.linked),
        updated: Boolean(params.updated),
      }}
      user={{
        avatarUrl: apiProfile?.avatarUrl ?? profile?.avatar_url ?? metadataAvatar ?? null,
        createdAt: apiProfile?.createdAt ?? profile?.created_at ?? userData.user.created_at,
        displayName: apiProfile?.displayName ?? profile?.display_name ?? metadataName ?? "แฟนบอล",
        email: apiProfile?.email ?? userData.user.email ?? "",
        locale: apiProfile?.locale ?? profile?.locale ?? "th-TH",
        providers: apiProfile?.providers ?? providers,
        timezone: apiProfile?.timezone ?? profile?.timezone ?? "Asia/Bangkok",
      }}
    />
  );
}
