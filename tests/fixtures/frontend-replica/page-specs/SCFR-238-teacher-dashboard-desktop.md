# SCFR-238-teacher-dashboard-desktop

## Source
- Design file: `smartchildcare_images_part_08_of_08/images/teacher_parent_communication_dashboard_in_pastel_c.png`
- Actual file: `smartchildcare_images_part_08_of_08/images/teacher_parent_communication_dashboard_in_pastel_c.png`
- Source status: ok (Inventory path exists on disk.)
- File name: `teacher_parent_communication_dashboard_in_pastel_c.png`
- Priority: P0
- Original role: teacher
- Normalized role: teacher
- Page type: teacher
- Target route: `/teacher/agent?action=communication`
- Current project route: `/teacher/agent?action=communication`
- Route exists: yes
- Query state: `action=communication`
- Hash state: none
- Viewport: desktop 1448x1086
- Image size: 1448x1086
- Owner task: R30

## Visual Structure
- Background: Very light blue-gray app background with white translucent surfaces.
- Top bar: Role-aware topbar with title, quick actions, identity, and state badges.
- Sidebar: Left navigation rail/sidebar is expected for admin/shared desktop shells.
- Bottom nav: Not primary for this viewport.
- Main content: Teacher communication workflow with message drafts, child context, parent feedback, and AI suggestions.
- Card layout: Rounded white cards with subtle blue-purple shadow; preserve card density and hierarchy from the reference image.
- Chart area: Dedicated chart cards with axis/legend/tooltip states; bind real demo/API/selector data.
- AI assistant area: No primary assistant target in this reference.
- Forms: Only route-specific filters, search, feedback, record, or export forms as shown.
- Modal/drawer/state: No modal/drawer target in this image.

## Visual Tokens
- Primary color: #655BFF
- Secondary colors: #21C6C1 / #38BDF8 for informational accents when present.
- Background color: #FFFFFF
- Extracted palette: `#FFFFFF`, `#F0F0FF`, `#F0F0F0`, `#E0E0F0`, `#E0E0E0`, `#E0E0FF`
- Gradient: Soft blue/purple/cyan gradients only where visible in reference hero, assistant, or chart emphasis.
- Shadow: Soft blue-purple card shadow, low opacity; avoid heavy dark shadow.
- Radius: Cards 16-24px; controls 10-16px; pills full radius.
- Typography: Chinese system font; compact dashboard text; bold section titles; no viewport-width font scaling.
- Spacing: Desktop grid gutters 20-32px; card padding 18-28px.
- Icon style: Lucide-like line icons or soft duotone icons; consistent stroke weight; no decorative-only replacement for real controls.
- Tag style: Small rounded pills with semantic color fills/borders for risk, status, AI, and role labels.

## Functional Goals
- Data to show: class children; morning checks; growth records; parent communication queue
- Clickable controls: add record; open AI suggestion; send or save communication draft
- Required interactions: chart hover tooltip; legend scan; loading/empty/error state handling

## Chart Target
- Chart types: class KPI cards, bar/list summary
- Title: Class workbench summary / 班级工作台概览
- Metrics: visible children, morning-check completion, pending reviews, parent messages, class activity
- Colors: #655BFF, #21C6C1, #F59E0B, #EF4444, #10B981
- Axes: Use compact labels, light grid lines, and avoid clipped axis text across desktop/mobile/tablet.
- Legend: Show only when multiple series/distributions are present; match design pill/dot style.
- Tooltip: Hover/tap tooltip must show metric label, value, time/category, and semantic status where useful.
- Empty state: Show route-specific empty copy and preserve chart card height.
- Loading state: Use skeleton or muted loading state; do not flash fake final values.
- Data source: Teacher workbench API/selectors scoped by class and teacher session.
- Current API/selector: app/api/analytics/teacher-workbench/route.ts, lib/demo-data/selectors.ts, lib/agent/teacher-agent.ts

## Current Project Gap
- Implemented: Canonical route exists in current project map.
- Partially implemented / needs audit: Independent query/hash/modal state needs direct capture and acceptance.; Chart visual and data binding require R05 verification.
- Not implemented: none
- UI mismatch: Large UI parity gap must be closed against this reference before visual acceptance.
- Functional mismatch: Static hardcoded chart values are not acceptable; bind demo/API/selector data.

## Acceptance Notes
- This is an R01 documentation spec only; no UI source is changed here.
- Later implementation must use real DOM/components and must not use the full design PNG as a page background.
- Later visual QA must capture the exact route/query/hash/modal state named above.
