# E11 Result

Status: partial

E11 automated product regression is implemented. The new product API, AI/provider, voice, smoke, and journey suites all pass locally. The overall result remains partial because the required aggregate `feature:smoke` and `bugbash:smoke` commands still fail existing D08/B26 paths, and direct Browser Use could not run on the local Node REPL runtime.

## Added Coverage

- API scope regression: uniform 401/403 envelopes, child/class/attachment/report scope, `/login?next` style overreach, and denied write non-pollution.
- CRUD/archive regression: children, teachers, records, assignments, archive/restore, and forged archive audit field rejection.
- Weekly reports: generate, detail, archive, export, share, and cross-role denial.
- Feedback and attachments: feedback details, image/voice attachment metadata, content scope, size/count limits, and unauthorized reads.
- vivo/OCR/ASR provider: missing-env or provider_unavailable shape, no fake OCR/ASR/Chat success, health material fallback, optional real env smoke path.
- `/api/ai/*` auth: unauthenticated 401, role 403, parent child scope, teacher class scope, and director institution scope.
- Voice orb and role commands: local rule fallback, provider unavailable handling, write-preview confirmation, unknown command rejection, role denial, scope denial, and mobile orb visibility.
- Full user journey: director, teacher, and parent paths with Playwright Browser Use-equivalent coverage and screenshots.

## Commands

- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run product:smoke`: passed, 2 Playwright tests.
- `npm run product:api`: passed, 8 Playwright tests.
- `npm run product:ai`: passed, missing-env provider smoke plus 5 Playwright tests.
- `npm run product:voice`: passed, 13 parser tests plus 20 Playwright tests.
- `npm run product:journey`: passed, 1 full journey Playwright test.
- `npm run feature:smoke`: failed with existing D08 failures in communication-flow, director-summary, health-consultation, parent-storybook demoSeed, teacher-records persistence, and visual-only safety.
- `npm run bugbash:smoke`: failed with B26 parent route console-error 403 issues; director and teacher smoke routes remained nonblank.

## Browser Use

Browser Use was attempted through the plugin runtime. The Node REPL resolved `C:\Program Files\nodejs\node.exe` as `v22.20.0`, while the Browser Use runtime requires `>= v22.22.0`, so direct in-app browser control could not start.

Fallback evidence is the passing `product:journey` Playwright regression, with screenshots in `artifacts/product-completion/E11/`.

## Changed Files

- Added `playwright.product.config.ts`.
- Added E11 tests under `tests/product-completion/`.
- Updated `package.json` with `product:smoke`, `product:api`, `product:ai`, `product:voice`, and `product:journey`.
- Updated `lib/server/app-data-service.ts` to reject forged archive audit fields on record PATCH.
- Added this result file, `E11-result.json`, and `TEST_COVERAGE_REPORT.md`.

## Risks

- Real vivo provider smoke requires local vivo env and was not exercised in this run.
- Brain backend was not running, so AI routes printed expected proxy fallback logs while tests asserted safe fallback behavior.
- Existing D08/B26 smoke failures remain release-gate risks if E90 requires all aggregate smoke suites to be green.
