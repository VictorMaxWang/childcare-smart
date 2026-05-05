# Test Coverage Report

## E11 Product Suites

| Area | Test files | Status |
| --- | --- | --- |
| API route scope | `tests/product-completion/api-scope.spec.ts` | Passed via `product:smoke` and `product:api` |
| CRUD/archive | `tests/product-completion/crud-archive.spec.ts` | Passed via `product:api` |
| Weekly report | `tests/product-completion/weekly-report.spec.ts`, `tests/product-completion/full-user-journey.spec.ts` | Passed via `product:api`, `product:smoke`, `product:journey` |
| Feedback/attachments | `tests/product-completion/feedback-attachments.spec.ts` | Passed via `product:api` |
| vivo provider | `tests/product-completion/vivo-provider.spec.ts`, `scripts/product-ai-smoke.mjs` | Passed missing-env/no-fake-success contract via `product:ai` |
| OCR/ASR provider | `tests/product-completion/ocr-asr-provider.spec.ts` | Passed fallback/provider_unavailable contract via `product:ai` |
| `/api/ai/*` auth | `tests/product-completion/ai-routes-auth.spec.ts` | Passed via `product:ai` |
| Voice orb core | `tests/product-completion/voice-orb-core.spec.ts` plus E06 parser tests | Passed via `product:voice` |
| Director voice | `tests/product-completion/voice-director.spec.ts`, E07 voice tests | Passed via `product:voice` |
| Teacher voice | `tests/product-completion/voice-teacher.spec.ts`, E08 voice tests | Passed via `product:voice` |
| Parent voice | `tests/product-completion/voice-parent.spec.ts`, E09 voice tests | Passed via `product:voice` |
| Full user journey | `tests/product-completion/full-user-journey.spec.ts` | Passed via `product:smoke` and `product:journey` |

## Command Results

| Command | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run build` | Passed |
| `npm run product:smoke` | Passed, 2 Playwright tests |
| `npm run product:api` | Passed, 8 Playwright tests |
| `npm run product:ai` | Passed, product AI missing-env smoke plus 5 Playwright tests |
| `npm run product:voice` | Passed, 13 parser tests plus 20 Playwright tests |
| `npm run product:journey` | Passed, 1 Playwright journey test |
| `npm run feature:smoke` | Failed, 6 existing D08 failures |
| `npm run bugbash:smoke` | Failed, B26 reported 6 parent console-error 403 issues |

## Browser Regression Evidence

Direct Browser Use was attempted but blocked by local Node `v22.20.0`; the runtime requires `>= v22.22.0`. E11 therefore records Playwright as the Browser Use-equivalent fallback for this environment.

Captured evidence:

- `artifacts/product-completion/E11/journey-director-metrics.png`
- `artifacts/product-completion/E11/journey-director-weekly-report.png`
- `artifacts/product-completion/E11/journey-teacher-assignment.png`
- `artifacts/product-completion/E11/journey-teacher-health-material.png`
- `artifacts/product-completion/E11/journey-parent-message-reply.png`
- `artifacts/product-completion/E11/journey-parent-storybook-share-export.png`
- `artifacts/product-completion/E11/voice-orb-core-mobile.png`

## Remaining Gaps

- Real vivo provider smoke needs `VIVO_*` env to be configured locally.
- Public/cloud attachment storage, public share links, and production identity lifecycle remain outside E11's local MVP regression scope.
- `feature:smoke` D08 and `bugbash:smoke` B26 failures should be stabilized before a strict all-smoke release gate.
