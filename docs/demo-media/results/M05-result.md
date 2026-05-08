# M05 Result

Status: done

## Root Cause

Growth data and GPT Image 2 growth assets were already present, but `app/growth/page.tsx` did not render `mediaRefs` or `mediaUrls` on growth record cards. The UI rendered only text metadata, so `/growth?child=c-1` had no image element even though the API returned growth media.

## Changes

- Added safe growth media path normalization and fallback rendering to `/growth`.
- Rendered growth media thumbnails for parent, teacher, and director growth cards without changing role scope logic.
- Added M05 growth media Playwright coverage.
- Extended demo media ingest acceptance to verify `/growth?child=c-1` UI image rendering.
- Added `npm run growth-media:test`.

## Result

- Growth media refs present: yes.
- Growth page renders images: yes.
- Growth image requests return 200: yes.
- Fallback preserved: yes.
- Data consistency: director 36, Li teacher 18, Zhou teacher 18.
- Meal, health material, and storybook media checks remain passing.

## Checks

- `npm run lint`: pass
- `npm run build`: pass
- `npm run product:smoke`: pass
- `npm run product:api`: pass
- `npm run product:ai`: pass
- `npm run product:voice`: pass
- `npm run product:journey`: pass
- `npm run feature:smoke`: pass
- `npm run bugbash:smoke`: pass
- `npx tsc --noEmit`: pass
- `npm run demo-media:test`: pass
- `npm run growth-media:test`: pass

## Notes

`growth-media:test` and `bugbash:smoke` were rerun on isolated ports after initial 3330 port conflicts from parallel local web servers. The reruns passed.

