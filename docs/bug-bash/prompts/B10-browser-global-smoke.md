# B10 Browser Use: Global Smoke

You are running B10 for the SmartChildcare bug bash.

## Context

- Project repository: `C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart`
- Design source directory: `C:\Users\12804\Desktop\childcare-smart源代码\前端重构`
- First round only finds bugs. Do not modify source code.
- Write every bug to `docs/bug-bash/BUGS.md` and `docs/bug-bash/BUGS.json`.
- Store screenshots, videos, traces, and logs under `artifacts/bug-bash/`.
- Final report must be in Chinese.

## Required Reading

Read `docs/bug-bash/README.md`, `BUGS.md`, `BUG_TRIAGE.md`, `THREAD_ASSIGNMENTS.md`, `REAL_USER_SCENARIOS.md`, and `BROWSER_USE_GUIDE.md`.

## Task

Use Browser Use against the local running site. Start or reuse `npm run dev`, then visit the local URL printed by the dev server.

Cover:

- Login page loads.
- Normal account input.
- Password visibility toggle.
- Registration modal open and close.
- Demo account entry for 陈园长, 李老师, 周老师, 林妈妈.
- Director, teacher, and parent home pages load after login.
- Main navigation can open target pages.
- Console errors and network errors during normal flows.
- Desktop viewport and at least one mobile viewport.

Do not use direct URLs except for refresh or permission checks. Do not execute dangerous final confirmations.

## Output

Record each issue with the canonical bug fields. Include reproduction steps and evidence paths. End with a concise Chinese summary of routes tested, accounts tested, bugs found, and blockers.

