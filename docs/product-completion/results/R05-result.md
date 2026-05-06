# R05 Result

Generated: 2026-05-06

Status: `done`

Base URL: `https://www.smartchildcare.cn`

## Summary

R05 is complete after the R09 OCR provenance recheck. The production domain no longer has the R08 route/artifact mismatch, and `/api/ai/provider-status` now returns Chat/OCR/ASR with `ready` status after login.

## Online Checks

- Login-protected provider status: passed; unauthenticated request returns `401`.
- Logged-in provider status: passed; `200`.
- Chat: `ready`.
- OCR: `ready`.
- ASR: `ready`.
- Text health material: `backend-text-fallback`, expected for text-only input.
- Image health material: `vivo-ocr-provider;vivo;ready;false`, live-confirmed.
- Health material save/refresh: passed.
- Voice orb: visible for 陈园长, 李老师, and 林妈妈 with `vivo provider ready`.
- Voice command API: logged-in `200`.
- Fake success: not detected.
- Secret exposure: not found.

## Local Command Results

- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run product:ai`: passed; local Chat/OCR/ASR live-pass.
- `npm run product:voice`: passed.
- `npm run product:journey`: passed.
- `npm run feature:smoke`: passed on rerun with longer timeout.
- `npm run bugbash:smoke`: passed.
- `npx tsc --noEmit`: passed.

## Release Recommendation

R05 supports demo release and production release from a feature/security standpoint. Commit and push the R09 source changes before formal production handoff so GitHub main and the deployed Vercel artifact are aligned, then run R99.
