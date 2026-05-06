# Final Release Readiness Report

Generated: 2026-05-06

## Executive Summary

R06/R05 Vercel production recheck is complete and the production release gate remains **blocked**.

Local commit is `bf85945`. Vercel Production deployment `bf85945 READY` was user-confirmed, and `NEXT_PUBLIC_FORCE_MOCK_MODE` was user-confirmed as `false` or deleted. However, the production runtime at `https://www.smartchildcare.cn` still returns `404` for logged-in `/api/ai/provider-status`, `/api/voice-assistant/commands`, and `/api/ai/voice-asr`, and the voice orb UI is still missing for the required roles.

Local gates are green and local vivo Chat/OCR/ASR remain `live-pass`; the blocker is the production runtime/deployment artifact behavior.

## Release Recommendation

- Demo/local release: recommended.
- Online Vercel AI demo: not recommended.
- Production release: not recommended.

Production should not be released until the production domain serves the deployment artifact that includes the current AI/voice routes and voice orb UI.

## R06/R05 Online Evidence

| Capability | Online result | Classification |
| --- | --- | --- |
| Vercel commit | `bf85945 READY`, user-confirmed | deployment dashboard OK |
| Mock mode flag | `false` or deleted, user-confirmed | no force-mock flag risk |
| Unauthenticated provider status | `307 /login` | expected |
| Logged-in provider status | `404` | production route/deployment mismatch |
| Chat | `unknown` | provider route unavailable online |
| OCR | `unknown` | health material used fallback |
| ASR | `unknown` | provider/ASR routes unavailable online |
| Health material parsing | parsed and saved via `backend-text-fallback` | live OCR not verified |
| Voice orb | missing for 陈园长, 李老师, 周老师, 林妈妈 | blocked |
| Voice commands | `404` | blocked |
| Secret exposure | none found | passed |

## Local Command Results

| Command | Result |
| --- | --- |
| `npm run lint` | passed |
| `npm run build` | passed; local route list includes required AI/voice routes |
| `npm run product:ai` | passed; Chat/OCR/ASR local live-pass; Playwright 6/6 |
| `npm run product:voice` | passed; parser 13/13 and Playwright 20/20 |
| `npm run product:journey` | passed; 1/1 |
| `npm run feature:smoke` | passed; 19/19 |
| `npm run bugbash:smoke` | passed on rerun; first run hit transient `ERR_NETWORK_CHANGED` |
| `npx tsc --noEmit` | passed |

## Provider Error Classification

| Classification | Result |
| --- | --- |
| `vercel-env-missing` | not proven; the provider-status route cannot be reached after login |
| `vercel-not-redeployed` | functionally present as production route/deployment mismatch despite dashboard READY confirmation |
| `auth/signature` | not observed |
| `endpoint` | raw symptom is `404`; treated as production route/deployment mismatch |
| `model` | not observed |
| `permission` | not observed |
| `network` | first local bugbash run had transient `ERR_NETWORK_CHANGED`; online provider path did not expose a provider network error |
| `unsupported format` | not observed |
| `login-required` | expected unauthenticated `307 /login` |
| `scope-403` | not observed |
| `provider-unavailable` | not proven |
| `unknown` | Chat/OCR/ASR remain unknown online because route status is unavailable |

## Production Must Complete

- Confirm the production domain alias points to the `bf85945` deployment artifact.
- Confirm Vercel Project Root/Framework settings build the same app whose local build includes `/api/ai/provider-status`, `/api/ai/voice-asr`, and `/api/voice-assistant/commands`.
- If needed, redeploy production with cache cleared or promote a verified preview deployment, then rerun R05.
- Verify logged-in Chat/OCR/ASR statuses are configured or live-capable and not `404`, `missing-env`, or mock.
- Verify voice orb UI is present for director, teacher, teacher2, and parent roles.
- Keep all vivo credentials out of client env, source, docs, screenshots, logs, traces, and browser network payloads.
