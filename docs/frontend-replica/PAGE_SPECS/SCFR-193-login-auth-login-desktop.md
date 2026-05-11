# SCFR-193-login-auth-login-desktop

## Source
- Design file: `smartchildcare_images_part_07_of_08/images/registration_modal_on_digital_platform.png`
- Actual file: `smartchildcare_images_part_07_of_08/images/registration_modal_on_digital_platform.png`
- Source status: ok (Inventory path exists on disk.)
- File name: `registration_modal_on_digital_platform.png`
- Priority: P0
- Original role: login
- Normalized role: login
- Page type: login, state, modal
- Target route: `/login`
- Current project route: `/login`
- Route exists: yes
- Query state: none
- Hash state: none
- Viewport: desktop 1448x1086
- Image size: 1448x1086
- Owner task: R10

## Visual Structure
- Background: Soft pastel gradient or split auth background; avoid using the design image as a page background.
- Top bar: Minimal brand/header area; login form remains primary.
- Sidebar: Collapsed, hidden, or replaced by top/bottom navigation at this viewport.
- Bottom nav: Not primary for this viewport.
- Main content: Auth form and demo account selection with optional marketing feature panel.
- Card layout: Rounded white cards with subtle blue-purple shadow; preserve card density and hierarchy from the reference image.
- Chart area: No primary chart target in this reference.
- AI assistant area: No primary assistant target in this reference.
- Forms: Login/register/demo account controls are required.
- Modal/drawer/state: Modal/drawer/state overlay must be represented as an independent acceptance state.

## Visual Tokens
- Primary color: #655BFF
- Secondary colors: #21C6C1 / #38BDF8 for informational accents when present.
- Background color: #F0F0F0
- Extracted palette: `#F0F0F0`, `#FFFFFF`, `#F0F0FF`, `#E0E0F0`, `#E0F0F0`, `#E0E0E0`
- Gradient: Soft blue/purple/cyan gradients only where visible in reference hero, assistant, or chart emphasis.
- Shadow: Soft blue-purple card shadow, low opacity; avoid heavy dark shadow.
- Radius: Cards 16-24px; controls 10-16px; pills full radius.
- Typography: Chinese system font; compact dashboard text; bold section titles; no viewport-width font scaling.
- Spacing: Desktop grid gutters 20-32px; card padding 18-28px.
- Icon style: Lucide-like line icons or soft duotone icons; consistent stroke weight; no decorative-only replacement for real controls.
- Tag style: Small rounded pills with semantic color fills/borders for risk, status, AI, and role labels.

## Functional Goals
- Data to show: demo account cards; login/register form fields; role entry descriptions
- Clickable controls: login; register; demo account selection
- Required interactions: submit credentials; switch auth mode; enter role home after successful demo login; open/close modal or drawer; confirm/cancel state; keyboard/overlay dismissal

## Current Project Gap
- Implemented: Canonical route exists in current project map.
- Partially implemented / needs audit: Independent query/hash/modal state needs direct capture and acceptance.
- Not implemented: none
- UI mismatch: Large UI parity gap must be closed against this reference before visual acceptance.
- Functional mismatch: none

## Acceptance Notes
- This is an R01 documentation spec only; no UI source is changed here.
- Later implementation must use real DOM/components and must not use the full design PNG as a page background.
- Later visual QA must capture the exact route/query/hash/modal state named above.
