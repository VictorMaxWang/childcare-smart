# SCFR-060-mobile-ai-assistant-mobile

## Source
- Design file: `smartchildcare_images_part_02_of_08/images/childcare_assistant_app_ui_mockup.png`
- Actual file: `smartchildcare_images_part_02_of_08/images/childcare_assistant_app_ui_mockup.png`
- Source status: ok (Inventory path exists on disk.)
- File name: `childcare_assistant_app_ui_mockup.png`
- Priority: P0
- Original role: mobile
- Normalized role: director
- Page type: director, mobile
- Target route: `/admin/agent`
- Current project route: `/admin/agent`
- Route exists: yes
- Query state: none
- Hash state: none
- Viewport: mobile 941x1672
- Image size: 941x1672
- Owner task: R20

## Visual Structure
- Background: Very light blue-gray app background with white translucent surfaces.
- Top bar: Role-aware topbar with title, quick actions, identity, and state badges.
- Sidebar: Collapsed, hidden, or replaced by top/bottom navigation at this viewport.
- Bottom nav: Mobile bottom navigation or compact action rail; must not overlap cards or assistant input.
- Main content: Director AI command workspace with priority list, assistant panel, insight cards, and operation summaries.
- Card layout: Rounded white cards with subtle blue-purple shadow; preserve card density and hierarchy from the reference image.
- Chart area: No primary chart target in this reference.
- AI assistant area: Assistant entry or full panel must be visible, with prompt suggestions, input, send/voice affordances, and vivo provider status/failure state.
- Forms: Only route-specific filters, search, feedback, record, or export forms as shown.
- Modal/drawer/state: No modal/drawer target in this image.

## Visual Tokens
- Primary color: #655BFF
- Secondary colors: #21C6C1 / #38BDF8 for informational accents when present.
- Background color: #FFFFFF
- Extracted palette: `#FFFFFF`, `#F0F0FF`, `#F0F0F0`, `#E0E0FF`, `#E0E0F0`, `#F0E0FF`
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
- Required interactions: prompt suggestion click; message input; send; streaming response; voice entry when available

## AI Assistant Target
- Entry position: Top summary card, floating assistant entry, or bottom-safe input area depending on design image.
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
- Partially implemented / needs audit: Inventory role normalized from mobile viewport to business role; verify manually.; AI assistant requires R06 vivo provider/server-boundary verification.
- Not implemented: none
- UI mismatch: Large UI parity gap must be closed against this reference before visual acceptance.
- Functional mismatch: No AI fake-success behavior is allowed; unavailable vivo must be explicit.

## Acceptance Notes
- This is an R01 documentation spec only; no UI source is changed here.
- Later implementation must use real DOM/components and must not use the full design PNG as a page background.
- Later visual QA must capture the exact route/query/hash/modal state named above.
