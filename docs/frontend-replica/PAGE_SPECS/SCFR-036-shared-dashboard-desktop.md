# SCFR-036-shared-dashboard-desktop

## Source
- Design file: `smartchildcare_images_part_02_of_08/images/child_meal_records_dashboard_interface.png`
- Actual file: `smartchildcare_images_part_02_of_08/images/child_meal_records_dashboard_interface.png`
- Source status: ok (Inventory path exists on disk.)
- File name: `child_meal_records_dashboard_interface.png`
- Priority: P1
- Original role: shared
- Normalized role: shared
- Page type: shared
- Target route: `/children`
- Current project route: `/children`
- Route exists: yes
- Query state: none
- Hash state: none
- Viewport: desktop 1448x1086
- Image size: 1448x1086
- Owner task: R50

## Visual Structure
- Background: Very light blue-gray app background with white translucent surfaces.
- Top bar: Role-aware topbar with title, quick actions, identity, and state badges.
- Sidebar: Left navigation rail/sidebar is expected for admin/shared desktop shells.
- Bottom nav: Not primary for this viewport.
- Main content: Child records/profile management with cards, table/list, archive or profile actions.
- Card layout: Rounded white cards with subtle blue-purple shadow; preserve card density and hierarchy from the reference image.
- Chart area: Dedicated chart cards with axis/legend/tooltip states; bind real demo/API/selector data.
- AI assistant area: No primary assistant target in this reference.
- Forms: Only route-specific filters, search, feedback, record, or export forms as shown.
- Modal/drawer/state: No modal/drawer target in this image.

## Visual Tokens
- Primary color: #655BFF
- Secondary colors: #21C6C1 / #38BDF8 for informational accents when present.
- Background color: #FFFFFF
- Extracted palette: `#FFFFFF`, `#F0F0F0`, `#F0F0FF`, `#F0FFFF`, `#E0E0FF`, `#E0E0E0`
- Gradient: Soft blue/purple/cyan gradients only where visible in reference hero, assistant, or chart emphasis.
- Shadow: Soft blue-purple card shadow, low opacity; avoid heavy dark shadow.
- Radius: Cards 16-24px; controls 10-16px; pills full radius.
- Typography: Chinese system font; compact dashboard text; bold section titles; no viewport-width font scaling.
- Spacing: Desktop grid gutters 20-32px; card padding 18-28px.
- Icon style: Lucide-like line icons or soft duotone icons; consistent stroke weight; no decorative-only replacement for real controls.
- Tag style: Small rounded pills with semantic color fills/borders for risk, status, AI, and role labels.

## Functional Goals
- Data to show: child profiles; record summaries; archive/delete state
- Clickable controls: create/edit child; archive/restore; open profile details
- Required interactions: chart hover tooltip; legend scan; loading/empty/error state handling

## Chart Target
- Chart types: bar chart, line chart, nutrition score/KPI
- Title: Dashboard metrics
- Metrics: child profile count, record count, risk/status distribution
- Colors: #655BFF, #21C6C1, #F59E0B, #EF4444, #10B981
- Axes: Use compact labels, light grid lines, and avoid clipped axis text across desktop/mobile/tablet.
- Legend: Show only when multiple series/distributions are present; match design pill/dot style.
- Tooltip: Hover/tap tooltip must show metric label, value, time/category, and semantic status where useful.
- Empty state: Show route-specific empty copy and preserve chart card height.
- Loading state: Use skeleton or muted loading state; do not flash fake final values.
- Data source: Shared app store/demo selectors and route-specific API handlers.
- Current API/selector: app/children/page.tsx, app/api/children/*, app/api/records/*

## Current Project Gap
- Implemented: Canonical route exists in current project map.
- Partially implemented / needs audit: Chart visual and data binding require R05 verification.
- Not implemented: none
- UI mismatch: Likely UI parity gap; verify against screenshot in R90.
- Functional mismatch: Static hardcoded chart values are not acceptable; bind demo/API/selector data.

## Acceptance Notes
- This is an R01 documentation spec only; no UI source is changed here.
- Later implementation must use real DOM/components and must not use the full design PNG as a page background.
- Later visual QA must capture the exact route/query/hash/modal state named above.
