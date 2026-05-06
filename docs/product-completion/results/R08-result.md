# R08 Result

Status: `partial`

Generated: 2026-05-06

## Summary

R08 cleared the Vercel production artifact/domain routing blocker. After `vercel --prod --force`, the direct deployment URL and `https://www.smartchildcare.cn` no longer return `404` for:

- `/api/ai/provider-status`
- `/api/ai/voice-asr`
- `/api/voice-assistant/commands`

The formal production domain also passed logged-in API checks for provider status, typed ASR fallback, and voice command planning. The voice orb is visible and opens for `u-admin`, `u-teacher`, `u-teacher2`, and `u-parent`.

R08 remains `partial` rather than `done` because the broader R05 provider acceptance still has a residual non-routing issue: Chat and ASR report ready, but OCR is not exposed by `/api/ai/provider-status`, and the health material UI did not show a completed parse result during the R08 wait window even though the API returned success/fallback provenance.

## Deployment

- Local HEAD: `7c00e52`
- Branch: `main`
- Vercel project: `victormaxwangs-projects/childcare-smart`
- Deployment method: `vercel --prod --force`
- Deployment URL: `https://childcare-smart-gv1cv0ks8-victormaxwangs-projects.vercel.app`
- Deployment id: `dpl_EBrreqXHBJpwwrwF2TrbXdZ3S5DV`
- Deployment status: `READY`
- Target: Production
- Production alias: `https://www.smartchildcare.cn`

## Route Results

### Deployment URL

- `GET /api/ai/provider-status`: `401`, route exists, not `404`
- `POST /api/ai/voice-asr`: `401`, route exists, not `404`
- `POST /api/voice-assistant/commands`: `401`, route exists, not `404`

### Production Domain

- unauthenticated `GET /api/ai/provider-status`: `401`, login protected, not `404`
- logged-in `GET /api/ai/provider-status`: `200`
- unauthenticated `POST /api/ai/voice-asr`: `401`, login protected, not `404`
- logged-in `POST /api/ai/voice-asr`: `200`
- unauthenticated `POST /api/voice-assistant/commands`: `400`, invalid empty request, not `404`
- logged-in `POST /api/voice-assistant/commands`: `200`

## Voice Orb

- Director `u-admin`: visible and opens
- Teacher Li `u-teacher`: visible and opens
- Teacher Zhou `u-teacher2`: visible and opens
- Parent Lin `u-parent`: visible and opens

## Local Gates

- `npm run lint`: passed
- `npm run build`: passed
- `npm run product:ai`: passed
- `npm run product:voice`: passed
- `npm run product:journey`: passed
- `npm run feature:smoke`: passed
- `npm run bugbash:smoke`: passed
- `npx tsc --noEmit`: passed

## Next Step

R05 can be rerun now. R99 should wait until the next R05 pass settles the remaining OCR/health material provenance behavior.
