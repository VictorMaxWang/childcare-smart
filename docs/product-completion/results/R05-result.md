# R05 Result

Generated: 2026-05-05

Status: `blocked`

Base URL: `https://www.smartchildcare.cn`

## Summary

The production Vercel site is reachable and unauthenticated `/api/ai/provider-status` is correctly protected by `307 /login`. In logged-in demo-account sessions, `/api/ai/provider-status`, `/api/voice-assistant/commands`, and `/api/ai/voice-asr` returned `404`.

Because the local build contains these routes and all local AI/voice gates are green, the online failure is classified as `vercel-not-redeployed`. R05 did not prove `vercel-env-missing`; the deployed production route needed to inspect the Vercel environment is missing.

## Online Checks

- Login-protected provider status: passed, `307 /login`.
- Logged-in provider status: blocked by production `404`.
- Chat: `unknown` online.
- OCR: `unknown` online.
- ASR: `unknown` online.
- Health material parsing: UI parsed and saved through `backend-text-fallback`; live OCR not verified.
- Voice orb: missing for 陈园长, 李老师, 周老师, and 林妈妈.
- Fake success: not detected.
- Secret exposure: not found.

## Error Classification

- `login-required`: unauthenticated provider-status returned expected `307 /login`.
- `vercel-not-redeployed`: logged-in provider-status `404`, voice command endpoint `404`, ASR endpoint `404`, and voice orb missing for all four roles.
- `unknown`: ASR typed fallback secondary status remained missing after route `404`.
- `vercel-env-missing`: not observed.
- `auth/signature`: not observed.
- `endpoint`: raw symptom was `404`, classified as `vercel-not-redeployed` based on local build evidence.
- `model`: not observed.
- `permission`: not observed.
- `network`: not observed for the production provider path.
- `unsupported format`: not observed.
- `scope-403`: not observed.
- `provider-unavailable`: not observed.

## Local Command Results

- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run product:ai`: passed; local Chat/OCR/ASR live-pass.
- `npm run product:voice`: passed.
- `npm run product:journey`: passed.
- `npm run feature:smoke`: passed.
- `npm run bugbash:smoke`: passed.
- `npx tsc --noEmit`: passed.

## Artifacts

- `artifacts/product-completion/R05/r05-online-evidence.json`
- `artifacts/product-completion/R05/teacher-health-material-parsed.png`
- `artifacts/product-completion/R05/teacher-health-material-after-refresh.png`
- `artifacts/product-completion/R05/director-voice-orb-open.png`
- `artifacts/product-completion/R05/teacher-voice-orb-open.png`
- `artifacts/product-completion/R05/teacher-zhou-voice-orb-open.png`
- `artifacts/product-completion/R05/parent-voice-orb-open.png`
