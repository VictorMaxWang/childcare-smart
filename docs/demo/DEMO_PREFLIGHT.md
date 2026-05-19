# Demo Defense Preflight

Run this from the repository root before the defense demo:

```bash
npm run demo:preflight
```

The preflight starts or reuses a local Next.js server. The default target is
`http://127.0.0.1:3330`. When every check passes, the console prints:

```text
DEMO READY
```

## What It Checks

`demo:preflight` runs the main demo path serially:

- `/teacher` is accessible for `u-teacher`.
- `/teacher/agent?action=weekly-summary` generates non-empty `summary`, `target`, and `actionItems`.
- `/teacher/high-risk-consultation` and `/api/consultations?childId=c-1` include `evidenceItems`.
- `/admin` has risk priority data.
- `/parent?child=c-1` has a tonight action or family task.
- `/parent/storybook?child=c-1` and `/api/storybooks?childId=c-1` have baseline storybook pages/scenes.
- `/parent/agent?child=c-1#feedback` can submit a real feedback record.
- `/api/ai/provider-status` exposes readable `chat`, `ocr`, `asr`, `tts`, and `fallbackText` status fields.
- Forced fallback on `/api/ai/weekly-report` returns a non-empty result with provider/fallback metadata.
- `createDemoSeedSnapshot()`, `DEFENSE_CHILD_PROFILES`, c-1/c-2/c-3 risk samples, c-1 evidence, tonight action, feedback, storybook content, and demo media manifest are complete.

This tool only checks and reports. It does not run demo reset and does not auto-fix missing data.

## Reports And Screenshots

Every run writes:

```text
artifacts/demo-preflight-report.json
```

On failure, the preflight also tries to save screenshots under:

```text
artifacts/demo-preflight/screenshots/
```

To capture screenshots for successful key pages too, set:

```bash
DEMO_PREFLIGHT_SCREENSHOTS=1 npm run demo:preflight
```

PowerShell equivalent:

```powershell
$env:DEMO_PREFLIGHT_SCREENSHOTS = "1"
npm run demo:preflight
Remove-Item Env:DEMO_PREFLIGHT_SCREENSHOTS
```

`artifacts/` is ignored by Git, so reports and screenshots are not committed.

## Environment Variables

- `DEMO_PREFLIGHT_PORT=3330`: change the local port used by the auto-started server.
- `DEMO_PREFLIGHT_BASE_URL=http://127.0.0.1:3330`: check an existing service; setting this skips the webServer startup.
- `DEMO_PREFLIGHT_SKIP_WEBSERVER=1`: skip webServer startup and use the configured base URL.
- `DEMO_PREFLIGHT_SCREENSHOTS=1`: capture screenshots for successful and failed key pages; default is failure-only.

Example:

```bash
DEMO_PREFLIGHT_BASE_URL=http://127.0.0.1:3330 DEMO_PREFLIGHT_SKIP_WEBSERVER=1 npm run demo:preflight
```

PowerShell equivalent:

```powershell
$env:DEMO_PREFLIGHT_BASE_URL = "http://127.0.0.1:3330"
$env:DEMO_PREFLIGHT_SKIP_WEBSERVER = "1"
npm run demo:preflight
Remove-Item Env:DEMO_PREFLIGHT_BASE_URL
Remove-Item Env:DEMO_PREFLIGHT_SKIP_WEBSERVER
```

## Real Feedback Write

The feedback check really submits one record from `/parent/agent?child=c-1#feedback`.
Its note contains a unique `demo-preflight-<timestamp>` marker. The test then polls
`/api/feedback?childId=c-1` until the marker appears.

This verifies the live write path. The preflight does not delete the record and does not reset demo data.

## Failure Triage

The console prints one `[PASS]` or `[FAIL]` line per check. If anything fails, inspect
`artifacts/demo-preflight-report.json` first:

- `checks[]`: account, route/API, status, duration, counts, missing fields, diagnostics, and screenshot path.
- `failures[]`: the failing page/API and the exact error reason.
- `screenshots[]`: screenshots generated during the run.

If the report points to missing data, inspect the current demo fixture or persisted data. The preflight itself will not reset or repair it.
