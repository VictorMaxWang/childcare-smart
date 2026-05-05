# R04-config vivo environment automation result

Generated: 2026-05-05

## Status

- Overall: partial
- Local `.env.local`: SET
- Chat: missing-env
- OCR: missing-env
- ASR: missing-env
- `NEXT_PUBLIC_VIVO_*`: MISSING
- Secrets exposed: false

The AppKEY shared in chat is treated as leaked and was not used.

## Local env check

`npm run vivo:check-env` and `npm run vivo:check-env:partial` both failed as expected because all 9 vivo variables are missing:

- VIVO_APP_KEY
- VIVO_APP_ID
- VIVO_BASE_URL
- VIVO_LLM_MODEL
- VIVO_OCR_PATH
- VIVO_ASR_PACKAGE
- VIVO_ASR_CLIENT_VERSION
- VIVO_ASR_USER_ID
- VIVO_ASR_ENGINE_ID

No live provider request was sent.

## Vercel

- Vercel CLI: MISSING
- Login: not checked because CLI is missing
- Project link: MISSING
- Auto configuration: manual-required
- Manual checklist: `artifacts/product-completion/R04/vercel-env-manual-checklist.md`
- Redeploy required after variables are configured.

## Tencent Docker

- Docker CLI/runtime: MISSING
- `childcare-smart-backend-staging`: MISSING
- `smartchildcare-backend-staging`: MISSING
- `smartchildcare-caddy-staging`: proxy container only

This does not clear the Vercel Next `/api/ai/*` production blocker. If vivo runs in Vercel Next API, Vercel env remains the required production configuration surface.

## product:ai

- Node live smoke: missing-env, no live provider request sent
- Playwright provider/auth regression: pass 6/6
- Overall command: pass

## Verification

- `npm run vivo:check-env`: expected-fail missing-env
- `npm run vivo:check-env:partial`: expected-fail missing-env
- `npm run product:ai`: pass with missing-env
- `npm run lint`: pass
- `npm run build`: pass

Production release is still blocked until a reset AppKEY and all real vivo env are configured locally and in Vercel, Vercel is redeployed, and `product:ai` live smoke passes with real provider requests.
