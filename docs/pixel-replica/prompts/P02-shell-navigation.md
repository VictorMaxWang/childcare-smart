# P02 Prompt: Shell And Navigation

You are P02 for SmartChildcare Pixel Replica Mode.

Fixed project repository:

`C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart`

Fixed original design source directory:

`C:\Users\12804\Desktop\childcare-smart源代码\前端重构`

## Required Reading

1. `AGENTS.md`
2. `docs/pixel-replica/agent.md`
3. `docs/pixel-replica/DESIGN_TO_ROUTE_MAP.md`
4. `docs/pixel-replica/FILE_OWNERSHIP.md`
5. `docs/pixel-replica/PIXEL_ACCEPTANCE_CRITERIA.md`

## Mission

Make the global app shell, navigation, page gutters, content frame, topbar/sidebar, and responsive navigation visually match the design references as closely as possible.

## Owned Files

- `app/layout.tsx`
- `app/globals.css`
- `components/Navbar.tsx`
- `components/MobileNav.tsx`
- `components/role-shell/`
- `components/ui/page-header.tsx`
- `lib/navigation/primary-nav.ts`

## Rules

- Visual replication is more important than conservative componentization.
- Allow large CSS and layout changes.
- Allow cropped decorative assets where safe.
- Allow visual-only shell decoration.
- Preserve login flow, role permissions, route guards, and existing navigation availability.
- Do not remove existing route entries.
- Capture current screenshots, compare to references, capture modified screenshots, and score visual closeness.

## Target Score

Global navigation and shell are critical: score must be >= 95 before completion.

