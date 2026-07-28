# Component Inventory

## T01 Shared Design System Additions

Implemented in `components/ui/**`:

- Foundation: `AppCard`, `PageHeader`, `SectionHeader`, `ResponsiveGrid`.
- Actions: enhanced `Button` with `loading`, `primary`, and `danger`; new `IconButton`.
- Status: enhanced `Badge`; new `StatusTag` and `RoleBadge`.
- Metrics and data surfaces: `MetricCard`, `DataTableShell`, `ChartCard`, `InsightCard`, `QuickActionCard`.
- Forms and filters: enhanced `Input`, `Select`, `Textarea`, `Label`; new `FormField` and `FilterBar`.
- States: `StateBlock`, `EmptyState`, `ErrorState`, `PermissionState`, `LoadingState`, `SkeletonBlock`; legacy `components/EmptyState.tsx` now wraps the shared state component.
- Overlays: enhanced `Dialog`; new `Drawer` built on Radix Dialog primitives.
- Activity: `ActivityList` for timeline / operation-log style surfaces.

Recommended for T02-T07:

- Use `PageHeader`, `AppCard`, `MetricCard`, `StatusTag`, `FilterBar`, `DataTableShell`, `FormField`, and shared state components before creating role-specific wrappers.
- Keep role-specific pages responsible for data and interactions; use shared components only for presentation and layout.
- Continue migrating inline Tailwind tables/forms/cards gradually inside each role task.

## T02 Login Surface

- `app/login/page.tsx` remains the single source for the login page, registration dialog, and demo account entry surface.
- T02 now uses `FormField`, `Input`, `Button`, `IconButton`, `RoleBadge`, `StatusTag`, `Dialog`, and base `Card` primitives from `components/ui/**`.
- Login-specific helpers in `app/login/page.tsx`: role badge mapping, demo role labels, and the local `PasswordToggleButton` presentation helper. These helpers do not own auth, routing, API payloads, or demo account data.
- Demo role cards still render from `demoAccounts`; no demo password text is introduced.

## Layout Components

- `app/layout.tsx`: global app layout, `AppProvider`, logged-in `AppShell`, `Toaster`, Vercel Analytics.
- `components/Navbar.tsx`: default export is the logged-in `AppShell`; owns desktop left sidebar, sticky topbar, grouped role-aware navigation, role identity, current page title, user card, and logout visual entry.
- `components/MobileNav.tsx`: tablet/mobile drawer navigation with grouped menu sections, active state, focus management, Escape close, and body scroll lock.
- `components/role-shell/RoleScaffold.tsx`: shared role page container using `.app-page` and `PageHeader`, plus split layout, metric grid, section cards, assistant entry cards.
- `lib/navigation/primary-nav.ts`: `buildPrimaryNavItems` remains the source of truth for role menu availability; `buildPrimaryNavGroups` is presentation-only grouping for shell/sidebar/drawer.

Reusable: `AppShell`, `MobileNav`, `RolePageShell`, `RoleSplitLayout`, `SectionCard`, `MetricGrid`.

Needs follow-up: page-specific inline cards, tables, forms, and charts still need T04-T07 migration into the shared visual system.

## T04 Director/Admin Surfaces

- `app/page.tsx`: director data overview now uses the shared role shell, `MetricGrid`, `SectionCard`, weekly-report preview, chart surfaces, risk summaries, class status, and quick action links while retaining `useApp` and weekly-report data sources.
- `app/admin/page.tsx`: director home keeps the admin view model, consultation workspace, weekly preview, and dispatch behavior; layout now favors a dense operations dashboard with a persistent right-rail.
- `app/admin/agent/page.tsx`: daily assistant and weekly-report query mode share the same management workspace rhythm; AI request payloads, history, quick prompts, and notification/status actions remain page-owned.
- `components/admin/RiskPriorityBoard.tsx`: risk/priority list visual treatment aligned with T01/T03 status and card tokens.
- `components/admin/DirectorDecisionCard.tsx`: director decision cards use tighter tokenized surfaces and preserve decision/workflow content.
- `components/admin/AdminQualityMetricsPanel.tsx`: quality and warning panels keep existing metrics while using unified metric-card styling.
- `components/weekly-report/WeeklyReportPreviewCard.tsx`: weekly-report preview cards/alerts normalized for director dashboard use.

Reusable: `RolePageShell`, `RoleSplitLayout`, `MetricGrid`, `SectionCard`, `MetricCard`, `ChartCard`, `StatusTag`, `ActivityList`, `QuickActionCard`, `WeeklyReportPreviewCard`, admin risk/decision/quality panels.

Needs follow-up: deeper zero-warning chart container tuning can move to T07; T05/T06 should not inherit director-only content hierarchy into teacher/parent pages without role-specific adjustment.

## T04 Director Shared Management Pages

- `app/children/page.tsx`: director desktop uses `DataTableShell`, `FilterBar`, `MetricCard`, and `StatusTag`; tablet/mobile keeps card reading patterns. Add/edit/delete/attendance/search logic remains owned by the page.
- `app/health/page.tsx`: health overview uses `MetricCard`, `ChartCard`, `FilterBar`, and `StatusTag`; abnormal detection and `upsertHealthCheck` remain unchanged.
- `app/growth/page.tsx`: growth records use shared metric/chart/filter shells around the existing structured observation form, dimension filters, review status, and `addGrowthRecord`.
- `app/diet/page.tsx`: diet operations now has director-facing metrics before the existing batch-entry, allergy-preview, AI vision, nutrition advice, and confirmation areas.

Reusable: `DataTableShell`, `FilterBar`, `MetricCard`, `ChartCard`, `StatusTag`, existing dialogs/forms.

Needs follow-up: T05 can adapt these shared-route improvements for teacher workflows without rewriting director-specific dashboard emphasis; T06 should verify parent permissions and constrained child visibility after shared page changes.

## Buttons

- `components/ui/button.tsx`: shared `Button` variants using `class-variance-authority`.
- T01 added `primary` and `danger` aliases, loading state, token-based hover/focus/disabled styling, and preserved existing `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`, and `premium`.
- `components/ui/icon-button.tsx`: accessible icon-only button wrapper.
- Inline buttons also appear in page files with direct Tailwind classes.

Reusable: `Button`.

Needs follow-up: migrate page-level inline buttons gradually in T02-T07.

## Cards

- `components/ui/card.tsx`: base card primitives.
- `components/ui/app-card.tsx`: shared card shell with title, description, actions, content, and footer.
- `components/ui/metric-card.tsx`, `components/ui/chart-card.tsx`, `components/ui/insight-card.tsx`, `components/ui/quick-action-card.tsx`: reusable data and action card patterns.
- `components/role-shell/RoleScaffold.tsx`: `SectionCard`, `AssistantEntryCard`, metric cards.
- Role-specific cards in `components/admin/*`, `components/teacher/*`, `components/parent/*`, `components/consultation/*`.

Reusable: base `Card`, `SectionCard`, role-specific cards after style cleanup.

Needs follow-up: migrate role shell and role-specific cards to the T01 token rhythm in T03-T06.

## Tables and List Surfaces

- Table/list behavior is mostly page-level in `app/children/page.tsx`, `app/health/page.tsx`, `app/growth/page.tsx`, `app/diet/page.tsx`.
- `components/ui/data-table-shell.tsx`: shared table/list container with header, action area, empty state slot, horizontal scroll, and footer.
- `components/ui/activity-list.tsx`: reusable activity / timeline list surface.
- Risk and priority lists appear in `components/admin/RiskPriorityBoard.tsx`.
- Draft and history lists appear in `components/teacher/DraftRecordList.tsx`, `components/teacher/TeacherAgentHistoryList.tsx`.

Needs follow-up: keep table data rendering page-owned, but wrap list pages with `DataTableShell` during T04-T07.

## Forms

- `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/select.tsx`, `components/ui/textarea.tsx`.
- T01 normalized input/select/textarea token styling, hover/focus/invalid/disabled states, and mobile-safe control height.
- `components/ui/form-field.tsx`: shared label, required marker, helper text, and error message wrapper.
- `components/ui/filter-bar.tsx`: shared search/filter/action/reset container for list pages.
- Page-level forms exist in login/registration, children, health, growth, diet, teacher agent, parent feedback.

Reusable: shared UI primitives.

Needs follow-up: migrate page-level validation and filter layouts in T02, T04, T05, and T06.

## Modals and Dialogs

- `components/ui/dialog.tsx`: Radix dialog primitive wrapper.
- T01 normalized overlay, panel radius, shadow, scrollable mobile content, close button, title, description, and footer spacing.
- `components/ui/drawer.tsx`: shared drawer primitive for future detail, filter, and feedback flows.
- Confirmation and form dialogs appear in login, children, health, diet.

Reusable: `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`.

Needs follow-up: apply consistent destructive confirmation copy and `Drawer` usage in T07 where needed.

## Charts

- Recharts used in `app/page.tsx`, parent trend components, admin quality panels, and weekly/analytics surfaces.
- `components/parent/TrendLineChart.tsx` is a reusable parent trend chart.

Needs unification: tooltip styling, axis text, chart container height, color palette.

## Tags and Status

- `components/ui/badge.tsx`: shared badge variants.
- `components/ui/status-tag.tsx`: semantic status tag for success, warning, danger, info, neutral, and pending.
- `components/ui/role-badge.tsx`: role label wrapper for director/admin, teacher, parent, system, and guest.
- Status labels also appear inline in role pages.

Reusable: `Badge`, `StatusTag`, `RoleBadge`.

Needs follow-up: migrate inline role/status pills in T03-T07.

## State Components

- `components/EmptyState.tsx`: empty state.
- T01 keeps the old `components/EmptyState.tsx` API and routes it through `components/ui/state-block.tsx`.
- `components/ui/state-block.tsx`: shared empty, error, permission, loading, and skeleton components.
- `app/error.tsx`: global error state.
- `app/loading.tsx`: global loading state.

Reusable: existing state components.

Needs follow-up: route-level `app/error.tsx` and `app/loading.tsx` visual cleanup remains in T07.

## Role-Specific Components

- Admin: `components/admin/*`, `components/consultation/*`, `components/weekly-report/*`.
- Teacher: `components/teacher/*`, consultation components, voice assistant layer.
- Parent: `components/parent/*`, `components/agent/InterventionCardPanel.tsx`.

Needs care: preserve business data, streaming, voice, storybook, and feedback behavior while improving presentation.

## T05 Teacher Surfaces

- `components/teacher/TeacherOperationKit.tsx`: teacher-specific presentation helpers for action tiles, context strips, mini panels, and task rows. These helpers are visual-only and wrap existing routes/data.
- `components/teacher/TeacherWorkbenchPage.tsx`: teacher workbench now composes class context, today priority, high-frequency records, parent communication, health parsing, and high-risk consultation entries.
- `app/teacher/agent/page.tsx`: teacher AI assistant uses teacher context strips/action tiles and keeps existing workflow, draft, reminder, weekly report, and API payload logic.
- `app/teacher/health-file-bridge/page.tsx`: health material parsing uses teacher context, upload checklist, fact/risk/detail cards, and side summaries; parsing request logic remains page-owned.
- `app/teacher/high-risk-consultation/page.tsx`: high-risk consultation uses teacher context, consultation rhythm, tighter input/trace/result surfaces, and existing stream/write-back logic.
- `components/teacher/DraftRecordCard.tsx`, `DraftRecordList.tsx`, `TeacherDraftConfirmationPanel.tsx`, `TeacherAgentResultCard.tsx`, `TeacherAgentHistoryList.tsx`, `TeacherCopilotPanel.tsx`: aligned with the T05 teacher card rhythm while preserving props and record handling.

Reusable: `TeacherActionTile`, `TeacherContextStrip`, `TeacherMiniPanel`, `TeacherTaskRow`, `RolePageShell`, `RoleSplitLayout`, `SectionCard`, `MetricCard`, `FilterBar`, `ChartCard`, `Badge`, `Button`.

## T05 Shared Teacher Record Routes

- `app/children/page.tsx`: teacher-only roster operation panel and quick entries added beside existing child management fields and actions.
- `app/health/page.tsx`: teacher-only morning-check queue and quick follow-up entries added; `upsertHealthCheck` and abnormal filtering unchanged.
- `app/growth/page.tsx`: teacher-only observation context, review focus list, and communication entries added; `addGrowthRecord`, filters, charts, and timeline unchanged.
- `app/diet/page.tsx`: teacher-only meal coverage, allergy/batch guidance, and communication entries added; batch template, preview, vision upload, and meal save logic unchanged.

Needs follow-up: T07 should run whole-site responsive QA after T06 parent pages are complete, especially across shared `/children`, `/health`, `/growth`, and `/diet` routes.

## T05 Consultation Presentation Components

- `components/consultation/ConsultationQaPanel.tsx`, `ConsultationStageTimeline.tsx`, `ConsultationStoryCard.tsx`, `ConsultationSummaryCard.tsx`, `ConsultationTracePanel.tsx`, `FollowUp48hCard.tsx`, `TraceStepCard.tsx`: tightened high-risk consultation cards and trace blocks to the same teacher presentation rhythm.

Needs care: these components can also appear in director contexts; T05 changed presentation only and kept trace view models, props, and streaming data contracts unchanged.

## T06 Parent Surfaces

- `components/parent/ParentReviewKit.tsx`: parent-specific presentation helpers for child status hero cards, status pills, today timeline cards, seven-day signal grids, action cards, and gentle care notices. These helpers do not fetch data, submit feedback, or own permission decisions.
- `app/parent/page.tsx`: parent home now composes child overview, today status, morning-check/meal/growth/feedback timeline, action entries, weekly signals, care mode, and weekly preview from the existing `getParentFeed()` page data.
- `app/parent/agent/page.tsx`: parent AI/feedback page now uses the same parent card flow for home-collaboration context, trend signals, feedback entry, and storybook entry while preserving trend query, AI suggestions, reminder, voice, and structured feedback handlers.
- `components/parent/ParentStructuredFeedbackComposer.tsx`, `ParentVoiceNoteInput.tsx`, `ParentTrendResponseCard.tsx`, `TrendLineChart.tsx`, `ParentCareFocusCard.tsx`, and `ParentTransparencyPanel.tsx`: visually aligned with the T06 parent rhythm while preserving component props and callbacks.
- `components/parent/StoryBookViewer.tsx`: storybook viewer remains the interactive generation/reading component and now uses calmer product-native panels, mobile-safe controls, and scene cards instead of an isolated cartoon surface.

Reusable: `ParentHeroCard`, `ParentStatusPill`, `ParentTimelineCard`, `ParentWeeklySignalGrid`, `ParentActionCard`, `ParentGentleNotice`, `RolePageShell`, `RoleSplitLayout`, `SectionCard`, `Badge`, `Button`.

Needs follow-up: T07 should run whole-site state/responsive QA and decide whether parent empty/loading/error states need shared T07 treatment beyond the surfaces touched here.

## T07 Shared States and Responsive Completion

- `components/ui/state-block.tsx`: final shared surface for `EmptyState`, `ErrorState`, `PermissionState`, `LoadingState`, and `SkeletonBlock`. T07 aligned icon wells, copy width, alert semantics, action stacking, skeleton borders, and mobile wrapping while keeping exports stable.
- `app/error.tsx` and `app/loading.tsx`: now consume shared state primitives instead of route-local state markup. Error reset and return-home behavior remain unchanged.
- `components/ui/dialog.tsx`: shared Radix dialog wrapper now provides mobile viewport max-height, internal overflow scrolling, a larger touch close button, and mobile full-width footer buttons.
- `components/ui/drawer.tsx`: shared drawer wrapper now has constrained mobile widths, safe-area footer padding, scrollable body spacing, and full-width mobile footer buttons.
- `components/ui/form-field.tsx`: shared label/required/helper/error wrapper used by child profile, morning check, growth observation, and diet forms.
- `components/ui/filter-bar.tsx`: shared list/filter/search shell now gives controls mobile-safe min-height, wrapping, and min-width protection.
- `components/ui/button.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`: T07 normalized mobile touch targets and disabled/loading-ready dimensions across form surfaces.
- `app/layout.tsx`: Sonner `Toaster` is tokenized through `toastOptions.classNames` while preserving behavior and position.

Reusable: these T07 shared primitives remain presentation-only. They do not fetch data, own permissions, mutate records, or change route behavior.

## T07 Page-Level Integrations

- `app/children/page.tsx`: child add/edit dialog now uses `FormField` for all existing fields, keeps required validation copy visible, and adds a destructive warning panel to delete confirmation without changing the delete callback.
- `app/health/page.tsx`: parent access now uses `PermissionState`; morning-check dialog uses `FormField` for temperature, hand/mouth/eye, mood, and remark; temperature warning remains the existing threshold.
- `app/growth/page.tsx`: growth observation form uses `FormField` for child, dimension, tags, description, follow-up, and review date while keeping `addGrowthRecord` data unchanged.
- `app/diet/page.tsx`: batch entry and single-meal edit controls use `FormField`; upload labels now show disabled/loading states; batch confirmation includes a warning panel while preserving the final confirmation handler.
- `components/parent/ParentStructuredFeedbackComposer.tsx`: mobile action rows stack cleanly and validation/status text uses shared alert-style tokens.
- `components/teacher/VoiceAssistantFAB.tsx`: result dialog is constrained to the viewport on mobile and scrolls internally.

Needs follow-up: T08 should run the full screenshot review because the T07 `capture:ui` run timed out before completing the teacher and parent screenshot sets.
