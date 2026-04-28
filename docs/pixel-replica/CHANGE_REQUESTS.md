# Pixel Replica Change Requests

Use this file before making cross-task edits during parallel work.

## Template

| Date | Requesting Task | Target Owner | Files | Reason | Status | Resolution |
|---|---|---|---|---|---|---|

## Requests

| Date | Requesting Task | Target Owner | Files | Reason | Status | Resolution |
|---|---|---|---|---|---|---|
| 2026-04-28 | P30 | P10 Login | `app/login/page.tsx` | Global `npm run lint` was temporarily blocked by `react-hooks/set-state-in-effect` at `app/login/page.tsx:149`. P30 did not edit login-owned files. | Resolved | The login lint blocker is now resolved in the parallel worktree; final `npm run lint` passes. |
| 2026-04-28 | P10 | P01/P99 Pixel Tools | `scripts/capture-pixel-pages.mjs`, `scripts/compare-pixel-parity.mjs`, `artifacts/pixel-replica/references/*` | Login acceptance needs per-viewport references. Current mobile login capture points to the desktop reference, and desktop compare cover-center crops a 1448x1086 reference into 1440x900, producing low automated scores despite close manual parity to the original references. | Open | Pending shared-tool owner decision; P10 did not modify public scripts. |
