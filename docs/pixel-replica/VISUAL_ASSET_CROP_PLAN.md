# Visual Asset Crop Plan

Design source:

`C:\Users\12804\Desktop\childcare-smart源代码\前端重构`

## Purpose

Cropped design assets are allowed in this phase when they increase visual fidelity without replacing core interactive UI.

## Allowed Crop Targets

- Background accents.
- Illustrations.
- Icons and symbolic decorations.
- Empty state art.
- Storybook images.
- Decorative cards.
- Non-interactive explanation blocks.
- Visual-only charts or preview panels when the underlying data is mock/display-only.

## Not Allowed

- Full-page screenshot backgrounds.
- Cropped screenshots used as the only body of an interactive page.
- Cropped login forms replacing real inputs.
- Cropped tables replacing real data tables where interaction or role-filtered data matters.
- Cropped buttons that appear usable but trigger unsafe real actions.

## Output Location

P01 created cropped assets under `public/pixel-replica/` because this repository does not use a `src/` directory.

Created subdirectories:

- `public/pixel-replica/crops/`
- `public/pixel-replica/backgrounds/`
- `public/pixel-replica/illustrations/`
- `public/pixel-replica/icons/`
- `public/pixel-replica/storybook/`
- `public/pixel-replica/empty-states/`
- `public/pixel-replica/charts/`
- `public/pixel-replica/visual-cards/`

Runtime manifest:

- `public/pixel-replica/manifest.json`
- `assetRoot`: `public/pixel-replica`
- `publicBasePath`: `/pixel-replica`

## Required Metadata

Every crop should record:

- Source design absolute path.
- Crop rectangle.
- Output path.
- Intended route.
- Whether it is decorative or visual-only.
- Whether it is safe for production runtime.
- Whether it needs manual crop review.

## P01 Generated Candidates

P01 generated 10 reusable crop candidates. All are marked `needsManualCrop: true` because the first pass uses deterministic heuristic crops rather than hand-tuned pixel rectangles.

- `login-left-illustration`
- `login-gradient-accent`
- `director-dashboard-card-cluster`
- `director-ai-decoration-card`
- `teacher-workbench-card-cluster`
- `parent-home-card-cluster`
- `storybook-illustration-panel`
- `empty-state-locked-content`
- `weekly-report-chart-decoration`
- `design-system-icon-candidate-set`
