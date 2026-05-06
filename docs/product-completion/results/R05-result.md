# R05/R06 Result

Generated: 2026-05-06

Status: `blocked`

Base URL: `https://www.smartchildcare.cn`

Local commit: `bf85945`

Vercel Production deployment: `bf85945 READY`, user-confirmed

## Summary

The production Vercel deployment was user-confirmed as `bf85945 READY`, and `NEXT_PUBLIC_FORCE_MOCK_MODE` was user-confirmed as `false` or deleted. The production runtime still returns `404` for logged-in `/api/ai/provider-status`, `/api/voice-assistant/commands`, and `/api/ai/voice-asr`.

Because the local build includes these routes and local gates are green, R05/R06 remains blocked by a production runtime/deployment artifact mismatch. This is not a proven Vercel env missing state.

## Online Checks

- Login-protected provider status: passed, unauthenticated `307 /login`.
- Logged-in provider status: blocked by production `404`.
- Chat: `unknown` online.
- OCR: `unknown` online.
- ASR: `unknown` online.
- Health material parsing: UI parsed and saved through `backend-text-fallback`; live OCR not verified.
- Voice orb: missing for 陈园长, 李老师, 周老师, and 林妈妈.
- Fake success: not detected.
- Secret exposure: not found.
- Mock mode risk: low from the flag itself; current value is user-confirmed false/deleted.

## Local Command Results

- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run product:ai`: passed; local Chat/OCR/ASR live-pass.
- `npm run product:voice`: passed.
- `npm run product:journey`: passed.
- `npm run feature:smoke`: passed.
- `npm run bugbash:smoke`: passed on rerun; first run hit transient `ERR_NETWORK_CHANGED`.
- `npx tsc --noEmit`: passed.

## Release Recommendation

Production release is not recommended. Verify the production domain is serving the current deployment artifact/root, then rerun R05 until provider-status, voice commands, ASR, and voice orb are available online.
