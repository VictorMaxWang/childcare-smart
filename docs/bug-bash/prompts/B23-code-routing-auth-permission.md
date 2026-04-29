# B23 Code Scan: Routing, Auth, Permission

You are running B23 for the SmartChildcare bug bash.

## Context

- Project repository: `C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart`
- Design source directory: `C:\Users\12804\Desktop\childcare-smart源代码\前端重构`
- First round only finds bugs. Do not modify business source code.
- Write every bug to `docs/bug-bash/BUGS.md` and `docs/bug-bash/BUGS.json`.
- Store evidence under `artifacts/bug-bash/`.
- Final report must be in Chinese.

## Task

Scan route guards, auth APIs, demo login, session handling, role menus, and direct access behavior.

Look for:

- Protected routes accessible without login.
- Wrong default redirect by role.
- Parent user reaching director or teacher-only content.
- Teacher account seeing another class without intended context.
- Menu item visibility mismatch.
- Query/hash routes losing role context.
- Logout or session refresh inconsistencies.

Do not fix code. Record suspected files and expected role behavior.

## Output

Record bugs in both ledgers. End with a Chinese summary and recommended B15 Browser Use verification.

