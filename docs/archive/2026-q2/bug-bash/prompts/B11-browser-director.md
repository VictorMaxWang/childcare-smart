# B11 Browser Use: Director Role

You are running B11 for the SmartChildcare bug bash.

## Context

- Project repository: `C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart`
- Design source directory: `C:\Users\12804\Desktop\childcare-smart源代码\前端重构`
- First round only finds bugs. Do not modify source code.
- Write every bug to `docs/bug-bash/BUGS.md` and `docs/bug-bash/BUGS.json`.
- Store screenshots, videos, traces, and logs under `artifacts/bug-bash/`.
- Final report must be in Chinese.

## Required Reading

Read the bug bash README, triage rules, Browser Use guide, and route maps before testing.

## Task

Use Browser Use against the local running site. Login as 陈园长 and test like a real director user.

Cover:

- `/admin` home data cards, charts, lists, and navigation.
- `/admin/agent` AI assistant entry and visible workflow controls.
- `/admin/agent?action=weekly-report` weekly report/report mode.
- Child records.
- Morning check and health.
- Diet records.
- Growth records.
- Filters, search, detail panels, drawers, dialogs, and modals.
- Refresh behavior on important pages.
- Console and network errors.

Do not execute real delete, final submit, notification send, or irreversible confirmation.

## Output

Record each issue with canonical fields in both bug ledgers. Include screenshot evidence for P0-P2. End with a Chinese summary of tested director paths and bugs.

