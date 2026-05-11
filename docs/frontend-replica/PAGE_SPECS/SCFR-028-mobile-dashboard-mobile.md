# SCFR-028-mobile-dashboard-mobile

## Source
- Design file: `smartchildcare_images_part_01_of_08/images/child_friendly_mobile_app_interface_design.png`
- Actual file: `smartchildcare_images_part_01_of_08/images/child_friendly_mobile_app_interface_design.png`
- Source status: ok (Inventory path exists on disk.)
- File name: `child_friendly_mobile_app_interface_design.png`
- Priority: P2
- Original role: mobile
- Normalized role: director
- Page type: director, mobile
- Target route: `/admin`
- Current project route: `/admin`
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
- Main content: Director dashboard with institution KPIs, risk priorities, attendance/health/feedback summaries, and AI entry.
- Card layout: Rounded white cards with subtle blue-purple shadow; preserve card density and hierarchy from the reference image.
- Chart area: No primary chart target in this reference.
- AI assistant area: No primary assistant target in this reference.
- Forms: Only route-specific filters, search, feedback, record, or export forms as shown.
- Modal/drawer/state: No modal/drawer target in this image.

## Visual Tokens
- Primary color: #B0C0D0
- Secondary colors: #21C6C1 / #38BDF8 for informational accents when present.
- Background color: #FFFFFF
- Extracted palette: `#FFFFFF`, `#B0B0C0`, `#C0C0D0`, `#F0F0FF`, `#F0F0F0`, `#B0C0D0`
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
- Required interactions: none

## Current Project Gap
- Implemented: Canonical route exists in current project map.; Low-priority shared/mobile reference can follow after P0/P1 shells are stable.
- Partially implemented / needs audit: Inventory role normalized from mobile viewport to business role; verify manually.
- Not implemented: none
- UI mismatch: Likely UI parity gap; verify against screenshot in R90.
- Functional mismatch: none

## Acceptance Notes
- This is an R01 documentation spec only; no UI source is changed here.
- Later implementation must use real DOM/components and must not use the full design PNG as a page background.
- Later visual QA must capture the exact route/query/hash/modal state named above.
