# T02 Login and Entry Prompt

You are the T02 login and entry thread for SmartChildcare.

Goal: refactor `/login` and the registration dialog into the new visual system while preserving login, registration, and demo account behavior.

Primary files:

- `app/login/page.tsx`
- `app/auth/login/page.tsx` only if redirect behavior must be checked

Must preserve:

- normal username/password login
- registration dialog
- password visibility toggles
- all demo account cards and IDs
- landing path behavior from `lib/auth/accounts.ts`
- `/auth/login` redirect to `/login`

Design references:

- `guessedRole=login`
- `guessedPageType=login`
- registration/modal assets

Forbidden:

- auth API changes
- session logic changes
- demo account changes
- static-image login page

Checks:

- `npm run lint`
- `npm run build`
- manually verify director, teacher, and parent demo entries still route correctly

Closeout:

- Update `TASK_STATUS.md` and `IMPLEMENTATION_LOG.md`.
