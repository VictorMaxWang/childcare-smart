# Pixel Replica Control Directory

This directory controls the SmartChildcare pixel replica phase.

The phase is no longer a conservative visual refactor. The goal is to make the real website visibly match the GPT Image 2 design images as closely as possible while preserving login, routes, demo accounts, permissions, and safe business entry points.

## Fixed Design Source

Original design source directory:

`<design-source-root>`

`<design-source-root>` denotes the external sibling directory that normally resolves to `../前端重构`; it is not inside the repository. Set `PIXEL_DESIGN_SOURCE_DIR` for asset extraction or the relevant `FRONTEND_REPLICA_DESIGN_*` variable for audit/diff scripts when the source lives elsewhere.

## Main Files

- `agent.md`: required rules for every pixel-replica thread.
- `DESIGN_SOURCE_INDEX.md`: human-readable index of the original design images.
- `DESIGN_TO_ROUTE_MAP.md`: mapping from current routes to primary and secondary design references.
- `PARALLEL_TASKS.md`: task sequencing and parallelization rules.
- `FILE_OWNERSHIP.md`: ownership boundaries for parallel work.
- `VISUAL_ASSET_CROP_PLAN.md`: where cropped assets may be used.
- `VISUAL_ONLY_RULES.md`: how to add mock/display-only modules safely.
- `PIXEL_ACCEPTANCE_CRITERIA.md`: scoring and acceptance rules.
- `CHANGE_REQUESTS.md`: cross-task change requests.
- `IMPLEMENTATION_LOG.md`: running implementation history.
- `prompts/`: prompts for P01, P02, P10, P20, P30, P40, P50, and P99.

## Workflow

1. Run P01 first to prepare asset cropping and screenshot comparison tools.
2. Run P02 second to align the app shell, navigation, and global frame.
3. Run P10, P20, P30, and P40 in parallel only after P01 and P02 are stable.
4. Run P50 after role pages converge.
5. Run P99 last for final merge, visual QA, and scoring.
