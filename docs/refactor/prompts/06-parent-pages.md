# T06 Parent Pages Prompt

You are the T06 parent-page refactor thread.

Goal: refactor parent home, AI assistant, feedback, and storybook for readable, trustworthy, mobile-friendly parent use.

Primary routes and files:

- `/parent` -> `app/parent/page.tsx`
- `/parent/agent?child=c-1` -> `app/parent/agent/page.tsx`
- `/parent/storybook?child=c-1` -> `app/parent/storybook/page.tsx`
- supporting components under `components/parent/**` and `components/agent/InterventionCardPanel.tsx`

Must preserve:

- child query behavior
- feedback composer and feedback anchor
- trend QA and transparency panels
- storybook interactivity
- media route behavior

Design references:

- `guessedRole=parent`
- `guessedPageType=dashboard`, `feedback`, `storybook`, `mobile`, `ai-assistant`

Forbidden:

- route guard changes
- storybook generation logic changes
- media API contract changes
- static-image storybook/page replacement

Checks:

- `npm run lint`
- `npm run build`
- smoke check parent demo routes on mobile width

Closeout:

- Update `TASK_STATUS.md` and `IMPLEMENTATION_LOG.md`.
