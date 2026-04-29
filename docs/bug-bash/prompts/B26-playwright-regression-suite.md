# B26 Code Scan: Playwright Regression Suite

You are running B26 for the SmartChildcare bug bash.

## Context

- Project repository: `C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart`
- Design source directory: `C:\Users\12804\Desktop\childcare-smart源代码\前端重构`
- First round only finds bugs. Do not modify business source code.
- Write every bug to `docs/bug-bash/BUGS.md` and `docs/bug-bash/BUGS.json`.
- Store evidence under `artifacts/bug-bash/`.
- Final report must be in Chinese.

## Task

Inspect existing Playwright and screenshot scripts and design a regression suite for bugs discovered in B10-B25.

Cover:

- Existing tests under `tests/visual/`.
- Existing capture scripts under `scripts/`.
- Login and demo account smoke tests.
- Role home route smoke tests.
- Mobile viewport smoke tests.
- Permission/direct access smoke tests.
- Console error capture strategy.
- Artifact storage under `artifacts/bug-bash/`.

Do not broadly rewrite existing tests during first-round discovery. If a tiny new test scaffold is necessary, keep it scoped and document it.

## Output

Record testability gaps as bugs only when they hide real product risk. Otherwise summarize recommended regression cases in Chinese and mention where B99 should place them in the fix plan.

