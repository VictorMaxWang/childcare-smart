# Post-Province Integration Baseline

Updated: 2026-05-31

## Baseline

- Repository: `C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart`
- Branch: `main`
- Baseline commit: `47139a4 chore: publish latest childcare smart updates`
- Pre-report worktree state: `git status --short --untracked-files=all` returned no tracked modifications and no untracked source/docs files.
- This report is the only intended new tracked file after the baseline check.

## Change Classification

| Source | Pending files | Baseline disposition |
| --- | --- | --- |
| High-risk consultation | None | Already integrated in `47139a4`; includes consultation workflow, evidence, trusted AI safety, and related tests. |
| Storybook | None | Already integrated in `47139a4`; includes parent storybook route/API, Lin Xiaoyu story assets, and demo checks. |
| UI | None | Already integrated in `47139a4`; includes role navigation, login/tour, parent/teacher/admin surfaces, and visual capture coverage. |
| Release | None | Already integrated in `47139a4`; includes release gate scripts, env examples, readiness/status checks, and demo preflight all runner. |
| Docs | None | Already integrated in `47139a4`; this status file is the only added baseline note. |
| Online smoke | None | Already integrated in `47139a4`; includes `online:smoke`, Playwright config, and online smoke test path. |
| Artifacts | Ignored only | Local outputs remain for evidence and should not be blindly deleted. |

Ignored local/runtime items observed during the baseline pass include `.env.local`, `.env.release`, `.next/`, `node_modules/`, `tsconfig.tsbuildinfo`, `release-report.json`, and `artifacts/`. Do not commit `.env*` files or secrets.

## Validation Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | Passed | `tsc --noEmit --pretty false --incremental false` completed successfully. |
| `npm run lint` | Passed | `eslint` completed successfully. |
| `npm run build` | Passed | Next.js 16.1.6 production build completed successfully. |
| `npm run demo:preflight` | Passed | 10/10 demo checks passed; report written to `artifacts/demo-preflight-report.json`. |
| `npm run demo:preflight:all` | Passed | Nested `typecheck`, `lint`, `build`, `product:ai`, `demo:preflight`, and `release:check` all exited 0. |
| `npm run capture:visual-parity` | Passed | Captured login/admin/teacher/parent desktop and mobile states under `artifacts/visual-parity/current/`. |
| `npm run capture:ui` | Passed | Captured and validated UI screenshot coverage under `artifacts/ui-screenshots/`. |

Fresh validation artifacts from this run:

- `artifacts/demo-preflight-report.json`
- `artifacts/demo-preflight-all/report.json`
- `artifacts/release-check.json`
- `artifacts/visual-parity/current/*`
- `artifacts/ui-screenshots/*`
- `artifacts/baseline-next-3230.*.log`
- `artifacts/baseline-next-start-3230.*.log`

`capture:visual-parity` needed a local `next start` server on `127.0.0.1:3230`; a raw `next dev` attempt was blocked by the existing `.next/dev/lock`. The temporary 3230 server was stopped after capture.

## Remaining Risks

- `.env.release` exists locally but does not contain the remote release variables required for trusted remote gates. `demo:preflight:all` therefore skipped remote checks.
- `capture:ui` targets `https://www.smartchildcare.cn`; future failures may come from network or live-site state rather than source regressions.
- `artifacts/` contains accumulated local evidence, screenshots, reports, and server logs. Treat it as a reviewable evidence store, not as disposable noise.
- Secrets remain local-only; do not modify or commit `.env*`.

## Next Batch

- Use `main@47139a4` plus this report as the handoff baseline for new parallel branches.
- Before production release, populate remote release variables in the appropriate local secret file and run `npm run demo:preflight:remote` or the remote release gate.
- Keep this smoke set as the next branch baseline: `/login`, `/teacher`, `/admin`, `/parent?child=c-1`, `/parent/storybook?child=c-1`, and `/teacher/high-risk-consultation`.
- If future branches touch rendered UI, rerun `npm run capture:visual-parity` and `npm run capture:ui` and compare against the artifacts recorded here.
