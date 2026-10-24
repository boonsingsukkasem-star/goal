# 0002 — API-Football and independent application identities

Status: accepted, 2026-09-18. Supersedes the provider/catalog portions of 0001.

Use API-Football behind the existing NestJS API. Persist GOAL IDs separately from unique upstream
IDs; client routes, favorites, follows, AI and news reference GOAL identities. Archive prior provider
rows without silently mapping an ID to a different entity. Preserve user/Auth data.

Use Supabase Cloud for catalog/read models, atomic ingestion, request quotas, locks and queue ledgers.
Free-plan limits constrain polling and detail coverage; the UI reports freshness and availability.
Keep xG factual and nullable. Compute versioned attacking activity from consecutive measurements;
AI explains available evidence and cannot substitute invented xG or measured pressure values.

See the cutover runbook for the deployed schema and operating constraints.
