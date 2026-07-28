# B20 Code Scan: Build And Runtime

You are running B20 for the SmartChildcare bug bash.

## Context

- Project repository: `C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart`
- Design source directory: `C:\Users\12804\Desktop\childcare-smart源代码\前端重构`
- First round only finds bugs. Do not modify business source code.
- Write every bug to `docs/bug-bash/BUGS.md` and `docs/bug-bash/BUGS.json`.
- Store logs and evidence under `artifacts/bug-bash/`.
- Final report must be in Chinese.

## Task

Inspect build, lint, startup, runtime imports, route modules, and obvious crash paths.

Cover:

- `package.json` commands.
- Next app routes.
- API route imports.
- Client/server component boundaries.
- Dynamic imports and browser-only APIs.
- Missing exports or mismatched prop contracts.
- Known scripts: `npm run lint`, `npm run build`, `npm run pixel:capture`, `npm run pixel:compare`, Playwright capture scripts.

You may run non-mutating checks. Do not fix business code.

## Output

Record likely runtime/build bugs with suspected files, likely cause, and suggested fix. End with a Chinese summary.

