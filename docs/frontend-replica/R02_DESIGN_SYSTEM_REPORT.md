# R02 Design System Report

## Summary
- Task: FRONTEND-REPLICA-R02 global design system and application shell replica.
- Status: done.
- Scope source: R01 target docs plus `public/pixel-replica/manifest.json`.
- Boundary: kept existing routes, auth/role guards, demo/API data flows, vivo provider server boundary, fixed storybook/media assets, and `VoiceOrb` behavior unchanged.

## Implemented Coverage
- Global tokens: added R02 CSS variables for background, surfaces, primary/secondary colors, semantic colors, radius, shadow, spacing, gradients, shell dimensions, and focus motion tokens in `app/globals.css`.
- Tailwind v4 exposure: surfaced replica colors, radii, and shadows through `@theme inline`.
- Global shell: `components/Navbar.tsx` now exposes R02 testable shell hooks and reuses shared layout primitives for brand mark, breadcrumb, and mobile bottom navigation.
- Layout components: added shared shell primitives under `components/layout/*` for mobile bottom nav, brand mark/lockup, breadcrumb, account card, and icon button.
- Cards/components: added `components/cards/*` for `ReplicaPanel`, `ReplicaMetricCard`, `ReplicaActionCard`, `ReplicaStatusPill`, and `ReplicaAvatar`.
- Charts: added `components/charts/*` for `ReplicaChartFrame` and chart legend shell, then routed existing `ChartCard` through it.
- AI shell: added `components/ai/*` for `AssistantWorkspaceFrame`, prompt list, conversation panel, result card, and right rail.
- Shared UI convergence: updated button, input, app card, metric card, chart card, and toast classes to use R02 tokens while retaining existing component APIs.
- Role scaffold: migrated role `SectionCard`, `MetricGrid`, and `AgentWorkspaceCard` to shared replica primitives so teacher/parent role pages inherit the same shell.

## Not Changed
- No business data model changes.
- No route guard or permission rule changes.
- No `lib/providers/vivo/*` changes.
- No replacement or deletion of fixed storybook/media assets.
- No `VoiceOrb` behavior changes.
- No page-by-page R20/R30/R40/R50 deep pixel content replica in this round.

## Acceptance Notes
- Added `tests/frontend-replica/design-system.spec.ts`.
- Covered `/login`, `/admin`, `/teacher`, `/parent?child=c-1`, mobile `390x844`, AI entry visibility, and required image/resource availability.
- Existing local brain proxy fallback logs appear during Playwright runs when the local AI backend is not listening, but the product fallback paths keep the tests passing.
- This R02 commit also includes the pre-existing untracked R01 frontend replica documentation and `scripts/generate-r01-design-audit.mjs`, as requested for preserving R01 prerequisites.

## Test Results
| Command | Result |
| --- | --- |
| `npm run lint` | pass |
| `npm run build` | pass |
| `npm run product:smoke` | pass, 2 passed |
| `npm run product:journey` | pass, 1 passed |
| `npm run feature:smoke` | pass, 19 passed |
| `npx tsc --noEmit` | pass |
| `npx playwright test tests/frontend-replica/design-system.spec.ts --config=playwright.product.config.ts` | pass, 5 passed |
