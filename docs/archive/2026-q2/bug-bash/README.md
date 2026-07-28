# B00 Bug Bash Control Center

Updated: 2026-04-29

> [!WARNING]
> Historical snapshot only. This phase is frozen; do not restart its threads or write new results into this archive. Register any new bug bash in the active task documents and write generated evidence to `artifacts/`.

This directory was the single coordination point for the SmartChildcare bug bash after Pixel Replica Mode.

## Scope

- Project repository: `C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart`
- Design source directory: `C:\Users\12804\Desktop\childcare-smart源代码\前端重构`
- Artifact directory: `artifacts/bug-bash/`
- First-round goal: find, record, and triage bugs. Do not fix business code before B99.

## Historical Required Reading

At the time, every bug bash thread was required to read these files before starting:

1. `AGENTS.md`
2. `docs/pixel-replica/agent.md`
3. `docs/pixel-replica/TASK_STATUS.md`
4. `docs/pixel-replica/FINAL_PIXEL_REPLICA_REPORT.md` if it exists
5. `docs/pixel-replica/DESIGN_TO_ROUTE_MAP.md`
6. `docs/archive/2026-q2/refactor/ROUTE_PAGE_MAP.md`
7. `package.json`
8. Existing Playwright, Browser Use, smoke, and screenshot scripts when relevant

## Historical First-Round Rules

- Browser Use threads only simulate real users and record bugs. They must not modify source code.
- Code scanning threads should record bugs and risks, not perform broad fixes.
- If a tiny helper test or script is necessary, keep it scoped to bug bash or regression evidence and avoid business source edits.
- All bugs were recorded in both `docs/archive/2026-q2/bug-bash/BUGS.md` and `docs/archive/2026-q2/bug-bash/BUGS.json`.
- Screenshots, videos, traces, logs, and other evidence go under `artifacts/bug-bash/`.
- Do not let multiple threads modify the same `src`, `app`, `components`, `lib`, `backend`, or shared business file in parallel.
- Fixes wait until B99 completes triage and creates the module-based fix plan.
- Do not execute dangerous final confirmations such as real delete, send, submit, or upload completion unless explicitly instructed.

## Local Commands

Detected from `package.json`:

- Start dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Main screenshot capture: `npm run capture:ui`
- Visual parity captures: `npm run capture:visual-parity`, `npm run capture:visual-parity:round2`, `npm run capture:visual-parity:round3`, `npm run capture:visual-parity:round4`, `npm run capture:visual-parity:round5`
- Pixel screenshots: `npm run pixel:capture`
- Pixel compare: `npm run pixel:compare`

Browser Use should normally use the URL printed by `npm run dev`, such as `http://localhost:3000` or another available local port. Existing capture scripts often use `http://localhost:3230` through `CAPTURE_BASE_URL`.

## Initial Baseline

- `npm run lint`: passed on 2026-04-29.
- `npm run build`: passed on 2026-04-29 with Next.js 16.1.6.
- No P0 baseline bug was recorded for lint or build.

## Bug Record Source Of Truth

- Human-readable ledger: `docs/archive/2026-q2/bug-bash/BUGS.md`
- Machine-readable ledger: `docs/archive/2026-q2/bug-bash/BUGS.json`
- Triage policy: `docs/archive/2026-q2/bug-bash/BUG_TRIAGE.md`
- Thread ownership: `docs/archive/2026-q2/bug-bash/THREAD_ASSIGNMENTS.md`
- Fix planning after triage: `docs/archive/2026-q2/bug-bash/BUG_FIX_PLAN.md`

## Follow-Up Prompts

Prompts live in `docs/archive/2026-q2/bug-bash/prompts/`.

- Primary Browser Use prompts: B10-B15.
- Optional reserved Browser Use prompts: B16-B19.
- Code scanning prompts: B20-B26.
- Triage prompt: B99.

The default parallel startup was B10-B15 and B20-B26. B16-B19 were reserved for requests that needed extra coverage.
