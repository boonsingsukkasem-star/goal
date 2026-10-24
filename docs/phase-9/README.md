> Historical phase notes. The API-Football cutover supersedes provider, identity and synchronization details here; see [the current runbook](../runbooks/api-football-cutover.md).

# Phase 9 — Deploy, Store review และ Launch

สถานะ: พร้อมเริ่มงาน platform setup แต่ยังไม่พร้อมกด Production/Store review จนกว่าจะปิด external blockers ในเอกสารนี้

อัปเดตข้อกำหนดล่าสุด: 17 สิงหาคม 2026

## เป้าหมาย

นำระบบ Goal ขึ้น `nonprod` ก่อน แล้ว promote ชุดที่ผ่านการตรวจเดียวกันไป `prod` ตามลำดับ
Supabase → API → Web → Mobile จากนั้นส่ง TestFlight/Google Play testing, ผ่าน Store review และเปิดให้ผู้ใช้จริงแบบค่อยเป็นค่อยไป

Phase นี้ไม่เพิ่มเป้าหมาย test coverage, ไม่ทำ load test, ไม่สร้าง release checklist แยก และไม่สร้าง
incident/outage runbook สำหรับ football, AI หรือ news ตาม product direction เดิม Existing quality gates และ
deployment verification ยังต้องผ่านตามปกติ

## Phase 9 แบ่งเป็น 6 ช่วง

1. **Platform setup** — สร้างบัญชี/โปรเจกต์ production, DNS, secrets, OAuth, signing credentials และ EAS project
2. **Nonprod deployment** — deploy Supabase, API, Web และ mobile internal builds ให้ครบทั้งระบบ
3. **Store readiness** — ปิด legal, privacy, account deletion URL, assets, screenshots และ store metadata
4. **Production deployment** — deploy database/API/Web, เปิด domain จริง และตรวจ Cron/Queues/notifications
5. **Store review** — ส่ง TestFlight และ Play testing ก่อนส่ง Apple/Google review
6. **Launch** — manual/phased release, เฝ้าดู platform metrics และขยาย rollout เมื่อสัญญาณปกติ

## สิ่งที่ repository มีแล้ว

- Monorepo `pnpm` + Turborepo และ production quality command `pnpm check`
- Vercel projects แยกได้ด้วย root directory `apps/api` และ `apps/web`
- API production environment validation, structured logs, health/readiness endpoints และ Swagger ที่ปิดโดย default ใน prod
- Vercel Cron 7 รายการ และ Queue consumers 4 topics ใน `apps/api/vercel.json`
- Supabase migrations, RLS, database tests, retention และ transactional account deletion
- Environment แยก `nonprod` / `prod`
- Expo EAS profiles `development`, `nonprod`, `prod`
- iOS bundle identifier และ Android package เป็น `th.co.goal.app`
- Email/password, Google, Facebook และ native Sign in with Apple บน iOS
- In-app account deletion, Apple token revocation และ push notification registration
- Public `/privacy`, `/support`, `/account-deletion` pages และ legal/support links ทั้ง Web/Mobile
- Production Web build gate ที่ป้องกันการเผยแพร่ privacy policy หากข้อมูลนิติบุคคลหรือวันที่ legal review ยังไม่ครบ
- Expo SDK 57 ซึ่ง target Android API 36 ตาม SDK matrix ปัจจุบัน

## External blockers ที่ต้องปิดก่อน Store review

1. นำชื่อนิติบุคคล/ที่อยู่จริงมาใส่ใน Web environment, ให้ที่ปรึกษากฎหมายไทยตรวจ privacy policy
   และบันทึกวันที่มีผล/วันที่ตรวจจริง ห้ามใส่ข้อมูลสมมติ
2. เพิ่ม production app icon, Android adaptive foreground icon, splash assets และตรวจ safe area ทุกขนาดจอ
3. Link Expo project เพราะ `apps/mobile/app.json` ยังไม่มี `extra.eas.projectId` และ `updates.url`; หากไม่มี
   project ID การขอ Expo push token จะล้มเหลว
4. สร้าง Apple Developer/App Store Connect และ Google Play Console records ให้ตรงกับ `th.co.goal.app`
5. ตั้ง APNs, FCM v1, App Store Connect API key และ Google Play service account credentials
6. สร้าง production credentials จริงของ Supabase, Google, Facebook, Apple, Sportmonks, OpenAI, Expo และ SMTP
7. จัดทำ store copy, screenshots, review notes, demo account, App Privacy/Data safety และ content rating
8. ยืนยันสิทธิ์ใช้ข้อมูล/โลโก้ฟุตบอลและแนวทางการใช้ข่าว/ลิงก์อ้างอิงกับ Sportmonks และเจ้าของเนื้อหา
9. ยอมรับความเสี่ยงของ Vercel Queues ซึ่งยังเป็น Public Beta ณ วันที่เอกสารนี้อัปเดต หรือเปลี่ยน platform ก่อน launch หากนโยบายบริษัทอนุญาตเฉพาะ GA

## Target topology

| Environment | Web                          | API                              | Supabase                 | EAS channel |
| ----------- | ---------------------------- | -------------------------------- | ------------------------ | ----------- |
| nonprod     | `https://nonprod.goal.co.th` | `https://api.nonprod.goal.co.th` | Supabase nonprod project | `nonprod`   |
| prod        | `https://goal.co.th`         | `https://api.goal.co.th`         | Supabase prod project    | `prod`      |

แนะนำให้มี Vercel 4 projects เพื่อไม่ให้ production secrets ไหลเข้า Preview โดยไม่ตั้งใจ:

- `goal-web-nonprod` — Root Directory `apps/web`
- `goal-api-nonprod` — Root Directory `apps/api`
- `goal-web-prod` — Root Directory `apps/web`
- `goal-api-prod` — Root Directory `apps/api`

`www.goal.co.th` ให้ redirect ไป `goal.co.th` เพียง canonical domain เดียว ส่วน Supabase custom domain เป็น
optional paid add-on ไม่ใช่ blocker; ใช้ `<project-ref>.supabase.co` ได้หาก OAuth consent และ legal ยอมรับ

## Access ที่ต้องเตรียม

- Domain/DNS ของ `goal.co.th`
- Vercel team ที่เปิด Fluid compute, Cron, Runtime Cache, Queues และ Firewall ได้ตาม limits ที่ระบบต้องใช้
- Supabase organization ที่เปิด MFA และมี Owner อย่างน้อย 2 คน
- Expo organization และ EAS Build/Submit/Update access
- Apple Developer Program แบบ Organization ถ้ามีนิติบุคคล และ App Store Connect access
- Google Play Console organization account และการยืนยันตัวตน/ข้อมูลติดต่อ
- Google Cloud/Firebase project สำหรับ FCM v1 และ Google OAuth
- Meta Developer app สำหรับ Facebook Login
- Sportmonks production plan/token
- OpenAI production project พร้อม budget/usage limits
- SMTP provider และ mailbox ที่ใช้งานจริง เช่น `support@goal.co.th`, `privacy@goal.co.th`

ผู้ดูแลทุก platform ต้องเปิด MFA และเก็บ recovery/ownership ให้มีอย่างน้อย 2 คน ห้ามเก็บ private keys,
Supabase secret/legacy service-role keys หรือ store service-account JSON ใน repository

## Environment variables

### API — Vercel `goal-api-*`

อ้างอิงรายการ canonical จาก `apps/api/.env.example` และตั้งแยกทุก environment

| Variable                         | Production guidance                                                  |
| -------------------------------- | -------------------------------------------------------------------- |
| `NODE_ENV`                       | `production`                                                         |
| `APP_ENV`                        | `nonprod` หรือ `prod` ให้ตรง project                                 |
| `APP_VERSION`                    | Git release/app version เดียวกับ mobile เช่น `1.0.0`                 |
| `CORS_ORIGINS`                   | exact web origins เท่านั้น; prod ห้ามมี localhost                    |
| `SWAGGER_ENABLED`                | `true` เฉพาะ nonprod, `false` ใน prod                                |
| `LOG_LEVEL`                      | `info` ใน prod                                                       |
| `TRUST_PROXY`                    | เปลี่ยนเป็น `true` เฉพาะเมื่อยืนยัน proxy/IP behavior บน Vercel แล้ว |
| `BODY_LIMIT`                     | คง `1mb` ถ้าไม่มี endpoint ที่ต้องใหญ่กว่า                           |
| `CRON_SECRET`                    | random อย่างน้อย 32 bytes; prod/nonprod คนละค่า                      |
| `SUPABASE_URL`                   | URL ของ environment นั้น                                             |
| `SUPABASE_PUBLISHABLE_KEY`       | publishable key ของ environment นั้น                                 |
| `SUPABASE_SECRET_KEY`            | `sb_secret_...`; hosted API project เท่านั้น                         |
| `SPORTMONKS_*`                   | production/nonprod token และ timeout                                 |
| `OPENAI_*`                       | environment-specific API key, approved model, timeout                |
| `AI_AUTO_LEAGUE_IDS`             | prod ต้องมีอย่างน้อย 1 league และต้องอยู่ใน Sportmonks plan          |
| `AI_DAILY_REQUEST_LIMIT`         | user budget ที่อนุมัติแล้ว                                           |
| `AI_SYSTEM_DAILY_LIMIT`          | automatic analysis budget ที่อนุมัติแล้ว                             |
| `NEWS_*`                         | approved domains, topics, languages และ daily budget                 |
| `EXPO_PUSH_ACCESS_TOKEN`         | Expo push access token; API project เท่านั้น                         |
| `EXPO_PUSH_BASE_URL`             | ใช้ default Expo URL เว้นแต่มี controlled override                   |
| `APPLE_CLIENT_ID`                | `th.co.goal.app` สำหรับ native revocation flow                       |
| `APPLE_TEAM_ID` / `APPLE_KEY_ID` | Apple production identifiers                                         |
| `APPLE_PRIVATE_KEY_BASE64`       | base64 ของ `.p8`; API project เท่านั้น                               |

### Web — Vercel `goal-web-*`

| Variable                               | prod                          |
| -------------------------------------- | ----------------------------- |
| `NEXT_PUBLIC_API_URL`                  | `https://api.goal.co.th`      |
| `GOAL_API_URL`                         | `https://api.goal.co.th`      |
| `NEXT_PUBLIC_APP_ENV`                  | `prod`                        |
| `NEXT_PUBLIC_SITE_URL`                 | `https://goal.co.th`          |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase prod URL             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase prod publishable key |
| `LEGAL_ENTITY_NAME`                    | ชื่อนิติบุคคลจริง             |
| `LEGAL_ENTITY_REGISTRATION_NUMBER`     | เลขทะเบียน (ถ้ามี)            |
| `LEGAL_ENTITY_ADDRESS`                 | ที่อยู่จดทะเบียนจริง          |
| `LEGAL_PRIVACY_EFFECTIVE_DATE`         | วันที่นโยบายมีผล              |
| `LEGAL_PRIVACY_REVIEW_DATE`            | วันที่ที่ปรึกษากฎหมายตรวจ     |

ค่าที่ขึ้นต้น `NEXT_PUBLIC_` จะถูกฝังใน browser bundle จึงห้ามใช้ Supabase secret/provider secrets
ข้อมูล legal ที่ไม่ใช่ secret ถูกนำไป render เป็น public policy และ production build จะ fail หากค่าบังคับไม่ครบ

### Mobile — EAS environments

| Variable                               | prod                          |
| -------------------------------------- | ----------------------------- |
| `EXPO_PUBLIC_API_URL`                  | `https://api.goal.co.th`      |
| `EXPO_PUBLIC_SITE_URL`                 | `https://goal.co.th`          |
| `EXPO_PUBLIC_SUPABASE_URL`             | Supabase prod URL             |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase prod publishable key |

ค่าที่ขึ้นต้น `EXPO_PUBLIC_` ถูกฝังใน binary/update bundle ห้ามใส่ private keys ทุกชนิด ตั้ง EAS build
profile `nonprod` ให้ใช้ EAS Preview environment และ `prod` ให้ใช้ EAS Production environment เพื่อไม่ให้
เลือกตัวแปรผิดตอน build

## ขั้นตอนที่ 1 — สร้าง Supabase nonprod

1. สร้าง project ใน region เดียวหรือใกล้ Vercel Functions มากที่สุด
2. เปิด MFA/organization MFA, SSL enforcement, backups ตาม RPO/RTO และตรวจ Security/Performance Advisor
3. เปิด email confirmation สำหรับ shared environments และตั้ง custom SMTP จาก domain จริง
4. ตรวจ Auth rate limits/CAPTCHA ตามความเสี่ยงของ public signup
5. Link และ deploy migrations จาก repository root:

```bash
pnpm install --frozen-lockfile
pnpm exec supabase login
pnpm exec supabase link --project-ref <NONPROD_PROJECT_REF>
pnpm exec supabase db push --linked --dry-run
pnpm exec supabase db push --linked
```

ใช้ Supabase Cloud สำหรับทุก environment และตรวจ migration history ใน Dashboard หลัง push

## ขั้นตอนที่ 2 — ตั้ง Auth providers

ตั้งแยก nonprod/prod ใน Supabase Auth:

- Site URL: web URL ของ environment
- Redirect allowlist แบบ exact:
  - `https://nonprod.goal.co.th/auth/callback`
  - `https://goal.co.th/auth/callback`
  - `goal://auth/callback`
- ใช้ asymmetric JWT signing key และตรวจ JWKS จาก API
- Enable Email/Password, Google, Facebook, Apple และ manual identity linking

Provider consoles ต้องชี้ OAuth callback มาที่ Supabase:

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
```

Apple ต้องมี native App ID `th.co.goal.app`, Sign in with Apple capability, Service ID/domain association
สำหรับ web flow และ key ที่ใช้ token revocation ให้ตรง Team/Key ID เดียวกัน

## ขั้นตอนที่ 3 — Deploy Vercel nonprod

1. Import repository เข้า Vercel สองครั้งสำหรับ nonprod และกำหนด Root Directory ตาม topology
2. ให้ Vercel ใช้ `pnpm-lock.yaml` ที่ root และ Node `22.22.x`
3. ใส่ environment variables เฉพาะ nonprod
4. Deploy API ก่อน Web
5. ผูก `api.nonprod.goal.co.th` และ `nonprod.goal.co.th`, รอ TLS แล้วค่อยทดสอบ OAuth/cookies
6. API ต้องตอบ:

```bash
curl -fsS https://api.nonprod.goal.co.th/v1/health
curl -fsS https://api.nonprod.goal.co.th/v1/health/ready
```

7. เปิด `https://api.nonprod.goal.co.th/docs` และตรวจ Swagger; production ต้องตอบ 404 ที่ path นี้
8. ตรวจ Vercel dashboard ว่ามี Cron 7 รายการและ Queue triggers 4 topics:
   `ai-analysis`, `football-sync`, `notifications`, `news-ingestion`
9. ตรวจทุก Cron ใช้ `Authorization: Bearer <CRON_SECRET>` อัตโนมัติ, ตาราง execution มี success record
   และ schedule เป็น UTC
10. ตรวจ Queue delivery/ack/retry และ dead-letter evidence โดยใช้ bounded nonprod jobs
11. ตั้ง Firewall/rate-limit rules โดยไม่บล็อก Vercel Cron, Queue callbacks, OAuth และ health probes

Per-minute Cron, 300-second Functions และ Queue operations ต้องอยู่ใน Vercel plan limits จริงก่อน prod

## ขั้นตอนที่ 4 — Link EAS และสร้าง nonprod builds

รันจาก `apps/mobile`:

```bash
pnpm exec eas login
pnpm exec eas whoami
pnpm exec eas init
pnpm exec eas update:configure
```

หลัง configure ต้องตรวจว่า `app.json` มี:

- `expo.extra.eas.projectId`
- `expo.updates.url`
- `runtimeVersion.policy = appVersion` ซึ่ง repository ใช้อยู่แล้ว

จากนั้นเพิ่ม branded icon/splash configuration, ตั้ง EAS environment variables และ credentials:

```bash
pnpm exec eas credentials --platform ios
pnpm exec eas credentials --platform android
pnpm exec eas build --platform ios --profile nonprod
pnpm exec eas build --platform android --profile nonprod
```

ตรวจ nonprod builds บน physical iPhone และ Android อย่างน้อยอย่างละ 1 รุ่น โดยใช้ production-like services:

- email, Google, Facebook และ Sign in with Apple
- deep link `goal://auth/callback`
- favorite/follow/personalized feed
- push permission หลัง user action, APNs/FCM delivery และ notification deep links
- foreground/background/terminated notifications
- account linking, logout, token disable และ account deletion
- live/match/AI/news/profile journeys, Thai font, timezone และ accessibility

ห้ามใช้ Expo Go เป็นหลักฐานสำหรับ push/store release เพราะต้องทดสอบ native credentials และ production binary

## ขั้นตอนที่ 5 — เตรียม Store

### Shared metadata

- App name: `Goal`
- Bundle/package: `th.co.goal.app`
- Primary language: Thai; เพิ่ม English localization ถ้าจะเปิดตลาดภาษาอังกฤษ
- Category: Sports
- Privacy URL: `https://goal.co.th/privacy`
- Support URL: `https://goal.co.th/support`
- Account deletion URL สำหรับ Google: `https://goal.co.th/account-deletion`
- คำอธิบายต้องระบุว่า live football, AI analysis และ news อาจอาศัย third-party data และ AI-generated summaries
- ห้ามกล่าวอ้าง “real-time” หรือความแม่นยำเกิน SLA/สิทธิ์ข้อมูลที่มีจริง
- ตั้ง Target audience ว่าไม่ใช่แอปสำหรับเด็ก เว้นแต่ product/legal ตั้งใจทำ Families/Kids compliance

### Apple App Store Connect

1. สร้าง app record ด้วย Bundle ID `th.co.goal.app`; Bundle ID เปลี่ยนไม่ได้หลังอัปโหลด build
2. เปิด Sign in with Apple และ Push Notifications capabilities
3. กรอก name/subtitle/description/keywords/category/age rating/copyright/territories
4. อัปโหลด icon และ screenshots ตาม device sizes ที่ App Store Connect ขอ ณ วันส่ง
5. กรอก App Privacy ให้ครอบคลุมข้อมูลจาก Supabase, Expo, OpenAI และ provider SDKs จริง เช่น
   account/contact info, favorites/follows, device/push token, usage/personalization และ AI input/output
6. ใส่ review contact, review notes และ demo email/password account ที่ไม่หมดอายุ
7. ใน notes ระบุ navigation ไป account deletion, notification permission timing, วิธีเปิด AI/follow features
   และตัวอย่าง match ที่ reviewer ตรวจได้แม้ไม่มีเกม live
8. ตอบ encryption/export compliance ให้ตรง `usesNonExemptEncryption: false`; หากขอบเขต encryption เปลี่ยนต้องประเมินใหม่
9. เลือก manual release หรือ phased release หลังอนุมัติ อย่าเปิด automatic release โดยไม่ตั้งใจ

### Google Play Console

1. สร้าง app record ด้วย package `th.co.goal.app`
2. กรอก Main store listing, screenshots, feature graphic, category และ contact details
3. ทำ App content: Privacy policy, Data safety, App access/demo account, Ads declaration, Target audience,
   Content rating และ News/content declarations ที่ Play Console แสดง
4. Data safety ต้องตรง privacy policy และรวม third-party libraries/services ทั้งหมด
5. ระบุทั้ง in-app deletion path และ public account-deletion URL
6. หากเป็น personal developer account ที่สร้างหลัง 13 พฤศจิกายน 2023 ต้องทำ closed test อย่างน้อย 12 คน
   ที่ opt-in ต่อเนื่อง 14 วัน แล้วจึงขอ production access; organization account ให้ทำตาม requirement ที่ Console แสดง
7. Expo SDK 57 target API 36 อยู่ในเกณฑ์ Android 16 ที่เริ่ม 31 สิงหาคม 2026 แต่ต้องตรวจ manifest ของ AAB
   จริงใน Play Console ทุก release

## ขั้นตอนที่ 6 — Deploy production

### 6.1 Pre-deploy verification

รันจาก repository root บน release commit เดียวกับที่จะ deploy:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm check
pnpm audit:prod
```

คำสั่งนี้ใช้ existing tests เท่านั้นและไม่ได้เพิ่ม test coverage target หรือ load test

### 6.2 Supabase production

1. สร้าง prod project แยกจาก nonprod และตั้ง security/auth/backup เหมือนขั้นตอน nonprod
2. เชื่อม project ให้เห็น ref ชัดเจนก่อนทุกคำสั่ง
3. ทำ dry-run แล้วตรวจ migration list ก่อน push:

```bash
pnpm exec supabase link --project-ref <PROD_PROJECT_REF>
pnpm exec supabase migration list
pnpm exec supabase db push --linked --dry-run
pnpm exec supabase db push --linked
```

Database migration ใช้ forward-only correction; ห้ามย้อน migration ที่มีข้อมูลจริงด้วย destructive reset

### 6.3 API และ Web production

1. ใส่ prod secrets ใน `goal-api-prod` เท่านั้นและ public web values ใน `goal-web-prod`
2. Deploy API แล้วตรวจ `/v1/health`, `/v1/health/ready`, CORS และยืนยัน `/docs` ปิด
3. ตรวจ Cron/Queues/Runtime Cache/Firewall/structured logs และ platform alerts
4. Deploy Web แล้วตรวจ SSR/client API calls, auth callback, Secure SameSite=Lax cookies, private/no-store auth responses และ canonical metadata
5. ผูก `api.goal.co.th`, `goal.co.th`, redirect `www` และตรวจ TLS/DNS จาก external network
6. ห้ามเปิด production traffic หาก API readiness ยังไม่ผ่าน

### 6.4 Production mobile builds

หลัง EAS project/store records/credentials พร้อมและ version ใน `app.json` ถูกอนุมัติ:

```bash
cd apps/mobile
pnpm exec eas build --platform ios --profile prod
pnpm exec eas build --platform android --profile prod
```

ใช้ build IDs ที่ได้จาก source revision เดียวกันตลอด Store review ห้าม rebuild source คนละ revision เพื่อส่งแต่ละ Store

## ขั้นตอนที่ 7 — Submit และ Review

### iOS

```bash
cd apps/mobile
pnpm exec eas submit --platform ios --profile prod --latest
```

Build จะเข้า App Store Connect/TestFlight ก่อน ให้ทดสอบ internal TestFlight, เปิด external testing หากต้องการ แล้วเลือก
build เดิมใน version record เพื่อ Submit for Review แก้ metadata/review questions ให้ครบก่อนส่ง

### Android

อัปโหลด Google service account key ผ่าน EAS Credentials ด้วยสิทธิ์ต่ำที่สุดที่ submit release ได้ แล้วรัน:

```bash
cd apps/mobile
pnpm exec eas submit --platform android --profile prod --latest
```

ส่งเข้า internal/closed testing ก่อน production หาก `submit.prod` ยังว่างให้กำหนด `ascAppId` ฝั่ง iOS และ
Android `track`/`releaseStatus` หลังสร้าง Store records แล้ว เพื่อลดการเลือกปลายทางผิดแบบ interactive

## ขั้นตอนที่ 8 — Launch

1. เลือก manual release หลัง Apple/Google อนุมัติ
2. เปิด Android staged rollout และ iOS phased release ในสัดส่วนต่ำก่อน; ขยายเมื่อ health, queue age,
   push receipts, provider errors และ user login ปกติ
3. เฝ้าดู Vercel Observability/Logs/Queues/Cron, Supabase Logs/Advisors และ EAS dashboards ตาม
   `docs/operations/observability.md`
4. ตรวจ Sportmonks/OpenAI/Expo budgets และ rate limits ไม่ให้เกินวงเงินที่อนุมัติ
5. ตรวจ support/privacy mailboxes, Store reviews และ account-deletion requests ทุกวันช่วงเปิดตัว
6. เก็บ App Store/Play Console review correspondence และ release/build IDs เป็นหลักฐานของ launch

หากต้องหยุด rollout ให้ pause ที่ Store ก่อน Web/API สามารถ promote previous Vercel deployment ได้ ส่วน database
ใช้ forward fix เท่านั้น EAS Update ใช้แก้เฉพาะ JavaScript/assets ที่ compatible กับ `runtimeVersion`; native/config/plugin
changes ต้องส่ง binary ใหม่

## Phase 9 ถือว่าเสร็จเมื่อ

- nonprod และ prod แยก secrets/data/provider credentials จริง
- Supabase migrations, API, Web, Cron, Queues, Runtime Cache และ authentication ทำงานบน domain จริง
- iOS/Android production binaries ใช้ API/Supabase prod และรับ push บน physical devices ได้
- Privacy/support/account-deletion URLs เปิดสาธารณะและ Store disclosures ตรงกับพฤติกรรมจริง
- Apple App Review และ Google Play review ผ่าน
- production rollout เปิดครบตามสัดส่วนที่ product owner อนุมัติ และ platform health ไม่เกิด release regression

## เอกสารทางการที่ใช้อ้างอิง

- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Vercel Queues](https://vercel.com/docs/queues)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Expo EAS Update setup](https://docs.expo.dev/eas-update/getting-started/)
- [Expo iOS submission](https://docs.expo.dev/submit/ios/)
- [Expo Android submission](https://docs.expo.dev/submit/android/)
- [Expo SDK support matrix](https://docs.expo.dev/versions/latest/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
- [Apple App Review information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)
- [Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
- [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en-EN)
- [Google Play personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Google Play target API requirements](https://developer.android.com/google/play/requirements/target-sdk)
