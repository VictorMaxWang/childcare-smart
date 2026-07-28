# SCFR-140-mobile-health-mobile

## Source
- Design file: `smartchildcare_images_part_05_of_08/images/health_information_permission_page_ui.png`
- Actual file: `smartchildcare_images_part_05_of_08/images/health_information_permission_page_ui.png`
- Source status: ok (Inventory path exists on disk.)
- File name: `health_information_permission_page_ui.png`
- Priority: P1
- Original role: mobile
- Normalized role: shared
- Page type: shared, mobile, state, modal
- Target route: `/health`
- Current project route: `/health`
- Route exists: yes
- Query state: none
- Hash state: none
- Viewport: mobile 941x1672
- Image size: 941x1672
- Owner task: R50

## Visual Structure
- Background: Very light blue-gray app background with white translucent surfaces.
- Top bar: Role-aware topbar with title, quick actions, identity, and state badges.
- Sidebar: Collapsed, hidden, or replaced by top/bottom navigation at this viewport.
- Bottom nav: Mobile bottom navigation or compact action rail; must not overlap cards or assistant input.
- Main content: Health/morning-check dashboard with abnormal status, trend charts, materials, and consultation entry.
- Card layout: Rounded white cards with subtle blue-purple shadow; preserve card density and hierarchy from the reference image.
- Chart area: No primary chart target in this reference.
- AI assistant area: No primary assistant target in this reference.
- Forms: Only route-specific filters, search, feedback, record, or export forms as shown.
- Modal/drawer/state: Modal/drawer/state overlay must be represented as an independent acceptance state.

## Visual Tokens
- Primary color: #655BFF
- Secondary colors: #21C6C1 / #38BDF8 for informational accents when present.
- Background color: #FFFFFF
- Extracted palette: `#FFFFFF`, `#F0F0F0`, `#F0F0FF`, `#E0E0F0`, `#E0E0E0`, `#C0D0FF`
- Gradient: Soft blue/purple/cyan gradients only where visible in reference hero, assistant, or chart emphasis.
- Shadow: Soft blue-purple card shadow, low opacity; avoid heavy dark shadow.
- Radius: Cards 18-28px; controls 12-16px; pills full radius.
- Typography: Chinese system font; compact dashboard text; bold section titles; no viewport-width font scaling.
- Spacing: Mobile/tablet vertical stack gutters 14-24px; card padding 16-22px.
- Icon style: Lucide-like line icons or soft duotone icons; consistent stroke weight; no decorative-only replacement for real controls.
- Tag style: Small rounded pills with semantic color fills/borders for risk, status, AI, and role labels.

## Functional Goals
- Data to show: temperature/mood trend; abnormal records; health materials
- Clickable controls: parse material; open consultation; filter by child/class/date
- Required interactions: open/close modal or drawer; confirm/cancel state; keyboard/overlay dismissal

## Current Project Gap
- Implemented: Canonical route exists in current project map.
- Partially implemented / needs audit: Inventory role normalized from mobile viewport to business role; verify manually.; Independent query/hash/modal state needs direct capture and acceptance.
- Not implemented: none
- UI mismatch: Likely UI parity gap; verify against screenshot in R90.
- Functional mismatch: none

## Acceptance Notes
- This is an R01 documentation spec only; no UI source is changed here.
- Later implementation must use real DOM/components and must not use the full design PNG as a page background.
- Later visual QA must capture the exact route/query/hash/modal state named above.
