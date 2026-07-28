# B19 Browser Use: Console, Network, Artifact Audit Optional Pass

You are running B19 for the SmartChildcare bug bash.

## Context

- Project repository: `C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart`
- Design source directory: `C:\Users\12804\Desktop\childcare-smart源代码\前端重构`
- First round only finds bugs. Do not modify source code.
- Write every bug to `docs/bug-bash/BUGS.md` and `docs/bug-bash/BUGS.json`.
- Store screenshots, videos, traces, and logs under `artifacts/bug-bash/`.
- Final report must be in Chinese.

## Task

This is an optional Browser Use pass. Only run it if the coordinator requests extra runtime evidence coverage beyond B10-B15.

Use the local running site and audit:

- Browser console errors across main role pages.
- Failed network requests across main role pages.
- Missing images, fonts, and static assets.
- Evidence quality for already reported P0-P2 bugs.
- Whether screenshot, video, or trace paths are correctly stored under `artifacts/bug-bash/`.

Do not fix issues. Do not use production unless local startup fails and the failure is recorded.

## Output

Record each user-impacting runtime issue in both bug ledgers. End with a Chinese summary of console/network findings and artifact quality.

