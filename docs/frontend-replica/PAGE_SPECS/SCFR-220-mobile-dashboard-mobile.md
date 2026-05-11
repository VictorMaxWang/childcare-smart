# SCFR-220-mobile-dashboard-mobile

## Source
- Design file: `smartchildcare_images_part_08_of_08/images/smart_childcare_platform_weekly_report_dashboard.png`
- Actual file: `smartchildcare_images_part_08_of_08/images/smart_childcare_platform_weekly_report_dashboard.png`
- Source status: ok (Inventory path exists on disk.)
- File name: `smart_childcare_platform_weekly_report_dashboard.png`
- Priority: P0
- Original role: mobile
- Normalized role: director
- Page type: director, mobile
- Target route: `/admin/agent?action=weekly-report`
- Current project route: `/admin/agent?action=weekly-report`
- Route exists: yes
- Query state: `action=weekly-report`
- Hash state: none
- Viewport: mobile 941x1672
- Image size: 941x1672
- Owner task: R20

## Visual Structure
- Background: Very light blue-gray app background with white translucent surfaces.
- Top bar: Role-aware topbar with title, quick actions, identity, and state badges.
- Sidebar: Collapsed, hidden, or replaced by top/bottom navigation at this viewport.
- Bottom nav: Mobile bottom navigation or compact action rail; must not overlap cards or assistant input.
- Main content: Weekly operation report workspace with KPI summary, charts, report history, export/share controls.
- Card layout: Rounded white cards with subtle blue-purple shadow; preserve card density and hierarchy from the reference image.
- Chart area: Dedicated chart cards with axis/legend/tooltip states; bind real demo/API/selector data.
- AI assistant area: No primary assistant target in this reference.
- Forms: Only route-specific filters, search, feedback, record, or export forms as shown.
- Modal/drawer/state: No modal/drawer target in this image.

## Visual Tokens
- Primary color: #655BFF
- Secondary colors: #21C6C1 / #38BDF8 for informational accents when present.
- Background color: #FFFFFF
- Extracted palette: `#FFFFFF`, `#F0F0F0`, `#F0F0FF`, `#F0FFFF`, `#E0F0F0`, `#E0E0F0`
- Gradient: Soft blue/purple/cyan gradients only where visible in reference hero, assistant, or chart emphasis.
- Shadow: Soft blue-purple card shadow, low opacity; avoid heavy dark shadow.
- Radius: Cards 18-28px; controls 12-16px; pills full radius.
- Typography: Chinese system font; compact dashboard text; bold section titles; no viewport-width font scaling.
- Spacing: Mobile/tablet vertical stack gutters 14-24px; card padding 16-22px.
- Icon style: Lucide-like line icons or soft duotone icons; consistent stroke weight; no decorative-only replacement for real controls.
- Tag style: Small rounded pills with semantic color fills/borders for risk, status, AI, and role labels.

## Functional Goals
- Data to show: institution KPIs; risk priorities; attendance/health/feedback summaries
- Clickable controls: open AI assistant; view weekly report; dispatch or follow up actions
- Required interactions: chart hover tooltip; legend scan; loading/empty/error state handling

## Chart Target
- Chart types: KPI cards, line chart, bar chart, donut/pie chart, ranking table
- Title: Weekly operation report / 运营报表
- Metrics: attendance rate, health anomalies, growth review count, feedback completion, class comparison
- Colors: #655BFF, #21C6C1, #F59E0B, #EF4444, #10B981
- Axes: Use compact labels, light grid lines, and avoid clipped axis text across desktop/mobile/tablet.
- Legend: Show only when multiple series/distributions are present; match design pill/dot style.
- Tooltip: Hover/tap tooltip must show metric label, value, time/category, and semantic status where useful.
- Empty state: Show route-specific empty copy and preserve chart card height.
- Loading state: Use skeleton or muted loading state; do not flash fake final values.
- Data source: Weekly report API plus admin snapshot payload.
- Current API/selector: app/api/ai/weekly-report/route.ts, app/api/weekly-reports/*, lib/agent/weekly-report-client.ts

## Current Project Gap
- Implemented: Canonical route exists in current project map.
- Partially implemented / needs audit: Inventory role normalized from mobile viewport to business role; verify manually.; Independent query/hash/modal state needs direct capture and acceptance.; Chart visual and data binding require R05 verification.
- Not implemented: none
- UI mismatch: Large UI parity gap must be closed against this reference before visual acceptance.
- Functional mismatch: Static hardcoded chart values are not acceptable; bind demo/API/selector data.

## Acceptance Notes
- This is an R01 documentation spec only; no UI source is changed here.
- Later implementation must use real DOM/components and must not use the full design PNG as a page background.
- Later visual QA must capture the exact route/query/hash/modal state named above.
