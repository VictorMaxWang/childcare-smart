# Phase 6 Release Checklist

This checklist validates the full production chain: auth, RLS, CRUD, storage, AI fallback, mini-program, and event notifications.

For a fast operational flow, see `docs/go-live-10min.md`.

## Quick Automation

- Local static checks:

```bash
npm run release:check
```

This command now also validates critical SQL guardrail markers in `supabase/schema.sql` and `supabase/post-migration-check.sql`.

- One-command local gate (lint + build + release checks):

```bash
npm run release:gate:local
```

- One-command local+remote gate chain:

```bash
npm run release:go:all
```

- Enforced remote checks (fails if `RELEASE_BASE_URL` is missing):

This mode requires all of the following to be set: `RELEASE_BASE_URL`, `RELEASE_ADMIN_COOKIE`, `CRON_SECRET`.

PowerShell example:

```powershell
$env:RELEASE_BASE_URL = "https://<your-domain>"
$env:RELEASE_ADMIN_COOKIE = "<session-cookie>"
$env:CRON_SECRET = "<cron-secret>"
npm run release:check:remote
```

Unified remote gate command:

```bash
npm run release:gate:remote
```

Env-file remote gate command (recommended for local secure workflow):

1. Copy `.env.release.example` to `.env.release` and fill values.

- Or run `npm run release:env:init` to auto-create `.env.release` if missing.
- Do not keep placeholder values (for example `your-domain.example.com`), they will fail preflight.

2. Preflight-check required keys:

```bash
npm run release:env:check
```

3. Run:

```bash
npm run release:gate:remote:env
```

One-command remote flow:

```bash
npm run release:go:remote
```

This command auto-runs `release:remote:reset` before remote preflight and remote gate.
It also auto-runs `release:env:init` to create `.env.release` when missing.

Optional cleanup before remote flow (avoid stale remote report confusion):

```bash
npm run release:remote:reset
```

This command internally uses `--release-env-file=.env.release`.
Do not commit `.env.release`; keep only `.env.release.example` in repository.

- Final release decision command (requires SQL final result):

```bash
npm run release:ready
```

Optional strict freshness threshold (example: 60 minutes):

```bash
npm run release:ready -- --max-report-age-minutes=60
```

Before `release:ready`, run `npm run release:sql:pass` after `supabase/post-migration-check.sql` returns `overall_passed=true`.

```bash
RELEASE_BASE_URL=https://<your-domain> \
RELEASE_ADMIN_COOKIE='<session-cookie>' \
CRON_SECRET=<cron-secret> \
npm run release:check:remote
```

- Generate JSON report artifact (default `./release-report.json`):

```bash
npm run release:report
```

- Generate local artifact report with fixed path (`./artifacts/release-report.local.json`):

```bash
npm run release:report:local
```

- Optional custom report path:

```bash
RELEASE_REPORT_PATH=./artifacts/release-report.local.json npm run release:report
```

Or use CLI argument (cross-platform):

```bash
node ./scripts/release-check.mjs --report-path=./artifacts/release-report.local.json
```

- Enforced remote report generation (default `./artifacts/release-report.remote.json` when `RELEASE_REPORT_PATH` is not set):

```bash
RELEASE_BASE_URL=https://<your-domain> \
RELEASE_ADMIN_COOKIE='<session-cookie>' \
CRON_SECRET=<cron-secret> \
RELEASE_REPORT_PATH=./artifacts/release-report.remote.json \
npm run release:report:remote
```

PowerShell example:

```powershell
$env:RELEASE_BASE_URL = "https://<your-domain>"
$env:RELEASE_ADMIN_COOKIE = "<session-cookie>"
$env:CRON_SECRET = "<cron-secret>"
$env:RELEASE_REPORT_PATH = "./artifacts/release-report.remote.json"
npm run release:report:remote
```

You can also run:

```bash
npm run release:report:remote
```

because this script already pins `--report-path=./artifacts/release-report.remote.json`.

- Remote endpoint checks (optional):

```bash
RELEASE_BASE_URL=https://<your-domain> \
RELEASE_ADMIN_COOKIE='<session-cookie>' \
CRON_SECRET=<cron-secret> \
npm run release:check
```

## 1) Environment

- Set required vars from `.env.example`.
- Confirm `NEXT_PUBLIC_FORCE_MOCK_MODE=false` for production Supabase mode.
- If notification uses WeChat:
  - `NOTIFICATION_PROVIDER=wechat`
  - `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `WECHAT_SUBSCRIBE_TEMPLATE_ID`
- Set cron protection:
  - `CRON_SECRET`
  - Optional `CRON_DISPATCH_LIMIT_PER_INSTITUTION`

## 2) Database Initialization

- Run `supabase/schema.sql` in Supabase SQL Editor.
- Then run `supabase/post-migration-check.sql` in SQL Editor and confirm the final summary row reports `overall_passed=true` (and all `has_*` checks are `true`).
- After confirming `overall_passed=true`, run `npm run release:sql:pass` to persist SQL readiness snapshot.
- Confirm key tables exist:
  - `user_profiles`, `children`, `parent_children`
  - `notification_events`, `notification_dead_letters`
- Confirm buckets exist (created automatically by `schema.sql` and should remain private):
  - `parent-media` (private)
  - `institution-reports` (private)

## 3) Health and Readiness

- Public health:

```bash
curl -s https://<your-domain>/api/public/health
```

- Admin system check (login as institution admin):

```bash
curl -s --cookie "<session-cookie>" https://<your-domain>/api/admin/system-check
```

- Verify `releaseReady=true` and `blockers=[]`.

## 4) Notification Flow Validation

- Enqueue pending task events:

```bash
curl -X POST https://<your-domain>/api/admin/notification-events \
  -H "Content-Type: application/json" \
  --cookie "<session-cookie>" \
  -d '{"date":"2026-03-10"}'
```

- Dispatch pending events manually:

```bash
curl -X PATCH https://<your-domain>/api/admin/notification-events \
  -H "Content-Type: application/json" \
  --cookie "<session-cookie>" \
  -d '{"limit":50}'
```

- Query dead letters:

```bash
curl -s --cookie "<session-cookie>" https://<your-domain>/api/admin/notification-dead-letters
```

- Requeue dead letters if needed:

```bash
curl -X PATCH https://<your-domain>/api/admin/notification-dead-letters \
  -H "Content-Type: application/json" \
  --cookie "<session-cookie>" \
  -d '{"action":"requeue","ids":["<dead-letter-id>"]}'
```

## 5) Cron Dispatch Validation

- Trigger cron endpoint manually:

```bash
curl -s "https://<your-domain>/api/cron/dispatch-notifications?secret=<CRON_SECRET>"
```

- Check `vercel.json` contains cron path `/api/cron/dispatch-notifications`.

## 6) Runtime Rollback Switch

- To emergency rollback to mock behavior without deleting Supabase vars:
  - Set `NEXT_PUBLIC_FORCE_MOCK_MODE=true`
  - Redeploy

## 7) Final Gate

- Build must pass: `npm run build`
- `system-check` shows no blockers
- At least one successful end-to-end notification dispatch completed
