# Pixel Replica Mode Agent Rules

Updated: 2026-04-28

This document governs the SmartChildcare pixel replica phase.

## Fixed Inputs

- Project repository: `C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart`
- Original design source directory: `C:\Users\12804\Desktop\childcare-smart源代码\前端重构`
- The design source directory is outside the project repository and is a sibling of `childcare-smart`.
- Do not guess design files inside the repository.
- Do not treat `artifacts/refactor-design-assets/` as the only source of truth.

## Goal

The goal of this phase is pixel-level visual replication of the GPT Image 2 design images.

Priority order:

1. Visual match to the design images.
2. Page layout match.
3. Color, cards, navigation, tables, buttons, dialogs, illustration, empty states, and chart styling match.
4. Responsive match.
5. Preserve basic routes and demo accounts.
6. Preserve real business entry points.

Visual replication has higher priority than conservative componentization in this phase.

## Allowed

- Add visual-only frontend modules.
- Use mock or display-only data when the design shows modules not backed by current business logic.
- Crop visual assets from the design images.
- Use cropped assets for backgrounds, illustrations, icons, empty states, storybook visuals, decorative cards, and non-interactive visual regions.
- Restructure layouts and CSS substantially when needed for visual match.
- Add local frontend state and fake interaction for visual-only modules.

## Required Boundaries

- Core interactive regions should still be recreated with real HTML and CSS where feasible.
- Do not turn an entire page into one full-screen static screenshot.
- Do not change backend API protocols.
- Do not delete existing routes.
- Do not break demo account entry points.
- Do not break login flow, role permissions, or route guards.
- Do not make dangerous actions look usable if clicking them causes real delete, submit, send, or upload side effects.
- Do not include sensitive real information.
- Do not add `node_modules`, Playwright traces, videos, or large temporary files to deliverables.

## Thread Requirements

Every pixel-replica subthread must:

1. Read this file before changing code.
2. Read `docs/pixel-replica/DESIGN_SOURCE_INDEX.md`.
3. Read `docs/pixel-replica/DESIGN_TO_ROUTE_MAP.md`.
4. Use design references from `C:\Users\12804\Desktop\childcare-smart源代码\前端重构`.
5. Capture the current page screenshot before edits.
6. Compare the current screenshot with the target design reference.
7. Implement visual changes.
8. Capture the modified page screenshot.
9. Score visual closeness from 0 to 100.
10. Record differences, fixes, and remaining gaps in `docs/pixel-replica/IMPLEMENTATION_LOG.md`.
11. Continue reworking any page below its target threshold.

Completion thresholds:

- Critical pages: visual closeness >= 95.
- High-priority pages: visual closeness >= 90.
- Medium-priority pages: visual closeness >= 85.
- Any page below 90 cannot be declared complete if its assigned target is critical or high.

