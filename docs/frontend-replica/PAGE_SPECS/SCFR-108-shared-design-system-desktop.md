# SCFR-108-shared-design-system-desktop

## Source
- Design file: `smartchildcare_images_part_04_of_08/images/childcare_platform_ui_design_system.png`
- Actual file: `smartchildcare_images_part_04_of_08/images/childcare_platform_ui_design_system.png`
- Source status: ok (Inventory path exists on disk.)
- File name: `childcare_platform_ui_design_system.png`
- Priority: P2
- Original role: shared
- Normalized role: shared
- Page type: shared
- Target route: `/admin`
- Current project route: `/admin`
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
- Main content: Director dashboard with institution KPIs, risk priorities, attendance/health/feedback summaries, and AI entry.
- Card layout: Rounded white cards with subtle blue-purple shadow; preserve card density and hierarchy from the reference image.
- Chart area: No primary chart target in this reference.
- AI assistant area: No primary assistant target in this reference.
- Forms: Only route-specific filters, search, feedback, record, or export forms as shown.
- Modal/drawer/state: No modal/drawer target in this image.

## Visual Tokens
- Primary color: #655BFF
- Secondary colors: #21C6C1 / #38BDF8 for informational accents when present.
- Background color: #FFFFFF
- Extracted palette: `#FFFFFF`, `#F0F0F0`, `#F0F0FF`, `#F0FFFF`, `#E0E0F0`, `#FFF0F0`
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
- Required interactions: none

## Current Project Gap
- Implemented: Canonical route exists in current project map.; Low-priority shared/mobile reference can follow after P0/P1 shells are stable.
- Partially implemented / needs audit: none
- Not implemented: none
- UI mismatch: Likely UI parity gap; verify against screenshot in R90.
- Functional mismatch: none

## Acceptance Notes
- This is an R01 documentation spec only; no UI source is changed here.
- Later implementation must use real DOM/components and must not use the full design PNG as a page background.
- Later visual QA must capture the exact route/query/hash/modal state named above.
