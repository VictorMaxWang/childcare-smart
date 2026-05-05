# vivo Provider Live Smoke Report

Generated: 2026-05-05

## Current status

- Local `.env.local`: SET
- Chat: missing-env
- OCR: missing-env
- ASR: missing-env
- `NEXT_PUBLIC_VIVO_*`: MISSING
- Live provider verified: no
- Release gate: demo-ok-production-blocked

The AppKEY shared in chat is treated as leaked and was not used.

## product:ai result

`npm run product:ai` passed in missing-env mode:

- Node live smoke generated `artifacts/product-completion/R04/product-ai-live-smoke.json`
- Chat live request: not sent, missing-env
- OCR live request: not sent, missing-env
- ASR live request: not sent, missing-env
- Playwright provider/auth regression: pass 6/6

This is acceptable for demo release only. It is not a production live-provider verification.

## Vercel status

- Vercel CLI: MISSING
- `.vercel/project.json`: MISSING
- Auto env configuration: manual-required
- Manual checklist: `artifacts/product-completion/R04/vercel-env-manual-checklist.md`

After adding the 9 `VIVO_*` variables in Vercel, redeploy the Vercel project and rerun live provider smoke. Tencent Docker env does not prove that `www.smartchildcare.cn` Next `/api/ai/*` has the required Vercel env.

## Required before production

1. Reset the vivo AppKEY because an AppKEY was shared in chat.
2. Configure the reset AppKEY and all required server-side `VIVO_*` variables in local `.env.local`.
3. Configure the same variables in Vercel Project Environment Variables for Production, Preview, and Development.
4. Redeploy Vercel.
5. Rerun `npm run vivo:check-env`, `npm run product:ai`, and the final release gate.

Do not add `NEXT_PUBLIC_VIVO_*`, and do not write real AppKEY values into tracked files or reports.
