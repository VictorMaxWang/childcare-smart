# SCFR-175-login-auth-login-tablet-portrait

## Source
- Design file: `smartchildcare_images_part_06_of_08/images/modern_soft_gradient_saas_login_page.png`
- Actual file: `smartchildcare_images_part_06_of_08/images/modern_soft_gradient_saas_login_page.png`
- Source status: ok (Inventory path exists on disk.)
- File name: `modern_soft_gradient_saas_login_page.png`
- Priority: P0
- Original role: login
- Normalized role: login
- Page type: login, tablet
- Target route: `/login`
- Current project route: `/login`
- Route exists: yes
- Query state: none
- Hash state: none
- Viewport: tablet/portrait 1086x1448
- Image size: 1086x1448
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
- Primary color: #655BFF
- Secondary colors: #21C6C1 / #38BDF8 for informational accents when present.
- Background color: #FFFFFF
- Extracted palette: `#FFFFFF`, `#F0F0FF`, `#F0FFFF`, `#F0F0F0`, `#E0E0E0`, `#E0F0F0`
- Gradient: Soft blue/purple/cyan gradients only where visible in reference hero, assistant, or chart emphasis.
- Shadow: Soft blue-purple card shadow, low opacity; avoid heavy dark shadow.
- Radius: Cards 16-24px; controls 10-16px; pills full radius.
- Typography: Chinese system font; compact dashboard text; bold section titles; no viewport-width font scaling.
- Spacing: Mobile/tablet vertical stack gutters 14-24px; card padding 16-22px.
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
