# SCFR-084-director-ai-assistant-desktop

## Source
- Design file: `smartchildcare_images_part_03_of_08/images/childcare_management_platform_dashboard_in_detail.png`
- Actual file: `smartchildcare_images_part_03_of_08/images/childcare_management_platform_dashboard_in_detail.png`
- Source status: ok (Inventory path exists on disk.)
- File name: `childcare_management_platform_dashboard_in_detail.png`
- Priority: P0
- Original role: director
- Normalized role: director
- Page type: director
- Target route: `/admin/agent`
- Current project route: `/admin/agent`
- Route exists: yes
- Query state: none
- Hash state: none
- Viewport: desktop 1448x1086
- Image size: 1448x1086
- Owner task: R20

## Visual Structure
- Background: Very light blue-gray app background with white translucent surfaces.
- Top bar: Role-aware topbar with title, quick actions, identity, and state badges.
- Sidebar: Left navigation rail/sidebar is expected for admin/shared desktop shells.
- Bottom nav: Not primary for this viewport.
- Main content: Director AI command workspace with priority list, assistant panel, insight cards, and operation summaries.
- Card layout: Rounded white cards with subtle blue-purple shadow; preserve card density and hierarchy from the reference image.
- Chart area: Dedicated chart cards with axis/legend/tooltip states; bind real demo/API/selector data.
- AI assistant area: Assistant entry or full panel must be visible, with prompt suggestions, input, send/voice affordances, and vivo provider status/failure state.
- Forms: Only route-specific filters, search, feedback, record, or export forms as shown.
- Modal/drawer/state: No modal/drawer target in this image.

## Visual Tokens
- Primary color: #655BFF
- Secondary colors: #21C6C1 / #38BDF8 for informational accents when present.
- Background color: #FFFFFF
- Extracted palette: `#FFFFFF`, `#F0F0F0`, `#F0F0FF`, `#F0FFFF`, `#E0E0E0`, `#E0F0F0`
- Gradient: Soft blue/purple/cyan gradients only where visible in reference hero, assistant, or chart emphasis.
- Shadow: Soft blue-purple card shadow, low opacity; avoid heavy dark shadow.
- Radius: Cards 16-24px; controls 10-16px; pills full radius.
- Typography: Chinese system font; compact dashboard text; bold section titles; no viewport-width font scaling.
- Spacing: Desktop grid gutters 20-32px; card padding 18-28px.
- Icon style: Lucide-like line icons or soft duotone icons; consistent stroke weight; no decorative-only replacement for real controls.
- Tag style: Small rounded pills with semantic color fills/borders for risk, status, AI, and role labels.

## Functional Goals
- Data to show: institution KPIs; risk priorities; attendance/health/feedback summaries
- Clickable controls: open AI assistant; view weekly report; dispatch or follow up actions
- Required interactions: chart hover tooltip; legend scan; loading/empty/error state handling; prompt suggestion click; message input; send; streaming response; voice entry when available

## Chart Target
- Chart types: KPI cards, trend chart, distribution chart
- Title: Director dashboard metrics / 园长运营指标
- Metrics: children count, attendance, risk children, feedback count, pending actions
- Colors: #655BFF, #21C6C1, #F59E0B, #EF4444, #10B981
- Axes: Use compact labels, light grid lines, and avoid clipped axis text across desktop/mobile/tablet.
- Legend: Show only when multiple series/distributions are present; match design pill/dot style.
- Tooltip: Hover/tap tooltip must show metric label, value, time/category, and semantic status where useful.
- Empty state: Show route-specific empty copy and preserve chart card height.
- Loading state: Use skeleton or muted loading state; do not flash fake final values.
- Data source: Admin analytics API and role-home view model from demo/app state.
- Current API/selector: app/api/analytics/admin/summary/route.ts, lib/api/analytics.ts, lib/view-models/role-home.ts

## AI Assistant Target
- Entry position: Main assistant workspace or right-side assistant panel.
- Panel layout: Prompt suggestions, conversation stream, insight/action cards, input bar, provider status, and retry/error state.
- Recommended prompts: 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作
- Input: Text input must be visible when assistant panel is active; disabled/unavailable state must be explicit.
- Send button: Primary icon/text send control with loading/streaming state.
- Streaming output: Use incremental response UI or explicit loading state; no fake success copy when vivo is unavailable.
- Suggestion cards: Role-specific prompt/action cards; cards must be clickable and scoped.
- Voice entry: Show voice entry where the role surface supports VoiceOrb/ASR; do not expose credentials client-side.
- Role differences: Focus on institution operations, risk priority, weekly reports, dispatch, and cross-class decisions.
- vivo provider requirement: All AI capability must call server-side vivo provider or show explicit unavailable/degraded state. Reference: https://aigc.vivo.com.cn/#/document/index?id=1746
- Current project gap: Existing Next/backend vivo provider inventory exists; R06 must verify every assistant action keeps server/client boundary, scope guard, fallback provenance, and error UI.

## Current Project Gap
- Implemented: Canonical route exists in current project map.
- Partially implemented / needs audit: Chart visual and data binding require R05 verification.; AI assistant requires R06 vivo provider/server-boundary verification.
- Not implemented: none
- UI mismatch: Large UI parity gap must be closed against this reference before visual acceptance.
- Functional mismatch: No AI fake-success behavior is allowed; unavailable vivo must be explicit.; Static hardcoded chart values are not acceptable; bind demo/API/selector data.

## Acceptance Notes
- This is an R01 documentation spec only; no UI source is changed here.
- Later implementation must use real DOM/components and must not use the full design PNG as a page background.
- Later visual QA must capture the exact route/query/hash/modal state named above.
