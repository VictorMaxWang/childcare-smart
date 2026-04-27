# SmartChildcare Frontend Refactor Control

This directory is the control plane for the SmartChildcare frontend visual refactor. It coordinates design assets, task order, status, route mapping, design rules, QA, and prompts for follow-up Codex threads.

## How to Start

Every follow-up thread must read these files first:

1. `AGENTS.md`
2. `docs/refactor/TASK_SEQUENCE.md`
3. `docs/refactor/TASK_STATUS.md`
4. `docs/refactor/DESIGN_SYSTEM_SPEC.md`
5. `docs/refactor/ROUTE_PAGE_MAP.md`
6. `docs/refactor/DESIGN_ASSET_INDEX.md`

## Operating Rules

- Design images are visual references, not business truth.
- Keep existing routes, demo account entry points, permissions, data flow, and backend APIs intact.
- Do not turn real pages into static PNG mockups.
- Record task status in `TASK_STATUS.md` and implementation notes in `IMPLEMENTATION_LOG.md`.
- Record important design tradeoffs in `DECISIONS.md`.

## Workflow

1. Run `node scripts/prepare-refactor-design-assets.mjs` if design assets need to be rebuilt.
2. Assign work by task ID from `TASK_SEQUENCE.md`.
3. Keep each thread within its allowed scope.
4. Run required checks before closing a task.
5. Use `npm run capture:ui` and `npm run package:gpt-image2` for visual QA and design-package comparisons when needed.
