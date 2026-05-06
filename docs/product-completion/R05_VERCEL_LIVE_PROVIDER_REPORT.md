# R05 Vercel Live Provider Report

Generated: 2026-05-06

Base URL: `https://www.smartchildcare.cn`

## Result

R05 is now **done** after the R09 OCR provenance follow-up.

R08 cleared the Vercel artifact/domain routing blocker. R09 then fixed the remaining provider-status response gap by returning OCR alongside Chat and ASR, and it preserved live OCR provenance for image health-material parsing. The production domain now exposes the required logged-in provider and voice routes, the voice orb is visible, and online OCR is live-confirmed.

No AppKEY, token, secret, signature, authorization header, cookie, or full sensitive response header was recorded.

## Vercel Deployment

| Check | Result |
| --- | --- |
| Local HEAD | `a281129` |
| Branch | `main` |
| Deployment method | `vercel --prod --force --yes` |
| Deployment URL | `https://childcare-smart-gvmdmmo1t-victormaxwangs-projects.vercel.app` |
| Deployment id | `dpl_5F1sxSwT5Tg9274ZSarjuvh6ppD9` |
| Created | `2026-05-06 20:16:58 +08:00` |
| Target/status | Production, READY |
| Production alias | `https://www.smartchildcare.cn` |
| Mock mode risk | no force-mock evidence; user-confirmed `NEXT_PUBLIC_FORCE_MOCK_MODE` is false or deleted |

## Online Provider Status

| Check | Result | Classification |
| --- | --- | --- |
| Unauthenticated `/api/ai/provider-status` | `401` | expected login protection |
| Logged-in `/api/ai/provider-status` | `200` | available |
| Chat | `ready` | live-capable |
| OCR | `ready` | live-capable; explicit response field present |
| ASR | `ready` | live-capable |

No `missing-env` state was observed online after R09.

## Health Material Parsing

李老师 was used for health-material validation with safe test material only.

| Input | Result |
| --- | --- |
| Text material | parsed through `backend-text-fallback`; this is expected for text-only input |
| Image material | parsed with `vivo-ocr-provider;vivo;ready;false` provenance |
| Image OCR live-confirmed | yes |
| Save/refresh | passed; saved health-material parse stayed visible after refresh |
| Fake success | not detected |

The image fixture contained only `线上 OCR 验收测试，请忽略` and an ASCII helper line.

## Voice Orb And Voice Commands

| Role | Account | Result |
| --- | --- | --- |
| 陈园长 | `u-admin` | voice orb visible; `vivo provider ready` |
| 李老师 | `u-teacher` | voice orb visible; `vivo provider ready` |
| 林妈妈 | `u-parent` | voice orb visible; `vivo provider ready` |

Logged-in `/api/voice-assistant/commands` returned `200`; it is no longer a 404 route gap.

## Secret Exposure Check

Passed.

Findings:

- No high-risk provider markers were found in `/login` HTML or 17 frontend JS assets.
- Zero occurrences were found for `VIVO_APP_KEY`, `NEXT_PUBLIC_VIVO_`, `sk-xuanji`, `AppKEY`, `VIVO_APP_ID`, and `VIVO_BASE_URL`.
- `npm run product:ai` reported `publicVivoEnv: NONE`.
- Browser-side R09 evidence did not expose provider credentials.

## Local Final Commands

| Command | Result |
| --- | --- |
| `npm run lint` | passed |
| `npm run build` | passed |
| `npm run product:ai` | passed; local Chat/OCR/ASR live-pass |
| `npm run product:voice` | passed |
| `npm run product:journey` | passed |
| `npm run feature:smoke` | passed on rerun with longer timeout |
| `npm run bugbash:smoke` | passed |
| `npx tsc --noEmit` | passed |

## Artifacts

- `artifacts/product-completion/R09/r09-online-evidence.json`
- `artifacts/product-completion/R09/r09-online-ocr-1778070008186.png`
- `artifacts/product-completion/R09/health-material-saved-refresh.png`
- `artifacts/product-completion/R09/voice-orb-director.png`
- `artifacts/product-completion/R09/voice-orb-teacher.png`
- `artifacts/product-completion/R09/voice-orb-parent.png`

## Release Decision

- Demo release: recommended.
- Production release: functionally recommended after the R09 source changes are committed and pushed so repository `main` matches the deployed Vercel artifact.
- R99: can proceed now.
