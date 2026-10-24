# ADR 0002 — Authentication surface

Status: accepted

## Decision

- Core live scores, fixtures, tables, profiles, and news are usable anonymously.
- Accounts unlock favorites, followed matches, personalization, community signals, and notification
  preferences.
- Phase 2 providers are email/password, Facebook, Google, and Sign in with Apple on iOS.
- Web sessions use Secure, SameSite=Lax cookies that remain browser-readable for Supabase refresh
  rotation; auth responses are private/no-store. Native sessions use PKCE/deep links and OS-backed
  secure storage. The NestJS API validates Supabase JWTs through the project's JWKS endpoint.

## Native identity rules

Sign in with Apple is required in every iOS release that exposes account login. The native client
uses `expo-apple-authentication` and exchanges the Apple identity token with Supabase Auth. Email,
Google, Facebook, and Apple identities that resolve to the same verified user must be linked through
an explicit, reauthenticated account-linking flow; the client must not merge accounts based only on
unverified profile fields.

Account creation also requires in-app account deletion, provider-token revocation, and removal of
associated personal data. Phase 2 is not complete until those flows pass native-device tests.
