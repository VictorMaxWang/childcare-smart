# SmartChildcare Frontend Refactor Control

> [!WARNING]
> Historical snapshot only. This phase is frozen; do not update its status, implementation log, or decisions. Register any renewed refactor work in the active task documents first.

This directory was the control plane for the SmartChildcare frontend visual refactor. It coordinated design assets, task order, status, route mapping, design rules, QA, and prompts for follow-up Codex threads.

## Historical Startup

At the time, every follow-up thread was required to read these files first:

1. `AGENTS.md`
2. `docs/archive/2026-q2/refactor/TASK_SEQUENCE.md`
3. `docs/archive/2026-q2/refactor/TASK_STATUS.md`
4. `docs/archive/2026-q2/refactor/DESIGN_SYSTEM_SPEC.md`
5. `docs/archive/2026-q2/refactor/ROUTE_PAGE_MAP.md`
6. `docs/archive/2026-q2/refactor/DESIGN_ASSET_INDEX.md`

## Historical Operating Rules

- Design images were visual references, not business truth.
- Existing routes, demo account entry points, permissions, data flow, and backend APIs had to remain intact.
- Real pages could not be replaced with static PNG mockups.
- Task status and implementation notes were recorded in `TASK_STATUS.md` and `IMPLEMENTATION_LOG.md`.
- Important design tradeoffs were recorded in `DECISIONS.md`.

## Historical Workflow

1. Design assets were rebuilt with `node scripts/prepare-refactor-design-assets.mjs` when needed.
2. Work was assigned by task ID from `TASK_SEQUENCE.md`.
3. Each thread stayed within its allowed scope.
4. Required checks ran before a task closed.
5. `npm run capture:ui` and `npm run package:gpt-image2` supported visual QA and design-package comparisons.
