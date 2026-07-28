# vivo Provider Live Smoke Report

Generated: 2026-05-05

## Current Status

- Local `.env.local`: SET
- Chat: `live-pass`
- OCR: `live-pass`
- ASR: `live-pass`
- `NEXT_PUBLIC_VIVO_*`: MISSING
- Live provider verified: yes, local Chat/OCR/ASR
- Release gate: local-live-provider-verified

No real vivo key, token, signature, secret, authorization header, or credential value is recorded in this report.

## Local Env Readiness

`npm run vivo:check-env` passed and only emitted SET/MISSING/readiness status:

| Item | Result |
| --- | --- |
| `.env.local` | SET |
| 9 server-side `VIVO_*` variables | SET |
| `NEXT_PUBLIC_VIVO_*` | MISSING |
| Chat | ready |
| OCR | ready |
| ASR | ready |

## product:ai Result

`npm run product:ai` passed.

| Capability | Smoke result | Provider error classification |
| --- | --- | --- |
| Chat | `live-pass` | none |
| OCR | `live-pass` | none |
| ASR | `live-pass` | none |

Additional checks:

- Node live smoke release gate: `live-provider-verified`
- Playwright provider/auth regression: 6/6 passed
- `secretsExposed`: false
- `missingEnv`: none
- `publicVivoEnv`: none

## Error Classification

No live provider failure was observed in this run.

| Classification | Result |
| --- | --- |
| auth/signature | none |
| endpoint | none |
| model | none |
| permission | none |
| network | none for live provider; prior bugbash `ERR_NETWORK_CHANGED` was not reproduced |
| unsupported format | none for live smoke; browser `webm` ASR remains fail-closed unless supported/converted |
| unknown | none |

## Vercel Status

Unauthenticated online check:

- `https://www.smartchildcare.cn/api/ai/provider-status`
- Result: `307 Temporary Redirect` to `/login`; `/login` returns `200 OK`
- Classification: `login-protected`

This is not treated as failure. Because no authenticated online page/provider-state evidence was captured in this run:

- Vercel env configured: `unknown`
- Vercel redeployed: `unknown`
- Vercel provider status: `login-protected`

Production release still needs an authenticated online provider-state check through the deployed Vercel app.

## Tencent Cloud Backend

The supplied Tencent Docker check is recorded as:

- Container: `childcare-smart-backend-staging`
- 9 server-side `VIVO_*`: all SET
- Real values: not read and not written

`https://api.smartchildcare.cn/health` is reachable and reports staging health `ok`, `brain_provider` as vivo, and vivo configuration present. This confirms Tencent backend health/configuration only. It does not replace Vercel Next `/api/ai/*` provider verification.

## Security Notes

- No real secret value was printed or persisted.
- No `NEXT_PUBLIC_VIVO_*` variable was added.
- Reports store only provider readiness/result classifications.
- Provider errors are not converted into pass states.
- Missing env is not converted into live-pass.

