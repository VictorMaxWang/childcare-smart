# Bug Fix Plan

Updated: 2026-04-29

## Summary

- Total bug records: 49.
- Unique fix items after B99 dedupe: 42.
- Duplicate records retained as evidence: 7.
- Release blockers: 8.
- Execute order: F00 first, then F10/F20/F30/F40/F70 in parallel, then F50, F60, F90, F99 serially.

## F00: Global Auth, Routing, Permission

BugIds: `BUG-011`, `BUG-012`, `BUG-013`, `BUG-B23-001`, `BUG-B23-002`.

Scope: role route guards, direct URL access, `/login?next=...`, example account redirect hardening, and root/data-overview exposure. This is the first fix thread and blocks role work.

## F10: Login And Demo Accounts

BugIds: none assigned as independent non-security login bugs.

Scope: login regression after F00, `/login`, `/auth/login`, normal login, password visibility, registration modal, demo account UI, and non-security redirect behavior. If no code changes are needed, write a no-op result with verification evidence.

## F20: Director

BugIds: `BUG-001`, `BUG-B11-001`, `BUG-B11-002`, `BUG-B11-003`, `BUG-B11-005`, `BUG-B21-003`, `BUG-B21-004`, `BUG-B25-002`.

Scope: director home, director AI assistant, weekly/report pages, director mock/static-data labeling, no-op export/share/help buttons, dashboard empty/zero-state handling, and director notification fallback.

## F30: Teacher

BugIds: `BUG-B12-001`, `BUG-B21-002`, `BUG-B21-005`, `BUG-B22-002`, `BUG-B22-005`, `BUG-B22-006`, `BUG-B22-007`, `BUG-B25-001`.

Scope: teacher workbench, teacher AI/home-school communication, mock voice/OCR draft persistence risk, high-risk consultation, health material parsing, visual-only teacher controls, and teacher empty/zero-state handling.

## F40: Parent

BugIds: `BUG-002`, `BUG-003`, `BUG-014`, `BUG-015`, `BUG-016`, `BUG-019`, `BUG-B21-001`, `BUG-B23-003`, `BUG-B25-003`.

Scope: parent home, AI suggestions/follow-up, feedback hash and child identity, storybook generation/fallback, demoSeed leakage, storybook child query canonicalization, and parent-facing internal demo copy.

## F50: Shared Business Interactions

BugIds: `BUG-B11-006`, `BUG-B22-001`, `BUG-B22-003`.

Scope: shared business pages and common UI interactions, including `/children`, `/health`, tables, dialogs, top-bar search/notification/message buttons, and invalid form submission.

## F60: CSS, Assets, Responsive

BugIds: `BUG-004`, `BUG-020`, `BUG-021`, `BUG-B11-004`, `BUG-B24-001`, `BUG-B24-002`, `BUG-B24-003`.

Scope: Recharts sizing, mobile/tablet responsive defects, parent storybook overlap/loading, login mobile image payload, Windows absolute path leakage, pixel asset path hygiene, z-index/overflow, and resource-risk cleanup.

## F70: Tooling, Tests, TypeScript

BugIds: `BUG-B20-001`, `BUG-B20-002`.

Scope: `tsc --noEmit`, stale test/capture fixture types, Node native test alias resolution for `@/lib`, Playwright bugbash smoke stability, `.next/dev/lock`, documented `BUGBASH_BASE_URL` reuse, and test command documentation.

## F90: Merge Parallel Fix Results

BugIds: all assigned bugIds from F00-F70, plus duplicate status synchronization.

Scope: read `docs/bug-bash/fix-results/*.json`, update `BUGS.md`, `BUGS.json`, `BUG_STATUS.md`, keep duplicate records, sync fixed/open/duplicate statuses, and generate a merge report.

## F99: Final Regression

BugIds: all release-blocking and fixed P1/P2 bugs.

Scope: final lint/build/typecheck or documented tsc status, `bugbash:smoke`, four-account Browser Use/Playwright regression, permission/route retest, mobile retest, and final release recommendation.

## Duplicate Records Not Assigned Independently

- `BUG-B12-002` duplicates `BUG-004`.
- `BUG-017` duplicates `BUG-014`/`BUG-015`.
- `BUG-018` duplicates `BUG-003`.
- `BUG-B22-004` duplicates `BUG-B21-004`.
- `BUG-B26-001` duplicates `BUG-001`.
- `BUG-B26-002` duplicates `BUG-002`.
- `BUG-B26-003` duplicates `BUG-003`.
