# Frontend Refactor Task Sequence

## T00: Master Control Initialization and Design Asset Prep

- taskId: T00
- taskName: Master control initialization and design asset prep
- goal: Build the refactor control system, extract design images, generate indexes, and establish shared rules.
- dependsOn: none
- allowedScope: `scripts/prepare-refactor-design-assets.mjs`, `docs/refactor/**`, `AGENTS.md`, `artifacts/refactor-design-assets/**`
- forbiddenScope: UI page redesign, backend APIs, route behavior, auth/session logic, demo account behavior
- keyRoutes: all routes for mapping only
- designRefs: `artifacts/refactor-design-assets/design-images.index.json`, `docs/refactor/DESIGN_ASSET_INDEX.md`
- acceptanceCriteria: 247 design PNGs are indexed, control docs exist, follow-up task prompts exist, lint/build results are recorded.
- requiredChecks: `npm run lint`, `npm run build`

## T01: Design System Foundation and Shared Components

- taskId: T01
- taskName: Design system foundation and shared components
- goal: Establish reusable visual tokens and normalize shared UI primitives.
- dependsOn: T00
- allowedScope: `app/globals.css`, `components/ui/**`, shared layout helpers, lightweight component documentation
- forbiddenScope: business logic, API calls, route removals, demo account flows, role-specific page rewrites
- keyRoutes: all routes indirectly through shared components
- designRefs: design-system, login, dashboard, shared-state references from `DESIGN_ASSET_INDEX.md`
- acceptanceCriteria: Buttons, cards, inputs, labels, dialogs, badges, progress, select, textarea, and base surfaces follow one visual language without breaking existing usage.
- requiredChecks: `npm run lint`, `npm run build`

## T02: Login, Registration, and Demo Entry

- taskId: T02
- taskName: Login page, registration dialog, and demo entry
- goal: Refactor `/login` into the new style while preserving normal login, registration, and demo account entry points.
- dependsOn: T01
- allowedScope: `app/login/page.tsx`, login-specific styling, registration dialog visual styling
- forbiddenScope: auth API changes, password/session logic changes, removal of `/auth/login` redirect, demo account ID or landing-route changes
- keyRoutes: `/login`, `/auth/login`
- designRefs: login and registration assets from `DESIGN_ASSET_INDEX.md`
- acceptanceCriteria: Three demo roles can still enter their expected landing pages; registration dialog remains functional; desktop/tablet/mobile layouts are usable.
- requiredChecks: `npm run lint`, `npm run build`, targeted login smoke check

## T03: App Shell, Navigation, Layout, and Responsive Frame

- taskId: T03
- taskName: App Shell, navigation, layout, and responsive frame
- goal: Make global navigation, mobile drawer, and role-page shell consistent with the design system.
- dependsOn: T01
- allowedScope: `components/Navbar.tsx`, `components/MobileNav.tsx`, `components/role-shell/RoleScaffold.tsx`, `app/layout.tsx`, navigation styling
- forbiddenScope: route deletion, nav item permission changes unless already represented in `lib/navigation/primary-nav.ts`
- keyRoutes: `/`, `/admin`, `/teacher`, `/parent`, all role pages through shell
- designRefs: dashboard, mobile, shared navigation references
- acceptanceCriteria: Desktop and mobile navigation remain accessible, active state is clear, role identity remains visible, no layout overflow.
- requiredChecks: `npm run lint`, `npm run build`, navigation smoke check on desktop/mobile

## T04: Director Pages Refactor

- taskId: T04
- taskName: Director pages refactor
- goal: Refactor director/admin surfaces for data density, risk management, AI assistance, weekly reports, and management lists.
- dependsOn: T01, T03
- allowedScope: `/`, `/admin`, `/admin/agent`, shared management views used by director role, director-specific components
- forbiddenScope: backend APIs, AI payload contracts, role permission rules, teacher/parent page rewrites beyond shared components
- keyRoutes: `/`, `/admin`, `/admin/agent`, `/admin/agent?action=weekly-report`, `/children`, `/health`, `/growth`, `/diet`
- designRefs: director, dashboard, weekly-report, chart, table, list assets
- acceptanceCriteria: Director pages feel like one product, preserve all existing data and actions, improve table/card readability, maintain weekly report and AI assistant flows.
- requiredChecks: `npm run lint`, `npm run build`, director route smoke check

## T05: Teacher Pages Refactor

- taskId: T05
- taskName: Teacher pages refactor
- goal: Refactor teacher workbench, AI assistant, health material parsing, and high-risk consultation around high-frequency operations.
- dependsOn: T01, T03
- allowedScope: `app/teacher/**`, `components/teacher/**`, consultation presentation components used by teacher pages
- forbiddenScope: API contracts, draft-record data model changes, voice upload behavior changes, director/parent page rewrites beyond shared components
- keyRoutes: `/teacher`, `/teacher/home`, `/teacher/agent`, `/teacher/health-file-bridge`, `/teacher/high-risk-consultation`
- designRefs: teacher, health, ai-assistant, mobile, form assets
- acceptanceCriteria: Teacher flows remain fast and task-oriented; voice/AI/draft/consultation states remain available; mobile safe area is preserved.
- requiredChecks: `npm run lint`, `npm run build`, teacher route smoke check

## T06: Parent Pages Refactor

- taskId: T06
- taskName: Parent pages refactor
- goal: Refactor parent home, AI assistant, feedback, and storybook for readable, mobile-friendly review and response.
- dependsOn: T01, T03
- allowedScope: `app/parent/**`, `components/parent/**`, parent-facing cards and feedback surfaces
- forbiddenScope: parent route guards, media API contracts, generated storybook business logic, teacher/director page rewrites beyond shared components
- keyRoutes: `/parent`, `/parent?child=c-1`, `/parent/agent?child=c-1`, `/parent/agent?child=c-1#feedback`, `/parent/storybook?child=c-1`
- designRefs: parent, feedback, storybook, mobile assets
- acceptanceCriteria: Parent pages remain easy to read on mobile; feedback loop remains intact; storybook stays interactive and not static.
- requiredChecks: `npm run lint`, `npm run build`, parent route smoke check

## T07: Shared States, Forms, Modals, Drawers, Empty/Error States, Responsive Completion

- taskId: T07
- taskName: Shared states and responsive completion
- goal: Normalize shared forms, validation states, dialogs, drawers, empty states, error states, permission states, and responsive edge cases.
- dependsOn: T02, T04, T05, T06
- allowedScope: shared state components, form presentation, modal/drawer presentation, route-level loading/error visuals, responsive fixes
- forbiddenScope: destructive action semantics, validation business rules, permissions, backend contracts
- keyRoutes: all role routes, `app/error.tsx`, `app/loading.tsx`, shared dialogs and empty states
- designRefs: modal, form, empty, error, permission, mobile assets
- acceptanceCriteria: No obvious overflow, collision, unreadable table, broken dialog, or inconsistent state presentation across roles.
- requiredChecks: `npm run lint`, `npm run build`, targeted state screenshots

## T08: Full-Site Visual QA and Final Unification

- taskId: T08
- taskName: Full-site visual QA and final unification
- goal: Verify the full visual refactor against routes, roles, screenshots, and design assets; make final consistency fixes.
- dependsOn: T02, T03, T04, T05, T06, T07
- allowedScope: small consistency fixes, QA docs, screenshot artifacts, status logs
- forbiddenScope: new feature work, business logic changes, large page redesigns not tied to QA findings
- keyRoutes: all routes in `ROUTE_PAGE_MAP.md`
- designRefs: full `DESIGN_ASSET_INDEX.md`, `artifacts/ui-screenshots/**`, `artifacts/gpt-image2-input/**`
- acceptanceCriteria: `lint`, `build`, and visual capture complete or failures are documented; major visual inconsistencies are fixed or logged; final status is clear.
- requiredChecks: `npm run lint`, `npm run build`, `npm run capture:ui`, optional `npm run package:gpt-image2`
