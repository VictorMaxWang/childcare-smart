# M05 Growth Media Render Fix Report

Date: 2026-05-08

## Scope

M05 only fixes GPT Image 2 growth media rendering on the growth record page. The change does not modify demo seed generation, vivo provider code, production permission/scope logic, environment files, or the existing meal, health-material, and storybook media integrations.

## Root Cause

Growth seed/API data already included `mediaRefs` and `mediaUrls` that point to `/demo-media/gpt-image2/growth/...`, and `lib/demo-media/assets.ts` already exposed the growth fallback path. The `/growth` UI rendered the original text, tags, dates, teacher names, and review fields, but it never read or rendered the growth media fields. As a result, API/media coverage passed while `/growth?child=c-1` produced no image element.

## Diagnosis

- Growth seed data contains media refs: 216 growth records include GPT Image 2 growth media refs.
- The refs point to `gpt-image2/growth` public assets.
- `public/demo-media/manifest.json` includes 14 growth assets.
- `lib/demo-media/assets.ts` can resolve growth media and keeps `/demo-media/growth/demo-growth-placeholder.svg` as fallback.
- `/growth?child=c-1` reads growth records, including parent daily growth payloads.
- The page ignored `mediaRefs` and `mediaUrls`; this was the root UI gap.
- No hidden image component was blocking rendering; the growth page simply lacked a growth media renderer.
- Parent, teacher, and director views share the same `/growth` page with role-based filtering; those filters remain unchanged.
- Fallback existed in the media asset layer but was not wired into the growth page.
- If an old browser localStorage seed lacks media refs, the page now renders the safe growth fallback instead of breaking or showing a local absolute path.

## Fix

- Added a small growth media resolver in `app/growth/page.tsx`.
- Media source priority is `mediaRefs` then `mediaUrls`, preferring `/demo-media/gpt-image2/growth/...`.
- Rejected unsafe paths, including Windows absolute paths and non-demo-media paths.
- Added fallback handling with `/demo-media/growth/demo-growth-placeholder.svg`.
- If a source fails to load, the image switches to fallback; if fallback also fails, the image hides without crashing the card.
- Rendered thumbnails inside parent, teacher, and director growth record cards while preserving existing text, tags, dates, teachers, and review content.
- Added stable DOM markers: `data-testid="growth-record-card"` and `data-testid="growth-record-image"`.

## Verification

- Browser verification on `http://127.0.0.1:3335/growth?child=c-1` found visible growth image elements. First parent image: `/demo-media/gpt-image2/growth/demo-growth-auto-005.webp`, HTTP 200.
- Browser verification on teacher `/growth` found visible growth image elements for both Li and Zhou teacher accounts. First Li image: `/demo-media/gpt-image2/growth/demo-growth-auto-003.webp`, HTTP 200. First Zhou image: `/demo-media/gpt-image2/growth/demo-growth-auto-009.webp`, HTTP 200.
- Zhou teacher scope check found no `data-child-id="c-1"` cards.
- Data consistency remains director 36, Li teacher 18, Zhou teacher 18.

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

