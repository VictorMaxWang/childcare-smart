# Final Release Readiness Report

Generated: 2026-05-05

## Executive Summary

R05 authenticated online Vercel provider acceptance is complete and the production release gate is **blocked**.

Local release gates are still green, and local vivo Chat/OCR/ASR remain `live-pass`. The deployed Vercel production site is reachable and correctly login-protects `/api/ai/provider-status` for unauthenticated requests. However, after demo-account login, the production deployment returns `404` for `/api/ai/provider-status`, `/api/voice-assistant/commands`, and `/api/ai/voice-asr`. The local build contains these routes, so the R05 online failure is classified as `vercel-not-redeployed`.

- Demo release: recommended for the current local/demo build.
- Online Vercel AI demo: not recommended until redeploy.
- Production release: not recommended.
- Local vivo provider: Chat/OCR/ASR `live-pass`.
- Vercel provider endpoint: `login-protected` when unauthenticated, missing after login in the current deployment.
- Vercel env status: `unknown`; the deployed provider-status route needed to inspect it is not present.
- Missing env: not observed on Vercel R05; cannot be proven until redeploy exposes the protected route.
- Secrets exposed: false in R05 checks.

## R05 Online Vercel Evidence

| Capability | Online result | Classification |
| --- | --- | --- |
| Unauthenticated provider status | `307 /login` | `login-required`, expected |
| Logged-in provider status | `404` | `vercel-not-redeployed` |
| Chat | `unknown` | provider route missing online |
| OCR | `unknown` | provider route missing online; health material used fallback |
| ASR | `unknown` | provider route and ASR typed fallback route missing online |
| Health material parsing | parsed and saved with `backend-text-fallback` | page works, live OCR not verified |
| Voice orb | missing for 陈园长, 李老师, 周老师, 林妈妈 | `vercel-not-redeployed` |
| Voice commands | `404` | `vercel-not-redeployed` |
| Secret exposure | none found | passed |

Browser Use was unavailable because the available node_repl runtime required a newer Node version. Playwright online evidence was used instead.

R05 artifacts:

- `docs/product-completion/R05_VERCEL_LIVE_PROVIDER_REPORT.md`
- `docs/product-completion/results/R05-result.md`
- `docs/product-completion/results/R05-result.json`
- `artifacts/product-completion/R05/r05-online-evidence.json`

## Local Command Results

| Command | Result |
| --- | --- |
| `npm run lint` | passed |
| `npm run build` | passed |
| `npm run product:ai` | passed; Chat/OCR/ASR local live-pass; Playwright 6/6 |
| `npm run product:voice` | passed; parser 13/13 and Playwright 20/20 |
| `npm run product:journey` | passed; 1/1 |
| `npm run feature:smoke` | passed; 19/19 |
| `npm run bugbash:smoke` | passed; 1/1 |
| `npx tsc --noEmit` | passed |

## Provider Error Classification

| Classification | Result |
| --- | --- |
| `vercel-env-missing` | none proven in R05 |
| `vercel-not-redeployed` | present; logged-in provider-status/voice/ASR routes are missing online |
| `auth/signature` | none observed |
| `endpoint` | raw symptom was `404`, classified as `vercel-not-redeployed` based on local build evidence |
| `model` | none observed |
| `permission` | none observed |
| `network` | none observed for production provider path |
| `unsupported format` | none observed in R05 online path |
| `login-required` | expected unauthenticated `307 /login` |
| `scope-403` | none observed |
| `provider-unavailable` | none proven |
| `unknown` | ASR typed fallback secondary status missing after route `404` |

## Release Decision

Demo release for the local/demo build remains recommended because the local provider and local product gates are green.

Production release is not recommended. The current Vercel production deployment is not running the code required for R05 logged-in provider verification. Redeploy Vercel with the current build, then rerun R05 and verify logged-in Chat/OCR/ASR statuses are configured or live-capable.

## Production Must Complete

- Redeploy the current Vercel production build.
- Confirm `/api/ai/provider-status` exists after login and reports Chat/OCR/ASR without `missing-env`.
- Verify health-material parsing shows live OCR or an explicitly classified fallback on the redeployed Vercel app.
- Verify voice orb UI and `/api/voice-assistant/commands` are available for director, teacher, and parent roles.
- Keep all vivo credentials out of client env, source, docs, screenshots, logs, traces, and browser network payloads.
