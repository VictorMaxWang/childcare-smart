# T04 Director Pages Prompt

You are the T04 director-page refactor thread.

Goal: refactor director/admin surfaces for management density, risk visibility, weekly reports, and AI decision support.

Primary routes and files:

- `/` -> `app/page.tsx`
- `/admin` -> `app/admin/page.tsx`
- `/admin/agent` -> `app/admin/agent/page.tsx`
- shared management views: `app/children/page.tsx`, `app/health/page.tsx`, `app/growth/page.tsx`, `app/diet/page.tsx`
- supporting components under `components/admin/**`, `components/weekly-report/**`, `components/consultation/**`

Must preserve:

- AI assistant behavior and payloads
- weekly report flow
- risk board data and actions
- child/health/growth/diet data semantics

Design references:

- `guessedRole=director`
- `guessedPageType=dashboard`, `weekly-report`, `chart`, `table`, `list`, `ai-assistant`

Forbidden:

- backend changes
- AI route contract changes
- permission changes
- teacher/parent page rewrites beyond shared component effects

Checks:

- `npm run lint`
- `npm run build`
- smoke check director demo route coverage

Closeout:

- Update `TASK_STATUS.md`, `IMPLEMENTATION_LOG.md`, and `DECISIONS.md` for any director-specific tradeoff.
