# SmartChildcare Design System Spec

## 1. Visual Keywords

Professional, trustworthy, warm, approachable, Chinese B2B SaaS, light background, calm data density, clear hierarchy, efficient daily operations.

The 247 design references may contain local style differences. Final implementation must converge into one coherent product system. Do not make different modules look like different products. Pixel-perfect recreation is not required; extract the unified style and implement it in real code.

## 2. Brand Colors

- Primary blue-violet: `#6366F1`
- Primary hover/deep: `#4F46E5`
- Soft primary background: `#EEF2FF`
- Blue support: `#0EA5E9`
- Teal support: `#14B8A6`

## 3. Supporting Colors

- Lavender: `#8B5CF6`
- Sky: `#38BDF8`
- Cyan: `#06B6D4`
- Emerald: `#10B981`
- Rose accent: `#F43F5E`

Use supporting colors as accents for module identity and data meaning. Avoid one-note pages dominated by one hue.

## 4. Status Colors

- Success: `#10B981`, background `#ECFDF5`
- Warning: `#F59E0B`, background `#FFFBEB`
- Danger: `#EF4444`, background `#FEF2F2`
- Info: `#0EA5E9`, background `#F0F9FF`

## 5. Background Colors

- App background: `#F8FAFC`
- Section background: `#F1F5F9`
- Card background: `#FFFFFF`
- Subtle tinted surface: `#F8FAFC` or `#EEF2FF`
- Border: `#E2E8F0`

## 6. Text Hierarchy

- Page title: 28-36px, semibold/bold, `#0F172A`
- Section title: 18-22px, semibold, `#0F172A`
- Body: 14-16px, regular, `#334155`
- Secondary: 13-14px, `#64748B`
- Helper/meta: 12px, `#94A3B8`

Do not use oversized hero typography inside dashboards, compact panels, cards, tables, sidebars, or tool surfaces.

## 7. Spacing

- Base unit: 4px
- Compact control gap: 8px
- Card internal padding: 16-24px
- Section gap: 24px
- Page horizontal padding: 16px mobile, 24px tablet, 32px desktop
- Keep dense operational pages scannable without crowded collisions.

## 8. Radius

- Buttons and inputs: 8px
- Cards and table containers: 8px preferred
- Dialogs and drawers: 12px
- Badges: pill radius allowed
- Avoid excessive roundness that makes the SaaS UI feel toy-like.

## 9. Shadows

- Default card: subtle `0 1px 2px rgba(15, 23, 42, 0.06)`
- Raised card: `0 8px 24px rgba(15, 23, 42, 0.08)`
- Dialog: `0 24px 64px rgba(15, 23, 42, 0.18)`
- Use shadows for hierarchy, not decoration.

## 10. Cards

- Use white surfaces, light borders, restrained shadows, and clear headers.
- Cards should group meaningful information or repeated items.
- Do not nest UI cards inside other cards unless the inner item is a real repeated child record.

## 11. Buttons

- Primary: blue-violet filled, white text.
- Secondary: light slate surface.
- Outline: white/transparent with border.
- Destructive: red, reserved for destructive actions.
- Icon buttons should use lucide icons with accessible labels.
- Preserve existing click handlers and disabled/loading states.

## 12. Inputs

- Height 40-44px desktop, at least 44px on mobile.
- Border `#CBD5E1`, focus ring primary.
- Labels remain visible and clear.
- Validation text uses status colors and does not shift layout unpredictably.

## 13. Tables

- Header background `#F8FAFC`.
- Clear row hover and selected states.
- Numeric columns align consistently.
- Important actions stay visible without crowding.
- On mobile, use cards or horizontal scroll only where needed.

## 14. Status Tags

- Use color by semantic meaning, not random module decoration.
- Keep tags short and readable.
- Use consistent variants for success, warning, danger, info, neutral, and pending.

## 15. Dialogs

- Use Radix dialog primitives already in `components/ui/dialog.tsx`.
- Dialogs need clear title, concise description, stable footer actions, and no hidden critical context.
- Confirmation dialogs must keep destructive semantics explicit.

## 16. Drawers

- If a drawer is introduced in later tasks, implement it as a shared primitive.
- Prefer drawers for mobile detail/edit flows, not desktop primary navigation unless justified.

## 17. Empty States

- Use one shared visual language for empty states.
- Include an icon, title, concise explanation, and optional action.
- Do not over-illustrate operational empty states.

## 18. Error States

- Keep errors actionable and readable.
- Preserve `app/error.tsx` reset behavior.
- Permission and forbidden states should explain lack of access without exposing sensitive details.

## 19. Left Navigation

- If introduced by T03, keep it dense, predictable, and role-aware.
- Existing route availability must remain consistent with `lib/navigation/primary-nav.ts`.

## 20. Top Navigation

- Keep brand, role identity, active route, and logout accessible.
- Avoid large marketing-style top bars in operational views.

## 21. Mobile Navigation

- Preserve the existing mobile drawer behavior and focus management.
- Touch targets must be at least 44px.
- Avoid horizontal overflow and text clipping.

## 22. Director Visual Principles

- Prioritize risk overview, weekly report, AI decision support, and management lists.
- Data and ranking must be scannable.
- Use charts sparingly and label them clearly.

## 23. Teacher Visual Principles

- Prioritize fast daily operation: morning check, meal records, growth observations, voice/AI assistance, high-risk consultation.
- Keep controls close to task context.
- Mobile ergonomics matter for teacher workflows.

## 24. Parent Visual Principles

- Prioritize readability, trust, child status, feedback, and mobile-friendly review.
- Use lower data density than director pages.
- Storybook remains interactive and should not become a static image.

## 25. Forbidden

- Do not change business logic, routes, backend APIs, permission rules, demo account flows, or data contracts for visual-only work.
- Do not use PNG design assets as production page bodies.
- Do not treat GPT Image 2 text as business copy truth.
- Do not delete existing routes or core fields.
- Do not create disconnected visual styles per module.
- Do not leave obvious misalignment, overflow, overlap, clipped text, broken responsive layout, or garbled text introduced by the refactor.

## 26. T01 Token Implementation

T01 implements the design system in `app/globals.css` as CSS variables and maps core variables through Tailwind 4 `@theme inline`.

Token groups now include:

- Brand colors: primary, primary hover, primary active, primary soft, blue, teal, lavender, sky, cyan, emerald, rose.
- Surfaces: app background, section, panel, panel subtle, card, hover surface, active surface.
- Text: primary, secondary, tertiary, helper, disabled.
- Borders: default, subtle, strong, divider, input, input hover.
- Status: success, warning, danger, info, neutral, pending with foreground, soft background, and border variables.
- Shape and elevation: radius XS/SM/MD/LG/XL/full; card, hover, raised, dialog, and focus shadows.
- Rhythm: page padding for mobile/tablet/desktop, section spacing, card padding.
- Typography and motion: helper/body/section/title sizes, regular/medium/semibold/bold weights, tight/normal/relaxed line heights, fast/base/slow durations, standard easing.

Use CSS variables for new component styling. Avoid creating a second Tailwind theme file unless the project later adopts a broader Tailwind configuration.

## 27. T01 Shared Component Rules

Shared components are implemented in `components/ui/**` and should be the first choice for later refactor threads.

- Use `Button`, `IconButton`, `StatusTag`, and `RoleBadge` for actions and status labels.
- Use `AppCard`, `MetricCard`, `ChartCard`, `InsightCard`, `QuickActionCard`, and `ResponsiveGrid` for dashboard and operational surfaces.
- Use `PageHeader`, `SectionHeader`, `FilterBar`, and `DataTableShell` for page/list scaffolding.
- Use `FormField`, `Input`, `Select`, `Textarea`, and `Label` for form presentation.
- Use `Dialog` for confirmation/form modals and `Drawer` for detail/filter/feedback flows.
- Use `EmptyState`, `ErrorState`, `PermissionState`, `LoadingState`, and `SkeletonBlock` from `state-block` for shared states.

These components are visual and layout helpers only. They must not own business data, permissions, route behavior, backend contracts, or demo-login behavior.

## 28. T01 Responsive Foundation

- Page-level spacing is available through `.app-page`.
- Card/table/list wrappers use 8-12px radius, subtle border, and restrained shadows.
- `DataTableShell` provides horizontal overflow containment for desktop table markup on narrow screens.
- `ResponsiveGrid` provides conservative 1/2/3/4-column breakpoints without forcing page-specific mobile card conversions.
- Drawer content is scrollable and width-constrained on mobile, but route-specific drawer usage remains for T03/T07.

## 29. T07 Shared State and Form Rules

- Use `FormField` for page-level add/edit/record forms when labels, required markers, helper text, or inline errors are needed.
- Inputs, selects, textareas, and buttons must keep at least 44px touch targets on mobile.
- Form grids should collapse to one column on mobile unless every field remains readable and tappable.
- Inline validation should use semantic status tokens and `aria-invalid` where the field itself is invalid.
- Disabled and loading states should be visible without changing the underlying submit/save/upload behavior.

## 30. T07 Dialog, Drawer, and Confirmation Rules

- Dialog content must fit within the mobile viewport and scroll internally when content is tall.
- Dialog footers should stack full-width actions on mobile and return to compact right-aligned actions on larger screens.
- Close buttons need a mobile-safe hit area.
- Destructive and bulk confirmation dialogs must include visible warning/danger context before the footer actions.
- Drawers should use constrained width, safe-area footer padding, and scrollable bodies.

## 31. T07 Empty, Error, Permission, Loading, and Toast Rules

- Empty, error, permission, loading, and skeleton states should come from `components/ui/state-block.tsx` or the legacy `components/EmptyState.tsx` wrapper.
- State copy should be calm, concise, and provide a recovery path when possible.
- Permission states should explain the boundary without leaking private data or suggesting the user can bypass role rules.
- Skeleton blocks should use subtle borders and tokenized muted surfaces, not decorative placeholder art.
- Toasts should use Sonner with the tokenized `toastOptions` in `app/layout.tsx`; page code should continue to call existing `toast.success/error/info` APIs.

## 32. T07 Responsive Guardrails

- Table overflow must be contained inside the table shell or `.app-table-scroll`, not at the document level.
- Action groups can wrap or stack on mobile; avoid squeezing labels into unreadable buttons.
- Status cards and alert text must use `min-w-0` and normal wrapping so long Chinese copy does not force horizontal overflow.
- Mobile bottom sheets and dialogs should account for `100dvh` and safe-area insets.
- T08 should treat any remaining document-level horizontal overflow at 390px as a regression unless it is deliberately contained inside a data table scroll area.
