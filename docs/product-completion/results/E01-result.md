# E01 API/Scope/Service Foundation Result

Date: 2026-05-02

## Status

Completed.

## Implemented

- Added shared frontend API contracts and client helpers in `lib/api`.
- Added server API foundation in `lib/server`: unified error envelopes, session resolution, scope guards, extended snapshot normalization, repository, audit logging, and unified `AppDataService`.
- Added Next.js API routes for demo session, children, teachers, messages, feedback, records, health materials, consultations, analytics, weekly reports, attachments, and reminders.
- Added server-side scope checks for director, teacher, and parent access. The implementation validates stored resource relationships instead of trusting client-supplied role, child, class, teacher, or institution fields.
- Added demo session header fallback using `x-demo-account-id` for known demo accounts only; cookie session remains first.
- Preserved `/api/state` as a compatibility route and prevented legacy core snapshot saves from dropping API extension buckets.
- Added metadata-only attachment fallback and in-process demo persistence for API writes. Normal account persistence uses `app_state_snapshots`; missing DB config returns 503 instead of fake success.

## API Coverage

- `children`: list, get, create, update, archive, restore.
- `teachers`: list, get, create, update, archive, restore.
- `messages/feedback`: list/send/reply/mark-read, feedback list/detail/status.
- `records`: list/create/update/archive for attendance, health, meal, and growth records via `/api/records`.
- `healthMaterials`: list/create/update parse result.
- `consultations`: list/create/add note/update status.
- `analytics`: director dashboard, admin summary alias, trends, teacher workbench, parent home.
- `weeklyReports`: list/generate/detail/archive/export.
- `attachments`: create metadata/list/get.
- `reminders`: list/create/update.

## Verification

- `npm run lint`: passed.
- `npm run build`: passed.
- `npx tsc --noEmit --pretty false --incremental false`: passed.
- `node --import ./scripts/register-test-path-loader.mjs --test ./lib/server/api-errors.test.ts ./lib/server/scope.test.ts ./lib/server/app-data-service.test.ts`: 12/12 passed.
- `FEATURE_BASE_URL=http://127.0.0.1:3330 FEATURE_SKIP_WEBSERVER=1 npx playwright test tests/feature-completion/e01-api-scope.spec.ts --config=playwright.feature.config.ts --reporter=line`: 4/4 passed.
- `FEATURE_BASE_URL=http://127.0.0.1:3330 FEATURE_SKIP_WEBSERVER=1 npm run feature:smoke`: first run hit a transient `ECONNRESET` on `/api/auth/demo-login`; rerun passed 13/13.

## Remaining Risks

- Broad page-by-page migration from direct localStorage/store calls to the new service client remains for E02-E09.
- Demo API persistence is process-local for demo accounts and is not durable across server restart or serverless cold start.
- Normal-account snapshot writes are read-modify-write and still last-write-wins without optimistic versioning.
- AI routes under `/api/ai/*` were not normalized in E01 and still need separate E05/E06 risk work.
- Weekly report share, voice assistant commands, and quality metrics aliases are not part of the E01 foundation surface and remain for later tasks.

## Next Tasks

- E02/E03/E04/E05/E06 can proceed in parallel on top of this API foundation if they avoid overlapping route/service ownership.
