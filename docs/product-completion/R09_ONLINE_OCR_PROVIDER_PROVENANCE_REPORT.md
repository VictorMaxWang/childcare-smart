# R09 Online OCR Provider Provenance Report

Generated: 2026-05-06

Base URL: `https://www.smartchildcare.cn`

## Result

R09 is **done**.

The remaining R05 gap was closed after a minimal provider-status and health-material provenance fix followed by a forced Vercel Production deployment. The production domain now reports Chat/OCR/ASR as `ready`, image health-material parsing preserves `vivo-ocr-provider` provenance, the OCR result was live-confirmed, and the saved health-material result remained visible after refresh.

No AppKEY, token, secret, signature, authorization header, cookie, full sensitive header, or environment variable value was recorded.

## Deployment

| Item | Result |
| --- | --- |
| Local branch | `main` |
| Local HEAD | `a281129` |
| Deployment method | `vercel --prod --force --yes` |
| Deployment URL | `https://childcare-smart-gvmdmmo1t-victormaxwangs-projects.vercel.app` |
| Deployment id | `dpl_5F1sxSwT5Tg9274ZSarjuvh6ppD9` |
| Created | `2026-05-06 20:16:58 +08:00` |
| Target/status | Production, READY |
| Production alias | `https://www.smartchildcare.cn` |

The Vercel build route list included `/api/ai/provider-status`, `/api/ai/health-file-bridge`, `/api/ai/voice-asr`, and `/api/voice-assistant/commands`.

## Provider Status

| Capability | Online status | Notes |
| --- | --- | --- |
| Chat | `ready` | configured, supported, real provider |
| OCR | `ready` | configured, supported, real provider; now explicitly returned in `/api/ai/provider-status` |
| ASR | `ready` | configured, supported, real provider |

Unauthenticated `/api/ai/provider-status` returned login protection (`401` in the final run), which is expected and not a provider failure.

## Health Material OCR Provenance

| Check | Result |
| --- | --- |
| Text material | `backend-text-fallback`; expected for text-only material and not counted as OCR failure |
| Image material | `vivo-ocr-provider;vivo;ready;false` |
| Image OCR live-confirmed | yes |
| Save and refresh | `saved-and-refreshed` via health-material API and teacher page history |
| Fake success | not observed |

The image fixture used only safe test text: `线上 OCR 验收测试，请忽略` plus an ASCII helper line. No real child-sensitive material was uploaded.

## Voice Orb Smoke

| Role | Result |
| --- | --- |
| 陈园长 / director | voice orb visible; `vivo provider ready` |
| 李老师 / teacher | voice orb visible; `vivo provider ready` |
| 林妈妈 / parent | voice orb visible; `vivo provider ready` |
| Command API | logged-in `/api/voice-assistant/commands` returned `200` |

## Secret Exposure Check

Passed.

Checked `/login` HTML and 17 frontend JS assets for high-risk provider markers. Findings were zero for:

- `VIVO_APP_KEY`
- `NEXT_PUBLIC_VIVO_`
- `sk-xuanji`
- `AppKEY`
- `VIVO_APP_ID`
- `VIVO_BASE_URL`

`npm run product:ai` also reported `publicVivoEnv: NONE`. No provider credential was sent to the browser in the R09 evidence.

## Local Gates

| Command | Result |
| --- | --- |
| `npm run lint` | passed |
| `npm run build` | passed |
| `npm run product:ai` | passed; Chat/OCR/ASR live-pass |
| `npm run product:voice` | passed |
| `npm run product:journey` | passed |
| `npm run feature:smoke` | passed on rerun with longer timeout |
| `npm run bugbash:smoke` | passed |
| `npx tsc --noEmit` | passed |

Additional targeted checks:

- `npx playwright test tests/product-completion/e05-vivo-provider.spec.ts --config=playwright.product.config.ts`: passed.
- Local R09 Playwright run against `http://127.0.0.1:3330`: passed.
- Online R09 Playwright run against `https://www.smartchildcare.cn`: passed.

## Changed Files

- `lib/voice-assistant/types.ts`
- `lib/voice-assistant/command-bus.ts`
- `app/api/ai/health-file-bridge/route.ts`
- `tests/product-completion/e05-vivo-provider.spec.ts`
- `tests/product-completion/r09-online-ocr-provider-provenance.spec.ts`
- `docs/product-completion/R09_ONLINE_OCR_PROVIDER_PROVENANCE_REPORT.md`
- `docs/product-completion/results/R09-result.md`
- `docs/product-completion/results/R09-result.json`
- Updated final R05/release/provider status reports.

## Artifacts

- `artifacts/product-completion/R09/r09-online-evidence.json`
- `artifacts/product-completion/R09/r09-online-ocr-1778070008186.png`
- `artifacts/product-completion/R09/health-material-saved-refresh.png`
- `artifacts/product-completion/R09/voice-orb-director.png`
- `artifacts/product-completion/R09/voice-orb-teacher.png`
- `artifacts/product-completion/R09/voice-orb-parent.png`

## Release Recommendation

- Demo release: recommended.
- Production release: technically recommended after committing/pushing the R09 source changes so GitHub main and the currently deployed Vercel artifact match.
- R99: can proceed now; R99 should record this R09 `done` status and the source-control follow-up.
