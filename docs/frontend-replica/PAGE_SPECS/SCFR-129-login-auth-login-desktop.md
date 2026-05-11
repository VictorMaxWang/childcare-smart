# SCFR-129-login-auth-login-desktop

## Source
- Design file: `smartchildcare_images_part_05_of_08/images/clean_and_modern_registration_interface.png`
- Actual file: `smartchildcare_images_part_05_of_08/images/clean_and_modern_registration_interface.png`
- Source status: ok (Inventory path exists on disk.)
- File name: `clean_and_modern_registration_interface.png`
- Priority: P0
- Original role: login
- Normalized role: login
- Page type: login
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
- Modal/drawer/state: No modal/drawer target in this image.

## Visual Tokens
- Primary color: #5060A0
- Secondary colors: #21C6C1 / #38BDF8 for informational accents when present.
- Background color: #FFFFFF
- Extracted palette: `#A0A0B0`, `#FFFFFF`, `#F0F0F0`, `#5060A0`, `#4050A0`, `#9090A0`
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
- Required interactions: submit credentials; switch auth mode; enter role home after successful demo login

## Current Project Gap
- Implemented: Canonical route exists in current project map.
- Partially implemented / needs audit: none
- Not implemented: none
- UI mismatch: Large UI parity gap must be closed against this reference before visual acceptance.
- Functional mismatch: none

## Acceptance Notes
- This is an R01 documentation spec only; no UI source is changed here.
- Later implementation must use real DOM/components and must not use the full design PNG as a page background.
- Later visual QA must capture the exact route/query/hash/modal state named above.
