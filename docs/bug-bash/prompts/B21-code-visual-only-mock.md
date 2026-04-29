# B21 Code Scan: Visual-Only And Mock Behavior

You are running B21 for the SmartChildcare bug bash.

## Context

- Project repository: `C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart`
- Design source directory: `C:\Users\12804\Desktop\childcare-smart源代码\前端重构`
- First round only finds bugs. Do not modify business source code.
- Write every bug to `docs/bug-bash/BUGS.md` and `docs/bug-bash/BUGS.json`.
- Store evidence under `artifacts/bug-bash/`.
- Final report must be in Chinese.

## Task

Scan for visual-only modules, mock data, fake actions, and misleading interactions introduced or exposed by Pixel Replica Mode.

Look for:

- Buttons that look live but have no handler.
- Fake submit/send/delete/upload actions without visual-only labeling.
- Mock data that appears to be real backend state.
- Cropped design assets used in ways that hide missing functionality.
- Placeholder charts, lists, or AI outputs with no status label.
- Dangerous-looking actions that might cause real side effects.

Do not fix code. Record clear user impact and suspected files.

## Output

Record bugs in both ledgers. Use P2 for misleading visual-only fake functionality when it can affect user decisions. End with a Chinese summary.

