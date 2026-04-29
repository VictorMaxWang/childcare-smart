# F60 Fix Result

Updated: 2026-04-29

## BugIds

- Assigned: `BUG-004`, `BUG-020`, `BUG-021`, `BUG-B11-004`, `BUG-B24-001`, `BUG-B24-002`, `BUG-B24-003`
- Fixed: `BUG-004`, `BUG-020`, `BUG-021`, `BUG-B11-004`, `BUG-B24-001`, `BUG-B24-002`, `BUG-B24-003`
- Unfixed: none in F60 scope

## Summary

- Login mobile no longer renders or requests the desktop-only `login-left-replica.png`; the desktop decorative image is gated behind `min-width: 901px` and no longer uses `priority` / `unoptimized`.
- Storybook images now support explicit `loading`; the visible/first scene uses eager loading and offscreen storybook scenes use lazy loading.
- `public/pixel-replica/manifest.json` was regenerated without local absolute paths, `sourceRoot`, `sourceAbsolutePath`, or `absolutePath`; runtime `sourceReferences` were removed from director replica data.
- Recharts chart wrappers with invalid `h-65` were replaced by stable arbitrary heights, fixing the invalid-size warning path for `/health` and `/growth`.
- Director closure progress on mobile now renders as cards; tablet/desktop keep a horizontally safe table with minimum width.
- Storybook and parent feedback sections reserve bottom safe area so fixed bottom tabs do not cover content or submit controls.

## Checks

- `node --check scripts/f60-responsive-assets-retest.mjs`: passed
- `npm run lint`: passed
- `npm run build`: passed
- Production/public path leak scan: passed
- `node scripts/f60-responsive-assets-retest.mjs`: passed, artifact `artifacts/bug-bash/fixes/F60/f60-responsive-assets-retest.json`
- `npm run bugbash:smoke`: failed on 11 non-F60 residual issues in `artifacts/bug-bash/B26/b26-smoke-results.json`

## Playwright Evidence

`artifacts/bug-bash/fixes/F60/f60-responsive-assets-retest.json` passed these checks:

- `login-mobile`: no horizontal overflow, no broken images, no `login-left-replica` request.
- `login-register-dialog-mobile`: dialog opens, no horizontal overflow, no broken images.
- `parent-home-mobile`: no horizontal overflow or broken images.
- `parent-storybook-mobile`: no horizontal overflow or broken images; storybook has eager current imagery and lazy offscreen images.
- `teacher-workbench-mobile`: no horizontal overflow or broken images; mobile drawer opens.
- `director-home-tablet`: no horizontal overflow or broken images.
- `director-home-mobile`: no horizontal overflow or broken images; visible table count is `0`.
- `parent-feedback-tablet`: no horizontal overflow or broken images; feedback button is not covered by the bottom nav.

## Residuals

`npm run bugbash:smoke` still fails because B26 smoke records teacher duplicate-key console warnings and parent suggestions API 500 errors (`duplicateOf: BUG-002`). These are outside F60's CSS/assets/responsive scope.
