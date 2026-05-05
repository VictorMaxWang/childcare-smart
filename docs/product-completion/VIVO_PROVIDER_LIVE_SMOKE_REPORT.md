# vivo Provider Live Smoke Report

Generated: 2026-05-05

## Current Status

- Local `.env.local`: SET
- Chat: missing-env
- OCR: missing-env
- ASR: missing-env
- `NEXT_PUBLIC_VIVO_*`: MISSING
- Live provider verified: no
- Release gate: demo-ok-production-blocked

The AppKEY shared in chat is treated as leaked and was not used.

## product:ai Result

`npm run product:ai` passed in missing-env mode:

- Node live smoke generated `artifacts/product-completion/R04/product-ai-live-smoke.json`.
- Chat live request: not sent, missing-env.
- OCR live request: not sent, missing-env.
- ASR live request: not sent, missing-env.
- Playwright provider/auth regression: pass 6/6.

This is acceptable for demo release only. It is not a production live-provider verification. The report intentionally records `missing-env` instead of reporting a fake success.

## Vercel Status

- Vercel CLI: MISSING
- `.vercel/project.json`: MISSING
- Auto env configuration: manual-required
- Manual checklist: `artifacts/product-completion/R04/vercel-env-manual-checklist.md`

After adding the 9 `VIVO_*` variables in Vercel, redeploy the Vercel project and rerun live provider smoke. Tencent Docker env does not prove that `www.smartchildcare.cn` Next `/api/ai/*` has the required Vercel env.

## Security Notes

- No vivo key, token, authorization header, or account metadata was written to this report.
- `.env.example` must keep placeholders only.
- No provider code should be changed to force a success state.
- Do not add `NEXT_PUBLIC_VIVO_*`, and do not write real AppKEY values into tracked files or reports.

## Required Before Production

1. Reset the vivo AppKEY because an AppKEY was shared in chat.
2. Configure the reset AppKEY and all required server-side `VIVO_*` variables in local `.env.local`.
3. Configure the same variables in Vercel Project Environment Variables for Production, Preview, and Development.
4. Redeploy Vercel.
5. Rerun `npm run vivo:check-env`, `npm run product:ai`, and the final release gate.

## R99 Gate

R99 final acceptance is not ready. Configure the real vivo runtime env outside tracked files, rerun R04, and record live Chat/OCR/ASR outcomes before starting R99.
