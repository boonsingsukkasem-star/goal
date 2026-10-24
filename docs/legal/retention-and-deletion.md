# Data retention and account-deletion SLA

This schedule is a product and engineering baseline, subject to final Thai legal review.

| Data class                              | Retention                                       | Deletion behavior                                                           |
| --------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| Account profile and provider linkage    | Account lifetime                                | Delete within 7 days of a verified request                                  |
| Favorites, follows, preferences         | Account lifetime                                | Cascade-delete with the account                                             |
| Active push tokens                      | Until logout, invalidation, or account deletion | Disable immediately; purge within 30 days                                   |
| Notification delivery logs              | 30 days                                         | Automatic rolling deletion                                                  |
| Raw personalization events              | 180 days                                        | Automatic rolling deletion or earlier account deletion                      |
| AI request/response application records | 30 days                                         | Automatic rolling deletion or earlier account deletion                      |
| AI daily quota ledgers                  | 90 days                                         | Automatic rolling deletion                                                  |
| Public AI news summaries and citations  | 90 days                                         | Automatic rolling deletion; retractions may be immediate                    |
| Per-user news engagement signals        | 90 days                                         | Automatic rolling deletion or immediate account-deletion cascade            |
| News ingestion execution records        | 30 days                                         | Automatic rolling deletion; terminal queue evidence follows queue policy    |
| Acknowledged queue outbox records       | 7 days                                          | Automatic rolling deletion; pending work is never deleted by retention      |
| API and queue-consumer operational logs | 90 days                                         | Rolling deletion; identifiers should be minimized                           |
| Security/audit events                   | 180 days                                        | Anonymize user reference after account deletion where feasible              |
| Support requests                        | 24 months after closure                         | Delete unless needed for an active dispute                                  |
| Encrypted backups                       | 30-day rolling window                           | Expire through backup lifecycle; never restore deleted data into active use |

The `auth-retention` Vercel Cron enforces expired session-denylist cleanup, the 180-day
pseudonymized account-deletion audit window, AI application/usage expiry, and durable queue-evidence
retention. Phase 5 additionally enforces 30-day notification/delivery expiry, disabled-device purge,
and expired fan-presence reconciliation. Unpublished outbox records are preserved for recovery and
operational alerting.
Phase 6 enforces 90-day news/article-engagement expiry, 30-day ingestion-run expiry, and 90-day
system news-budget ledgers through the authenticated News Cron retention pass.

## SLA

1. Acknowledge an in-app deletion request immediately and revoke active application sessions.
2. Disable notifications and personalization immediately.
3. Complete deletion or irreversible anonymization in active systems within 7 calendar days.
4. Send completion confirmation when the active-system deletion finishes.
5. Allow residual encrypted backups to expire within 30 days.

A documented legal hold may override deletion only for the minimum required data and duration. The
final policy must state the legal entity, lawful bases, cross-border safeguards, and contact details.
