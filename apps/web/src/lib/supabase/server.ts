import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicEnvironment } from "./env";

const secureCookies = process.env.NODE_ENV === "production";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { key, url } = getSupabasePublicEnvironment();

  return createServerClient(url, key, {
    auth: { flowType: "pkce" },
    cookieOptions: {
      sameSite: "lax",
      secure: secureCookies,
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, options, value }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; proxy.ts performs token refresh.
        }
      },
    },
  });
}
