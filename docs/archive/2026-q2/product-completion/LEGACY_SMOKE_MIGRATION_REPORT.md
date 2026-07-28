# R02 Legacy Feature Smoke Migration Report

## Summary

R02 migrated the remaining legacy D08 `feature:smoke` coverage so it validates the current E02-E11 MVP instead of old localStorage-only, fixed mock, disabled-replica, or fake-success behavior.

- Before: `npm run feature:smoke` failed with 6 legacy D08 failures out of 19 tests, about 371.8s.
- After: `npm run feature:smoke` passed with 19/19 tests, final run about 4.6m.
- Product regression checks stayed green: lint, build, product smoke, product api, product ai, product voice, and product journey.
- Artifacts were written under `artifacts/product-completion/R02/`.
- Port check after the final run showed `127.0.0.1:3330` was not listening, so no feature smoke dev server was left behind.

## Startup Migration

`playwright.feature.config.ts` now follows the product/bugbash base URL convention:

- `FEATURE_BASE_URL -> PRODUCT_BASE_URL -> BUGBASH_BASE_URL -> http://127.0.0.1:<port>`
- `FEATURE_PORT -> PRODUCT_PORT -> BUGBASH_PORT -> 3330`
- skip web server via `FEATURE_SKIP_WEBSERVER`, `PRODUCT_SKIP_WEBSERVER`, or `BUGBASH_SKIP_WEBSERVER`
- feature smoke artifacts/report output under `artifacts/product-completion/R02/`

The stale `.next/dev/lock` reuse path was removed from feature smoke. Reuse now depends on Playwright's reachable `baseURL` behavior instead of treating a lock file as proof that a server is alive.

## Classification

| Domain | Classification | Action | Related task | Fixed by |
|---|---|---|---|---|
| communication-flow | outdated-test | Migrated from localStorage bucket assertions to API-backed parent message, teacher reply, scoped teacher denial, parent visibility, and director feedback status checks. | E01/E04/E07/E08/E09 | `tests/feature-completion/communication-flow.spec.ts` |
| director-summary | outdated-test | Migrated from fixed mock metrics to real admin summary, trends, weekly report create/export/share/archive, and feedback status checks. | E03/E07 | `tests/feature-completion/director-summary.spec.ts` |
| health-consultation | outdated-test / env-missing | Migrated from old local demo parse copy to provider contract checks: text fallback, missing-env `provider_unavailable`, saved health material parse, high-risk consultation create/update, and scoped visibility. | E05/E08 | `tests/feature-completion/health-consultation.spec.ts` |
| parent-features storybook seed | real-regression / outdated-test | Fixed parent storybook AI scope so nested `snapshot.child.className` in demoSeed is not interpreted as a forged class scope, while preserving child mismatch 403 and role auth. Updated demoSeed isolation/export/share coverage. | E09/E10 | `lib/server/ai-route-guard.ts`, `app/api/ai/parent-storybook/route.ts`, `tests/feature-completion/parent-features.spec.ts` |
| teacher-records-persistence | outdated-test | Migrated from mock draft/localStorage persistence to records API persistence, refresh stability, parent API visibility, and teacher cross-class denial. | E01/E02/E08 | `tests/feature-completion/teacher-records-persistence.spec.ts` |
| visual-only-safety | outdated-test | Migrated from old disabled admin replica expectations to current E10 disabled MVP controls, local demo draft isolation, and login redirect role protection. | E10 | `tests/feature-completion/visual-only-safety.spec.ts` |
| feature dev server | flaky-dev-server | Added product/bugbash base URL reuse support and moved output to R02 artifacts; removed stale lock-based server reuse. | R02 | `playwright.feature.config.ts` |

## Checks

| Check | Result |
|---|---|
| `npm run lint` | passed |
| `npm run build` | passed |
| `npm run feature:smoke` | passed: 19/19 |
| `npm run product:smoke` | passed: 2/2 |
| `npm run product:api` | passed: 8/8 |
| `npm run product:ai` | passed: 5/5 plus provider smoke |
| `npm run product:voice` | passed: parser 13/13 and Playwright 20/20 |
| `npm run product:journey` | passed: 1/1 |

## Notes

- Missing vivo/brain provider environment remains intentionally explicit: tests verify fallback or `provider_unavailable`; no fake success was restored.
- Dev-server logs still include expected fallback/ECONNREFUSED noise when optional local brain services are unavailable. The tested API/UI behavior remains passing.
- The repository had many pre-existing E02-E11 changes before R02. R02 did not revert unrelated files.
