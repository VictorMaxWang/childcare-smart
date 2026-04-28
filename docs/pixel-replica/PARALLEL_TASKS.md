# Pixel Replica Parallel Task Rules

## Serial Tasks

These tasks must run in order:

1. P00: master control, documentation, and design source index.
2. P01: design asset cropping and screenshot comparison tools.
3. P02: global shell, navigation, and core visual framework.

P01 must establish the repeatable screenshot and comparison workflow before visual implementation begins. P02 must stabilize global layout, navigation, viewport frame, page gutters, and common shell behavior before page teams start heavy edits.

## Parallel Tasks

These tasks may run in parallel only after P01 and P02 are complete:

- P10: login page.
- P20: director pages.
- P30: teacher pages.
- P40: parent pages.

Parallel threads must stay inside their ownership boundaries in `FILE_OWNERSHIP.md`.

## Serial Closeout Tasks

These tasks run after the parallel page work:

1. P50: shared business pages, tables, forms, dialogs, drawers, empty states, error states, and responsive completion.
2. P99: final merge, visual QA, screenshot comparison, score recording, and acceptance report.

## Cross-Task Changes

If a thread needs to modify files owned by another task, it must first write a request to `docs/pixel-replica/CHANGE_REQUESTS.md`.

Do not make large cross-task edits directly from a parallel thread.

## Required Evidence

Every thread must capture:

- Current page screenshot.
- Target design reference.
- Modified page screenshot.
- Visual closeness score.
- Difference list.
- Fix list.
- Remaining gaps.

