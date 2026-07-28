# T03 App Shell and Navigation Prompt

You are the T03 app shell, navigation, and responsive frame thread.

Goal: unify global navigation, mobile drawer, and role shell with the design system.

Primary files:

- `components/Navbar.tsx`
- `components/MobileNav.tsx`
- `components/role-shell/RoleScaffold.tsx`
- `app/layout.tsx`
- `lib/navigation/primary-nav.ts` only for presentation-safe labels or active-state issues; avoid behavior changes

Must preserve:

- existing nav item availability by role
- active route behavior
- logout behavior
- mobile drawer focus handling and body scroll lock
- login page hiding global nav

Design references:

- dashboard assets
- mobile assets
- shared navigation patterns

Forbidden:

- deleting routes
- changing permissions
- changing default landing paths

Checks:

- `npm run lint`
- `npm run build`
- inspect desktop and mobile nav states

Closeout:

- Update `TASK_STATUS.md` and `IMPLEMENTATION_LOG.md`.
