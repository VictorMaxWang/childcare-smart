# Go-Live in 10 Minutes

Follow this checklist in order. If any step fails, stop and fix before continuing.

Quick status at any time:

```bash
npm run release:status
```

One-command local+remote gate chain:

```bash
npm run release:go:all
```

Reset stale remote report before a fresh remote run:

```bash
npm run release:remote:reset
```

Optional strict freshness check (example: 60 minutes):

```bash
npm run release:status -- --max-report-age-minutes=60
```

## 1) Local Gate (2-3 minutes)

Run:

```bash
npm run release:gate:local
```

Or run `npm run release:go:all` to include this automatically.

Expected:

- `lint` passes
- `build` passes
- `release:check` passes

## 2) Fill Remote Secrets (1 minute)

Copy `.env.release.example` to `.env.release` and fill:

- `RELEASE_BASE_URL`
- `RELEASE_ADMIN_COOKIE`
- `CRON_SECRET`

Use real values. Placeholder values (like `your-domain.example.com`) are treated as invalid.

Note:

- `.env.release` is local-only and already ignored by git.
- You can auto-create it with `npm run release:env:init`.

## 3) Remote Preflight (1 minute)

Run:

```bash
npm run release:env:check
```

Expected:

- `[OK] .env.release has all required keys for remote gate.`

## 4) Remote Gate (2-3 minutes)

Run:

```bash
npm run release:go:remote
```

This command now auto-runs `release:remote:reset` first.
It also auto-runs `release:env:init` (creates `.env.release` if missing).

Expected:

- remote checks pass
- report generated at `artifacts/release-report.remote.json`

## 5) Supabase Final Validation (2 minutes)

In Supabase SQL Editor, execute in order:

1. `supabase/schema.sql`
2. `supabase/post-migration-check.sql`

Expected:

- final row shows `overall_passed = true`

Record this result for release scripts:

```bash
npm run release:sql:pass
```

## 6) Release Decision (30 seconds)

Run:

```bash
npm run release:ready
```

Optional strict freshness check (example: 60 minutes):

```bash
npm run release:ready -- --sql-overall-passed=true --max-report-age-minutes=60
```

Release only if all are true:

- Local gate is green
- Remote gate is green
- `overall_passed = true` in post-migration SQL

If any item is false, do not release.
