# F99 Final Regression

你现在执行 F99：最终回归验证。

## 必验范围

- All fixed P1/P2 bugs from F90 merged status.
- All release blockers.
- All duplicate canonical targets.
- 登录、权限、四账号、移动端、资源和 tooling checks。

## 读取

- `docs/bug-bash/BUGS.md`
- `docs/bug-bash/BUGS.json`
- `docs/bug-bash/BUG_STATUS.md`
- `docs/bug-bash/BUG_FIX_PLAN.md`
- `docs/bug-bash/FIX_THREAD_MATRIX.md`
- `docs/bug-bash/fix-results/*.json`
- `docs/bug-bash/REAL_USER_SCENARIOS.md`
- `docs/bug-bash/BROWSER_USE_GUIDE.md`
- `package.json`

## 验证命令

- Run `npm run lint`.
- Run `npm run build`.
- If available, run `npm run typecheck`; otherwise run or document direct `tsc --noEmit` status if required by F70.
- Run `npm run test:parent-message-mapper` if still present.
- Run `BUGBASH_BASE_URL=http://127.0.0.1:3000 npm run bugbash:smoke` when a local server is available.

## Browser Or Playwright Regression

- Four accounts: 陈园长, 李老师, 周老师, 林妈妈.
- Permission retest:
  - director cannot access teacher/parent workspaces.
  - teacher cannot access director/parent workspaces.
  - parent cannot access director/teacher workspaces.
  - `/login?next=...` cannot bypass role boundaries.
- Role path retest:
  - director `/admin`, `/admin/agent`, weekly/report.
  - teacher `/teacher`, `/teacher/agent`, `/teacher/high-risk-consultation`, `/teacher/health-file-bridge`.
  - parent `/parent`, `/parent/agent?child=c-1#feedback`, `/parent/storybook?child=c-1`.
- Mobile retest: `/login`, `/admin`, `/teacher`, `/parent`, `/parent/agent?child=c-1#feedback`, `/parent/storybook?child=c-1`.

## Constraints

- Do not implement new fixes in F99 unless the user explicitly approves a follow-up fix thread.
- Do not directly alter bug status unless this is only correcting F90 merge metadata with clear evidence.
- Capture command results, screenshots, traces, and final release recommendation.

## 输出

- 写入 `docs/bug-bash/fix-results/F99-result.md`。
- 写入 `docs/bug-bash/fix-results/F99-result.json`。
- Include pass/fail summary, blocking regressions, residual risks, and release recommendation.
