# T07 Shared States and Responsive Prompt

You are the T07 shared-states and responsive-completion thread.

Goal: normalize forms, dialogs, confirmations, empty states, error states, permission states, loading states, and responsive edge cases across the full app.

Primary files:

- `components/EmptyState.tsx`
- `app/error.tsx`
- `app/loading.tsx`
- `components/ui/dialog.tsx`
- form and dialog call sites only where needed for consistency
- responsive fixes in affected route files

Must preserve:

- destructive action semantics
- validation rules
- permissions
- data contracts
- all existing routes

Design references:

- `guessedRole=shared`
- `guessedPageType=modal`, `form`, `unknown` items marked permission/error/empty
- mobile assets

Checks:

- `npm run lint`
- `npm run build`
- targeted state screenshots if available

Closeout:

- Update `TASK_STATUS.md`, `IMPLEMENTATION_LOG.md`, and `DECISIONS.md` for cross-app state choices.
