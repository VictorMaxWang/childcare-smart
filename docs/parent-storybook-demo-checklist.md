# Parent Storybook Demo Checklist
Updated: `2026-04-07`

## Before demo
- Confirm frontend and FastAPI brain are both running.
- If you are not on plain local dev, set `BRAIN_API_BASE_URL` explicitly before opening Storybook. Production-like runs must not rely on local port guessing.
- Confirm `/parent` and `/parent/storybook` both open normally on mobile width.
- Confirm `VIVO_APP_ID` and `VIVO_APP_KEY` are injected only through environment variables.
- Confirm the demo child feed exists and the storybook entry is visible on `/parent`.
- Prefer `npm run dev` for localhost auth/cookie smoke. `next start` on plain HTTP can be misleading for cookie checks.

## Auth / cookie smoke
- Before login, `GET /api/auth/session` should return `401`.
- Run demo login, then `GET /api/auth/session` should return `200`.
- Open `/parent`, then `/parent/storybook?child=<childId>`.
- Refresh the storybook page once.
- Go back to `/parent`, then reopen storybook and confirm the session still holds.

## Storybook smoke
- Run `npm run ai:smoke:storybook` with the real page fixture before the demo and confirm the first request is `remote-brain-proxy`, not `next-json-fallback`.
- Switch between all 3 presets and confirm the container theme changes immediately.
- Play one scene with real audio if available.
- If real audio is blocked or missing, confirm subtitle preview starts automatically.
- Swipe or tap to move between scenes and confirm the transition stays smooth on mobile.
- Reuse the same payload and allow warming/polling until `imageDelivery` reaches at least `mixed`.
- Reopen the same story and confirm cache badges or faster load behavior are visible.

## On-screen narration
- `live`: all scenes have real image and real narration.
- `mixed`: part of the story hit real media, the rest stayed on fallback.
- `fallback`: upstream media failed, but the story, viewer, and subtitle preview still demo cleanly.

## Fallback policy
- Do not claim fully live media if the badges say `mixed` or `fallback`.
- If image generation drops from `live` to `mixed`, continue the demo and explain that the product keeps successful real scenes and fills the rest with fallback.
- If TTS account permissions block a voice or engine, continue with subtitle preview instead of retrying repeatedly.
- Short-term cache is expected to make the second demo pass faster and more stable.

## Suggested demo order
1. Open `/parent`.
2. Enter `/parent/storybook`.
3. Switch 2 presets.
4. Play scene 1.
5. Move through scene 2 and scene 3.
6. Call out the current `live / mixed / fallback` state and continue the demo honestly.
