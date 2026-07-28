# Thread Assignments

Updated: 2026-04-29

## First-Round Principles

- Browser Use threads only simulate real users and find bugs. They do not modify source code.
- Code scanning threads record potential runtime, interaction, permission, mock data, responsive, and state bugs. They do not perform broad fixes.
- If a small helper script or test is necessary, keep it scoped to bug bash evidence or regression planning and avoid business source edits.
- All bugs are written to `docs/bug-bash/BUGS.md` and `docs/bug-bash/BUGS.json`.
- All screenshots, videos, traces, and logs go to `artifacts/bug-bash/`.
- Do not let multiple threads modify the same business source file in parallel.
- Fixes wait until B99 triage creates a module-based fix plan.

## Browser Use Threads

| Thread | Scope | Demo Accounts | Output |
|---|---|---|---|
| B10 | Global smoke: login, role home pages, navigation, console errors | 陈园长, 李老师, 周老师, 林妈妈 | Bugs and screenshots |
| B11 | Director paths: `/admin`, `/admin/agent`, weekly report, children, health, diet, growth | 陈园长 | Bugs and screenshots |
| B12 | Teacher paths: workbench, class tasks, health, diet, growth, AI, communication, health material parsing, high-risk consultation | 李老师, 周老师 | Bugs and screenshots |
| B13 | Parent paths: home, 7-day records, feedback, storybook, mobile browsing | 林妈妈 | Bugs and screenshots |
| B14 | Mobile and tablet responsive pass | All roles as needed | Responsive bugs and screenshots |
| B15 | Routing and permission pass | All roles as needed | Auth, refresh, and permission bugs |
| B16 | Optional shared records browser pass: children, health, diet, growth across roles | All roles as needed | Cross-role shared page bugs |
| B17 | Optional AI and safe-action browser pass | All roles as needed | AI interaction and unsafe-action bugs |
| B18 | Optional empty, error, and loading browser pass | All roles as needed | State handling bugs |
| B19 | Optional console, network, and artifact audit pass | All roles as needed | Evidence quality and browser runtime bugs |

Browser Use threads may run in parallel because they should only write bug records and artifacts. B16-B19 are reserved optional prompts and should not be started unless the coordinator wants extra Browser Use coverage beyond B10-B15.

## Code Scanning Threads

| Thread | Scope | Output |
|---|---|---|
| B20 | Build, lint, dev startup, runtime imports, obvious crash paths | Potential P0-P2 technical bugs |
| B21 | Visual-only modules, mock data, fake actions, misleading UI | Mock and user trust bugs |
| B22 | Forms, modals, buttons, drawers, dialogs, close/open states | Interaction bugs |
| B23 | Routes, auth, role guards, nav permissions, direct access | Permission and routing bugs |
| B24 | CSS, assets, responsive behavior, overflow, missing images | Visual/runtime asset bugs |
| B25 | Data, state, loading, empty, error, stale or inconsistent data | State and data bugs |
| B26 | Playwright regression suite design | Regression test candidates |

Code scanning threads may run in parallel when they only read source and update bug ledgers. They must not perform business fixes before B99.

## B99

B99 runs after first-round discovery. It must deduplicate bugs, confirm severity, mark release blockers, and produce `BUG_FIX_PLAN.md`.
