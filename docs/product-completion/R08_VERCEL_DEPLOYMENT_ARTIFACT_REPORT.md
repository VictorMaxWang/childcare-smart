# R08 Vercel Production Artifact And Domain Routing Report

Generated: 2026-05-06

Base URL: `https://www.smartchildcare.cn`

## Result

R08 is **partial**.

The production artifact/domain routing blocker was cleared: after a forced no-cache Vercel Production deployment, both the direct deployment URL and `www.smartchildcare.cn` stopped returning `404` for the required AI and voice routes. The formal production domain now serves logged-in `/api/ai/provider-status`, `/api/ai/voice-asr`, and `/api/voice-assistant/commands`, and the voice orb is visible for director, teacher, second teacher, and parent demo roles.

The result is not marked `done` because the remaining R05 provider acceptance still has a non-routing gap: the provider-status endpoint reports Chat and ASR as ready, but does not expose OCR in the same response shape, and the health material UI evidence did not render a completed parse result within the Playwright wait window even though the relevant API calls returned success/fallback provenance.

No AppKEY, token, secret, signature, authorization header, cookie, or full sensitive response header was recorded.

## Local Source And Build

| Check | Result |
| --- | --- |
| Branch | `main` |
| Git status | clean before report files |
| Local HEAD | `7c00e52 Fix Vercel Analytics Next import` |
| Required API files in Git HEAD | present |
| Required voice component in Git HEAD | present |
| Local build | passed |
| Local build route artifact: provider-status | present |
| Local build route artifact: voice-asr | present |
| Local build route artifact: voice commands | present |

Local route artifacts verified:

- `.next/server/app/api/ai/provider-status/route.js`
- `.next/server/app/api/ai/voice-asr/route.js`
- `.next/server/app/api/voice-assistant/commands/route.js`

## Routing Configuration Review

No source-level rewrite/root-directory cause was found.

| File | Finding |
| --- | --- |
| `next.config.ts` | no `/api/*` rewrites |
| `proxy.ts` | lets `/api/ai` and `/api/voice-assistant` routes handle auth themselves |
| `middleware.ts` | not present |
| `vercel.json` | not present |
| `.vercel/project.json` | created by `vercel link`; project linked to `victormaxwangs-projects/childcare-smart`; IDs not recorded in this report |

## Vercel Deployment

| Item | Value |
| --- | --- |
| Vercel CLI | `53.1.1` |
| Project | `victormaxwangs-projects/childcare-smart` |
| Root directory | repo root by observed build behavior; no local root override file found |
| Production branch | `main` |
| Deployment method | `vercel --prod --force` |
| Build cache | skipped by Vercel |
| Deployment URL | `https://childcare-smart-gv1cv0ks8-victormaxwangs-projects.vercel.app` |
| Deployment id | `dpl_EBrreqXHBJpwwrwF2TrbXdZ3S5DV` |
| Created | `2026-05-06 16:54:22 +08:00` |
| Target | Production |
| Status | READY |
| Deployment commit metadata | CLI local artifact; Vercel inspect git metadata was null |
| Local artifact source | local HEAD `7c00e52` |
| Production alias | `https://www.smartchildcare.cn` assigned to this deployment |

The Vercel build route list included `/api/ai/provider-status`, `/api/ai/voice-asr`, and `/api/voice-assistant/commands`.

## Route Comparison

Unauthenticated responses are allowed to be auth/validation failures. The R08 failure condition was `404`.

### Deployment URL

| Route | Result |
| --- | --- |
| `GET /api/ai/provider-status` | `401`; route exists; not `404` |
| `POST /api/ai/voice-asr` | `401`; route exists; not `404` |
| `POST /api/voice-assistant/commands` | `401`; route exists; not `404` |

Logged-in checks were performed against the formal production domain because direct deployment-host demo login returned protected/unauthorized behavior. The production alias is assigned to the forced deployment.

### `www.smartchildcare.cn`

| Route | Result |
| --- | --- |
| unauthenticated `GET /api/ai/provider-status` | `401`; login protected; not `404` |
| logged-in `GET /api/ai/provider-status` | `200`; Chat ready, ASR ready, OCR not present in this response shape |
| unauthenticated `POST /api/ai/voice-asr` | `401`; login protected; not `404` |
| logged-in `POST /api/ai/voice-asr` | `200`; typed transcript path returned `provided_transcript` |
| unauthenticated `POST /api/voice-assistant/commands` | `400`; invalid empty request; not `404` |
| logged-in `POST /api/voice-assistant/commands` | `200`; safe command plan returned ready |

## Voice Orb

| Role | Account | Route | Result |
| --- | --- | --- | --- |
| Director | `u-admin` | `/admin` | button visible, panel visible, provider text `vivo provider ready` |
| Teacher Li | `u-teacher` | `/teacher` | button visible, panel visible, provider text `vivo provider ready` |
| Teacher Zhou | `u-teacher2` | `/teacher` | button visible, panel visible, provider text `vivo provider ready` |
| Parent Lin | `u-parent` | `/parent?child=c-1` | button visible, panel visible, provider text `vivo provider ready` |

## Health Material Follow-Up

Teacher health material checks used only safe test text.

| Check | Result |
| --- | --- |
| `POST /api/ai/health-file-bridge` | `200` |
| provider/source evidence | `backend-text-fallback` |
| `POST /api/health-materials` | `201` |
| UI parse completion evidence | not visible within the R08 Playwright wait window |

This is not an artifact-route failure because the health API routes responded. It should be handled in the next R05/R99 provider acceptance pass if OCR/live provenance is required.

## Local Final Gates

| Command | Result |
| --- | --- |
| `npm run lint` | passed |
| `npm run build` | passed |
| `npm run product:ai` | passed; local Chat/OCR/ASR live-pass |
| `npm run product:voice` | passed |
| `npm run product:journey` | passed |
| `npm run feature:smoke` | passed |
| `npm run bugbash:smoke` | passed |
| `npx tsc --noEmit` | passed |

`bugbash:smoke` emitted local brain proxy fallback/connection-reset noise after the browser test, but the Playwright test itself passed and the command exited `0`.

## Artifacts

- `artifacts/product-completion/R08/r08-online-evidence.json`
- `artifacts/product-completion/R08/director-voice-orb.png`
- `artifacts/product-completion/R08/teacher-li-voice-orb.png`
- `artifacts/product-completion/R08/teacher-zhou-voice-orb.png`
- `artifacts/product-completion/R08/parent-voice-orb.png`
- `artifacts/product-completion/R08/teacher-health-material.png`
- `artifacts/product-completion/R08/diagnostic-admin-network.json`
- `artifacts/product-completion/R08/diagnostic-admin-loading.png`

## Root Cause And Fix

Most likely root cause: stale or mismatched Vercel Production artifact/alias/cache state before R08. Source code, local build output, and route configuration did not explain the previous online `404` behavior.

Fix applied: Vercel CLI was installed, the local workspace was linked to `victormaxwangs-projects/childcare-smart`, and `vercel --prod --force` deployed a no-cache Production artifact. The resulting Production deployment is READY and assigned to `www.smartchildcare.cn`.

## Recommendation

R05 can be rerun now because the route/artifact blocker is cleared.

R99 should wait for the next R05 pass to explicitly settle the OCR/health material provenance gap. The current routing and voice-orb state no longer blocks R05/R99, but the remaining provider acceptance result should not be inferred from R08 alone.
