# Phase 2 — Authentication and user foundation

Status: implementation complete; provider-console and physical-device release gates remain.

## Delivered

- Email/password, Google, and Facebook authentication on web and native clients.
- Native Sign in with Apple on iOS using the system button, a one-time nonce, and Supabase ID-token
  exchange.
- Explicit OAuth identity linking from the account screen. Apple linking is available on iOS.
- Secure, SameSite=Lax web session cookies refreshed by the Next.js proxy. They intentionally remain
  browser-readable because the Supabase browser client owns refresh-token rotation; authentication
  responses are marked private/no-store.
- Native PKCE/deep-link handling with chunked Keychain/Keystore session storage through Expo
  SecureStore.
- Supabase `profiles` ownership, automatic profile creation, forced RLS, and cross-user pgTAP tests.
- NestJS JWKS validation with strict issuer, audience, role, expiry, and UUID subject checks.
- Immediate post-deletion JWT denylisting, transactional account deletion, pseudonymized deletion
  evidence, and Apple token revocation when a fresh authorization code is available.
- Daily Vercel Cron retention cleanup with authorization, idempotent execution records, retry after
  failure, 180-day audit retention, and expired denylist cleanup.
- Dependency-aware readiness checks and production environment validation.

Public football and news browsing remains anonymous. Authentication is required only for user-owned
features.

## Deployment configuration

Create separate nonprod and prod values for every variable in each `.env.example`. In Supabase Auth:

1. Enable email/password, Google, Facebook, and Apple providers.
2. Use an asymmetric JWT signing key so the API can verify access tokens through the project JWKS.
3. Add `https://goal.co.th/auth/callback`, the nonprod callback, and `goal://auth/callback` to the
   exact redirect allowlist.
4. Enable manual identity linking and keep automatic linking limited to Supabase's verified identity
   rules.
5. Group the Apple Service ID and native App ID correctly, and use `th.co.goal.app` as the native
   client identifier.

The Vercel API project's root directory is `apps/api`; its `src/main.ts` is detected by Vercel's
native NestJS support, and `vercel.json` registers the retention Cron. The web project's root is
`apps/web`.

## Release gates still requiring external access

- Complete provider-console setup with real nonprod/prod credentials.
- Exercise sign-up, confirmation, login, refresh, logout, linking, Apple revocation, and deletion
  against nonprod.
- Run the native matrix on physical iOS and Android devices, then complete nonprod EAS builds.
- Deploy nonprod Vercel projects and verify the real Function, Cron, Firewall, cookie, redirect, and
  region behavior.
- Obtain final Thai legal review and fill in the legal entity and postal address.
