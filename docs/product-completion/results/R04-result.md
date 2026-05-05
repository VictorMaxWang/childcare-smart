# R04 Result

Generated: 2026-05-05

## Status

done

## Summary

R04 live vivo provider smoke is complete. Local server-side vivo runtime env is ready for Chat, OCR, and ASR, and `npm run product:ai` sent real provider requests for all three capabilities. Chat, OCR, and ASR all returned `live-pass`.

No fake success was recorded. `missing-env` was not treated as `live-pass`, and provider errors were not treated as passing results.

## Local Env

Only presence and readiness were checked. No secret values were printed or written.

| Capability | Status |
| --- | --- |
| Chat | `ready` |
| OCR | `ready` |
| ASR | `ready` |

`npm run vivo:check-env` output showed:

- Project root: SET
- `.env.local`: SET
- 9 server-side `VIVO_*` variables: SET
- `NEXT_PUBLIC_VIVO_*`: MISSING
- Chat/OCR/ASR: ready

## Local Smoke

| Capability | Result | Classification |
| --- | --- | --- |
| Chat | `live-pass` | none |
| OCR | `live-pass` | none |
| ASR | `live-pass` | none |

`npm run product:ai` result:

- Node live smoke: `live-provider-verified`
- Chat/OCR/ASR: `live-pass`
- Playwright AI provider/auth regression: 6/6 passed
- `secretsExposed`: false

## Vercel

Unauthenticated request to `https://www.smartchildcare.cn/api/ai/provider-status` returns `307 Temporary Redirect` to `/login`, then `/login` returns `200 OK`.

This is recorded as `login-protected`, not as a provider failure. Authenticated online provider-state verification was not completed in this run, so Vercel env effectiveness and redeploy state remain `unknown`.

## Tencent Cloud

Per the supplied Tencent Docker verification, container `childcare-smart-backend-staging` has all 9 server-side `VIVO_*` variables SET. No values were read or recorded.

`https://api.smartchildcare.cn/health` is reachable and reports staging health `ok`; that endpoint is configuration/health evidence for the Tencent backend, not proof that Vercel Next `/api/ai/*` has live provider env.

## R99 Checks

| Command | Result |
| --- | --- |
| `npm run vivo:check-env` | passed |
| `npm run lint` | passed |
| `npm run build` | passed |
| `npm run product:smoke` | passed, 2/2 |
| `npm run product:api` | passed, 8/8 |
| `npm run product:ai` | passed; Chat/OCR/ASR live-pass; Playwright 6/6 |
| `npm run product:voice` | passed; parser 13/13 and Playwright 20/20 |
| `npm run product:journey` | passed, 1/1 |
| `npm run feature:smoke` | passed, 19/19 |
| `npm run bugbash:smoke` | passed, 1/1 |
| `npx tsc --noEmit` | passed |

Prior `bugbash:smoke` network error `ERR_NETWORK_CHANGED` was rerun and did not reproduce.

## Secret Safety

- No real vivo key, token, signature, secret, authorization header, or credential value was written to this report.
- No `NEXT_PUBLIC_VIVO_*` variable was added.
- No tracked source, docs, snapshots, or test fixtures were populated with real secrets.

