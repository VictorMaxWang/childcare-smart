# R05 Vercel Live Provider Acceptance Report

Generated: 2026-05-05

Base URL: `https://www.smartchildcare.cn`

## Result

R05 is **blocked** for production release.

The deployed Vercel site is reachable and unauthenticated `/api/ai/provider-status` is correctly login-protected with `307 /login`. After demo-account login, the current production deployment returns `404` for the protected provider status route and the voice-assistant command route. The local build contains these routes, so the online failure is classified as `vercel-not-redeployed`, not `vercel-env-missing`.

No high-risk secret exposure was found in the checked page source, frontend bundles, browser network requests, or local `NEXT_PUBLIC_VIVO_*` usage scan.

## Online Provider Status

| Check | Result | Classification |
| --- | --- | --- |
| Unauthenticated `/api/ai/provider-status` | `307 /login` | `login-required`, expected |
| Logged-in `/api/ai/provider-status` as 陈园长 | `404` | `vercel-not-redeployed` |
| Logged-in `/api/ai/provider-status` as 李老师 | `404` | `vercel-not-redeployed` |
| Logged-in `/api/ai/provider-status` as 林妈妈 | `404` | `vercel-not-redeployed` |
| Chat | `unknown` online | blocked by missing deployed route |
| OCR | `unknown` online | blocked by missing deployed route |
| ASR | `unknown` online | blocked by missing deployed route |

There is no evidence from R05 that Vercel production is `missing-env`; the deployed route needed to inspect the Vercel provider state is not present.

## Health Material Parsing

Teacher page `/teacher/health-file-bridge` was verified with the safe text:

`线上验收测试，请忽略。儿童今日体温正常，无明显异常。`

Result:

- The page opens in the 李老师 login state.
- The UI produced a parse result.
- The save action completed and the refreshed page showed the health-material history area.
- The API provenance was `backend-text-fallback`.
- Live OCR on Vercel was **not verified**, because the provider status route returned `404` and OCR status remained `unknown`.

Evidence screenshots:

- `artifacts/product-completion/R05/teacher-health-material-parsed.png`
- `artifacts/product-completion/R05/teacher-health-material-after-refresh.png`

## Voice Orb And Voice Commands

Voice orb UI was checked for all required demo roles.

| Role | Account | Result |
| --- | --- | --- |
| 陈园长 | `u-admin` | voice orb missing |
| 李老师 | `u-teacher` | voice orb missing |
| 周老师 | `u-teacher2` | voice orb missing |
| 林妈妈 | `u-parent` | voice orb missing |

The deployed `/api/voice-assistant/commands` endpoint returned `404`, so the following command checks were not verifiable online:

- `查看高风险儿童`
- `生成本周周报`
- `给李老师派单，线上验收测试，请忽略`
- Unknown-command fail-closed behavior
- Write-command confirmation/cancel behavior
- Parent/teacher message preview-and-cancel flow

No delete, archive, or sensitive write was executed.

## Secret Exposure Check

Result: passed.

Checked areas:

- Login page source and discovered frontend JavaScript bundles.
- Browser network requests during R05 page flows.
- Local tracked files for `NEXT_PUBLIC_VIVO_*`.

Findings:

- No `VIVO_APP_KEY` exposure found.
- No `sk-xuanji` exposure found.
- No provider credential context was found in frontend bundles.
- Browser requests did not send provider credentials to the client.
- Browser calls stayed on same-origin app APIs such as `/api/ai/*`.
- `NEXT_PUBLIC_VIVO_*` appears only in guard/check references; no runtime `process.env.NEXT_PUBLIC_VIVO_*` usage or assignment was found.

## Browser Evidence

Browser Use could not be used in this environment because the available Node runtime was older than the browser-use node_repl requirement. Playwright was used as equivalent online browser evidence.

Artifacts:

- `artifacts/product-completion/R05/r05-online-evidence.json`
- `artifacts/product-completion/R05/teacher-health-material-parsed.png`
- `artifacts/product-completion/R05/teacher-health-material-after-refresh.png`
- `artifacts/product-completion/R05/director-voice-orb-open.png`
- `artifacts/product-completion/R05/teacher-voice-orb-open.png`
- `artifacts/product-completion/R05/teacher-zhou-voice-orb-open.png`
- `artifacts/product-completion/R05/parent-voice-orb-open.png`

## Local Final Commands

| Command | Result |
| --- | --- |
| `npm run lint` | passed |
| `npm run build` | passed |
| `npm run product:ai` | passed; local Chat/OCR/ASR live-pass |
| `npm run product:voice` | passed; parser 13/13 and Playwright 20/20 |
| `npm run product:journey` | passed; 1/1 |
| `npm run feature:smoke` | passed; 19/19 |
| `npm run bugbash:smoke` | passed; 1/1 |
| `npx tsc --noEmit` | passed |

## Release Decision

- Demo release: local/demo build remains acceptable because all local gates are green.
- Online AI demo using current Vercel production: not recommended until Vercel is redeployed.
- Production release: not recommended.

Production must redeploy the current Vercel build, then rerun R05 and verify logged-in Chat/OCR/ASR provider status is configured or live-capable with no secret exposure.
