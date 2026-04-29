# B17 Browser Use: AI And Safe Actions Optional Pass

You are running B17 for the SmartChildcare bug bash.

## Context

- Project repository: `C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart`
- Design source directory: `C:\Users\12804\Desktop\childcare-smart源代码\前端重构`
- First round only finds bugs. Do not modify source code.
- Write every bug to `docs/bug-bash/BUGS.md` and `docs/bug-bash/BUGS.json`.
- Store screenshots, videos, traces, and logs under `artifacts/bug-bash/`.
- Final report must be in Chinese.

## Task

This is an optional Browser Use pass. Only run it if the coordinator requests extra AI and safe-action coverage beyond B10-B15.

Use the local running site and test AI-facing flows:

- Director AI assistant and weekly report mode.
- Teacher AI assistant, communication mode, health material parsing, and high-risk consultation.
- Parent AI assistant, trend questions, feedback entry, and storybook.
- Draft generation, preview, cancel, close, retry, and disabled/loading states.
- Dangerous-looking actions and whether final confirmation is clearly protected.

Do not execute final send, final submit, upload completion, or irreversible action.

## Output

Record each issue in both bug ledgers with reproduction steps and evidence. End with a Chinese summary.

