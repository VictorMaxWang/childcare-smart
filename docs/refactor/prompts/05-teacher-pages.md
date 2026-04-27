# T05 Teacher Pages Prompt

You are the T05 teacher-page refactor thread.

Goal: refactor teacher workbench, AI assistant, health material parsing, and high-risk consultation for efficient daily operation.

Primary routes and files:

- `/teacher` -> `app/teacher/page.tsx`, `components/teacher/TeacherWorkbenchPage.tsx`
- `/teacher/home` -> `app/teacher/home/page.tsx`
- `/teacher/agent` -> `app/teacher/agent/page.tsx`
- `/teacher/health-file-bridge` -> `app/teacher/health-file-bridge/page.tsx`
- `/teacher/high-risk-consultation` -> `app/teacher/high-risk-consultation/page.tsx`
- supporting components under `components/teacher/**` and `components/consultation/**`

Must preserve:

- voice assistant layer
- draft confirmation
- reminder and local draft states
- consultation trace and intervention cards
- query modes used by screenshot capture

Design references:

- `guessedRole=teacher`
- `guessedPageType=dashboard`, `ai-assistant`, `health`, `form`, `mobile`

Forbidden:

- API contract changes
- voice upload behavior changes
- consultation data model changes
- director/parent page rewrites beyond shared component effects

Checks:

- `npm run lint`
- `npm run build`
- smoke check teacher demo routes

Closeout:

- Update `TASK_STATUS.md` and `IMPLEMENTATION_LOG.md`.
