# Pixel Replica File Ownership

Parallel work is allowed only when ownership boundaries are respected.

## P10 Login Page

Owns:

- `app/login/page.tsx`
- `app/auth/login/page.tsx`
- login page dedicated components, if extracted.
- login/register dialog styling.
- demo account entry visuals.
- login-only assets under a future `public/pixel-replica/login/` directory.

Must preserve normal login, registration dialog behavior, password visibility toggles, and demo account entry points.

## P20 Director Pages

Owns:

- `app/admin/page.tsx`
- `app/admin/agent/page.tsx`
- `app/page.tsx` when it affects director landing behavior only.
- `components/admin/`
- `components/weekly-report/`
- director-only styles and assets.

Covers `/admin*`, director home, director AI assistant, director weekly report, director visual-only modules, and director dashboard cards.

## P30 Teacher Pages

Owns:

- `app/teacher/`
- `components/teacher/`
- teacher-specific consultation composition when not shared.
- teacher-only styles and assets.

Covers teacher workbench, teacher AI assistant, home-school communication, health material parsing, high-risk consultation, and teacher mobile views.

## P40 Parent Pages

Owns:

- `app/parent/`
- `components/parent/`
- parent-only styles and assets.

Covers parent home, parent AI assistant, parent feedback, growth storybook, and parent mobile views.

## P50 Shared Business Pages

Owns:

- `app/children/page.tsx`
- `app/health/page.tsx`
- `app/growth/page.tsx`
- `app/diet/page.tsx`
- `components/EmptyState.tsx`
- `components/ui/`
- shared tables, forms, dialogs, drawers, empty states, error states, and loading states.

## P02 Shared Shell

Owns:

- `app/layout.tsx`
- `app/globals.css`
- `components/Navbar.tsx`
- `components/MobileNav.tsx`
- `components/role-shell/`
- `components/ui/page-header.tsx`
- `lib/navigation/primary-nav.ts`

## Files That Must Not Be Edited in Parallel

These files require serial coordination because they affect multiple tasks:

- `app/globals.css`
- `app/layout.tsx`
- `components/Navbar.tsx`
- `components/MobileNav.tsx`
- `components/role-shell/RoleScaffold.tsx`
- `components/ui/page-header.tsx`
- `lib/navigation/primary-nav.ts`
- shared `components/ui/*`
- `docs/pixel-replica/*`
- screenshot and visual-diff scripts created by P01.

Any parallel thread needing these files must add an entry to `CHANGE_REQUESTS.md` first.

