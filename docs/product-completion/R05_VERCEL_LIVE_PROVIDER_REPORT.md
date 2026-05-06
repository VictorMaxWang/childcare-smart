# R05/R06 Vercel Live Provider Recheck Report

Generated: 2026-05-06

Base URL: `https://www.smartchildcare.cn`

## Result

R05/R06 remains **blocked** for production release.

Local commit is `bf85945`. The Vercel Dashboard state was user-confirmed as Production deployment `bf85945 READY`, and `NEXT_PUBLIC_FORCE_MOCK_MODE` was user-confirmed as `false` or deleted. The production domain still behaves as if the AI/voice routes and voice orb UI from the local build are not present.

No AppKEY, token, secret, signature, authorization header, cookie, or full sensitive response header was recorded.

## Vercel Deployment And Mock Mode

| Check | Result |
| --- | --- |
| Local commit | `bf85945` |
| Vercel Production deployment | `bf85945 READY`, user-confirmed |
| Production redeploy | user-confirmed READY |
| Production runtime | still returns `404` for required logged-in AI/voice routes |
| `NEXT_PUBLIC_FORCE_MOCK_MODE` | user-confirmed `false` or deleted |
| Mock mode risk | low from the flag itself; code would force mock only when the value is exactly `"true"` |

The remaining blocker is not the visible presence of the nine VIVO variables in Vercel. It is that the production runtime at `www.smartchildcare.cn` still does not expose the required deployed routes/UI.

## Online Provider Status

| Check | Result | Classification |
| --- | --- | --- |
| Unauthenticated `/api/ai/provider-status` | `307 /login` | expected login protection |
| Logged-in `/api/ai/provider-status` as 陈园长 | `404` | production route/deployment mismatch |
| Logged-in `/api/ai/provider-status` as 李老师 | `404` | production route/deployment mismatch |
| Logged-in `/api/ai/provider-status` as 林妈妈 | `404` | production route/deployment mismatch |
| Chat | `unknown` online | not live-confirmed |
| OCR | `unknown` online | not live-confirmed |
| ASR | `unknown` online | not live-confirmed |

The local build contains `/api/ai/provider-status`, `/api/ai/voice-asr`, and `/api/voice-assistant/commands`, but the production domain returns `404` for them after login.

## Health Material Parsing

李老师 `/teacher/health-file-bridge` was checked with safe test text only.

Result:

- The page opened in a logged-in teacher session.
- The UI produced a parse result and save completed.
- The API provenance was `backend-text-fallback`.
- Live OCR on Vercel was not verified because provider status remains unavailable online.

## Voice Orb And Voice Commands

| Role | Account | Result |
| --- | --- | --- |
| 陈园长 | `u-admin` | voice orb missing |
| 李老师 | `u-teacher` | voice orb missing |
| 周老师 | `u-teacher2` | voice orb missing |
| 林妈妈 | `u-parent` | voice orb missing |

`/api/voice-assistant/commands` returned `404`, so director AI commands, write-confirmation behavior, unknown-command fail-closed behavior, and parent/teacher message preview flow were not verifiable online.

## Secret Exposure Check

Result: passed.

Findings:

- No high-risk credential exposure found in checked page source or frontend bundles.
- Browser requests did not send provider credentials to the client.
- No direct browser request to vivo provider hosts was observed.
- No runtime `process.env.NEXT_PUBLIC_VIVO_*` usage or public vivo env assignment was found in runtime source/env files.
- R05 spec was hardened so docs/tests/scripts safety text is not misclassified as runtime public-vivo usage.

## Local Final Commands

| Command | Result |
| --- | --- |
| `npm run lint` | passed |
| `npm run build` | passed |
| `npm run product:ai` | passed; local Chat/OCR/ASR live-pass |
| `npm run product:voice` | passed; parser 13/13 and Playwright 20/20 |
| `npm run product:journey` | passed; 1/1 |
| `npm run feature:smoke` | passed; 19/19 |
| `npm run bugbash:smoke` | passed on rerun; first run hit transient `ERR_NETWORK_CHANGED` |
| `npx tsc --noEmit` | passed |

## Artifacts

- `artifacts/product-completion/R05/r05-online-evidence.json`
- `artifacts/product-completion/R05/teacher-health-material-parsed.png`
- `artifacts/product-completion/R05/teacher-health-material-after-refresh.png`
- `artifacts/product-completion/R05/director-voice-orb-open.png`
- `artifacts/product-completion/R05/teacher-voice-orb-open.png`
- `artifacts/product-completion/R05/teacher-zhou-voice-orb-open.png`
- `artifacts/product-completion/R05/parent-voice-orb-open.png`

## Release Decision

- Demo/local release: acceptable; local gates are green.
- Production release: not recommended.

Before production release, verify that the production domain is actually serving the current deployment artifact/root and that logged-in `/api/ai/provider-status`, `/api/voice-assistant/commands`, `/api/ai/voice-asr`, and voice orb UI are present.
