# Notification defaults and quiet-hours policy

## Permission strategy

Do not ask for notification permission on first launch. Ask after the user follows a team, player,
or match and show the exact value they will receive. Core football content remains usable after a
denial. After permission has been granted, refresh the Expo token at authenticated app startup and
whenever the app returns to the foreground without showing another prompt.

## Default preferences

| Event                                                | Default                      |
| ---------------------------------------------------- | ---------------------------- |
| Kickoff reminder, 15 minutes before a followed match | On                           |
| Goal and score correction for a followed match       | On                           |
| Half-time and full-time result                       | On                           |
| Red card for a followed match                        | On                           |
| Lineup available                                     | On                           |
| Substitution and yellow card                         | Off                          |
| AI momentum/context alert                            | On, high-confidence only     |
| Team/player breaking news                            | Off until explicitly enabled |
| Trending or promotional football news                | Off                          |

## Quiet hours and frequency

- Default quiet hours: 22:30–07:30 in the device timezone; fallback timezone is Asia/Bangkok.
- Quiet hours apply to every category by default, including live matches.
- Users may explicitly enable “allow followed-match live alerts during quiet hours.” It is off by
  default and is never enabled through a dark pattern.
- AI context alerts: at most one per 15 minutes and three per match.
- News: at most two notifications per day per user.
- Deduplicate by user, fixture/event, category, and score/event version.

Store every device independently. Process Expo push receipts, disable `DeviceNotRegistered` tokens,
and require an Expo push access token. On Android, create the notification channel before requesting
permission. When Expo rotates a token, persist the replacement before disabling the previous device.
Notification bodies must avoid sensitive account or AI prompt content on lock screens.
