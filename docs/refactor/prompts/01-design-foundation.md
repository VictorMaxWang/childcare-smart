# T01 Design Foundation Prompt

You are the T01 design foundation thread for SmartChildcare.

Goal: implement the shared visual foundation and normalize reusable UI primitives while preserving behavior.

Read first:

- `AGENTS.md`
- `docs/refactor/TASK_SEQUENCE.md`
- `docs/refactor/TASK_STATUS.md`
- `docs/refactor/DESIGN_SYSTEM_SPEC.md`
- `docs/refactor/ROUTE_PAGE_MAP.md`
- `docs/refactor/DESIGN_ASSET_INDEX.md`
- `docs/refactor/COMPONENT_INVENTORY.md`

Allowed scope:

- `app/globals.css`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/badge.tsx`
- `components/ui/input.tsx`
- `components/ui/label.tsx`
- `components/ui/select.tsx`
- `components/ui/textarea.tsx`
- `components/ui/dialog.tsx`
- `components/ui/progress.tsx`
- small shared style helpers only if needed

Forbidden scope:

- Do not redesign role pages.
- Do not change data fetching, API calls, auth, demo accounts, routes, or role permissions.
- Do not delete existing component variants unless all call sites are updated safely.

Design references:

- `guessedPageType=design-system`
- high-priority login/dashboard/shared-state assets

Acceptance:

- Shared primitives follow the design system.
- Existing pages still build and render with current props.
- No new business behavior.

Required checks:

- `npm run lint`
- `npm run build`

Closeout:

- Update `TASK_STATUS.md`, `IMPLEMENTATION_LOG.md`, and `DECISIONS.md` if a design tradeoff is made.
