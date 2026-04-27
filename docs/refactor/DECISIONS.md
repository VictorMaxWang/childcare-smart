# Frontend Refactor Decisions

## D001 - Design Images Are References Only

- Date: 2026-04-27
- Decision: GPT Image 2 output is a visual reference for layout, color, hierarchy, component rhythm, and product tone only.
- Rationale: Current code remains the source of truth for business fields, routes, interactions, permissions, and data flow.
- Consequence: Do not replace pages with screenshots or treat image text as canonical business copy.

## D002 - Converge 247 Images into One Design System

- Date: 2026-04-27
- Decision: The 247 design images may contain local style differences, but implementation must converge into one unified system.
- Rationale: A real SaaS product must feel consistent across login, director, teacher, parent, forms, modals, and mobile.
- Consequence: Follow `DESIGN_SYSTEM_SPEC.md` over any single image when references conflict.

## D003 - Keep T00 Non-UI

- Date: 2026-04-27
- Decision: T00 only creates scripts, docs, indexes, status files, prompts, and local design artifacts.
- Rationale: Master control should prepare sustainable parallel work without creating broad UI churn.
- Consequence: UI refactor starts from T01.

## D004 - Use CSS Variables as the Design Token Source

- Date: 2026-04-27
- Decision: T01 uses `app/globals.css` CSS variables plus Tailwind 4 `@theme inline` mapping as the single design token source.
- Rationale: The project already uses Tailwind CSS 4 without a separate Tailwind config file, and current components consume CSS variables.
- Consequence: Future visual work should extend the CSS variable set instead of creating parallel theme files or hard-coded page palettes.

## D005 - Extend the Existing `components/ui` Layer

- Date: 2026-04-27
- Decision: T01 enhances the existing Radix/CVA/Tailwind `components/ui` primitives and adds focused shared wrappers there.
- Rationale: The app already imports these primitives broadly, so evolving them reduces duplication and avoids introducing a second UI framework.
- Consequence: T02-T07 should prefer `components/ui/*` shared components before adding role-specific visual wrappers.

## D006 - Keep Demo Accounts as Code-Native Role Cards

- Date: 2026-04-27
- Decision: T02 presents demo accounts as code-native role cards rendered from `demoAccounts`, without showing or hardcoding demo passwords.
- Rationale: The current auth store remains the source of truth for demo account names, IDs, roles, descriptions, and landing routes; design images are visual references only.
- Consequence: The login page can improve visual hierarchy and role clarity while preserving click behavior for 陈园长、李老师、周老师、林妈妈.

## D007 - Use Desktop Sidebar and Tablet/Mobile Drawer for the Logged-In Shell

- Date: 2026-04-27
- Decision: T03 uses a desktop left sidebar plus sticky topbar for `lg+`, and keeps a grouped drawer for tablet/mobile widths.
- Rationale: Director and teacher pages need dense, predictable B2B navigation on desktop, while tablet/mobile needs the lowest-risk continuation of the existing drawer behavior and focus management.
- Consequence: `buildPrimaryNavItems` remains the permission source; `buildPrimaryNavGroups` only controls presentation grouping. No bottom navigation or separate mobile app rewrite is introduced.

## D008 - Scope T04 to Director/Admin Surfaces

- Date: 2026-04-27
- Decision: T04 refactors director/admin pages and shared management pages from the director perspective, but does not rewrite teacher-only or parent-only pages.
- Rationale: Teacher and parent flows have separate task ownership in T05 and T06. Broad rewrites would make it harder to preserve role-specific workflows, permissions, and visual intent.
- Consequence: `/teacher` and `/parent` are regression targets in T04 only; any deeper teacher/parent visual changes should happen in their assigned tasks.

## D009 - Use Desktop Tables and Mobile Cards on Shared Management Routes

- Date: 2026-04-27
- Decision: Shared management routes such as `/children` should favor scan-friendly tables on desktop and card/list layouts on tablet/mobile.
- Rationale: Director/admin users need dense comparison and operations efficiency on desktop, while narrow screens need readable stacked content without horizontal overflow.
- Consequence: Page data, actions, and fields remain unchanged; presentation can switch by breakpoint as long as every core field and operation entry remains available.

## D010 - Add Teacher Affordances to Shared Record Routes Instead of Forking Them

- Date: 2026-04-27
- Decision: T05 keeps `/children`, `/health`, `/growth`, and `/diet` as shared route files and adds teacher-only context/action surfaces guarded by `currentUser.role === "教师"`.
- Rationale: These pages already own the real record forms, filters, role visibility, and data mutation logic. Forking them for teachers would increase drift and risk changing field or permission behavior.
- Consequence: 李老师 and 周老师 see the same teacher visual system and class-aware shortcuts, while director/parent views keep the existing shared-route behavior and role-filtered data contracts.

## D011 - Keep Teacher Operation Helpers Presentation-Only

- Date: 2026-04-27
- Decision: T05 introduces `components/teacher/TeacherOperationKit.tsx` for teacher action tiles, context strips, mini panels, and task rows without embedding data fetching, mutation, or permission logic.
- Rationale: Teacher pages need a unified workbench rhythm, but business state remains in `useApp`, existing view models, and page-level handlers.
- Consequence: Future T06/T07 work can reuse the visual direction where appropriate without inheriting teacher-specific workflows or changing APIs.

## D012 - Use Mobile-First Parent Care Cards Without a Separate Mobile App Pattern

- Date: 2026-04-27
- Decision: T06 makes parent pages lighter and more life-oriented through mobile-first card flows, daily timelines, seven-day signals, and warm action entries, while staying inside the same product shell and route structure.
- Rationale: Parent users need fast reassurance and feedback paths on phones, but the product should still feel connected to director and teacher surfaces and preserve existing child query, feedback, AI, and storybook workflows.
- Consequence: No new bottom navigation, route fork, data schema, permission rule, or production dependency on design PNGs was introduced. The storybook remains an in-product viewer rather than a fully separate cartoon microsite.

## D013 - Keep T07 to Shared State and Responsive Closure

- Date: 2026-04-27
- Decision: T07 only unifies shared state, form, table, dialog, drawer, toast, and responsive behavior, with small page-level integrations where necessary.
- Rationale: T02-T06 already established role-specific page direction. Reworking whole business pages in T07 would increase regression risk and could accidentally change fields, permissions, route semantics, or destructive action flows.
- Consequence: T07 changes remain presentation-only. Business data structures, backend API calls, permission logic, routes, form submission handlers, delete handlers, upload handling, and persistent action semantics are preserved. Full screenshot comparison and final visual polish are left to T08.
