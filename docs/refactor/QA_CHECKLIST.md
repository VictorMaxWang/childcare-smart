# Frontend Visual QA Checklist

## 1. Functionality Regression

- Existing buttons, forms, links, toggles, dialogs, and AI/voice/storybook flows still work.
- No backend API shape changed for visual-only tasks.
- No route or core field is removed.

## 2. Route Access

- Check `/login`, `/auth/login`, `/`, `/admin`, `/admin/agent`, `/children`, `/health`, `/growth`, `/diet`, `/teacher`, `/teacher/agent`, `/teacher/health-file-bridge`, `/teacher/high-risk-consultation`, `/parent`, `/parent/agent?child=c-1`, `/parent/storybook?child=c-1`.

## 3. Three Role Login

- Director demo account reaches `/admin`.
- Teacher demo account reaches `/teacher`.
- Parent demo account reaches `/parent`.
- Logout returns to `/login`.

## 4. Responsive

- Desktop 1440px.
- Tablet 768px.
- Mobile 390px.
- No horizontal overflow, clipped text, or blocked controls.

## 5. Tables

- Headers are readable.
- Rows have adequate spacing.
- Numeric values and actions align.
- Mobile fallback is usable.

## 6. Forms

- Labels remain visible.
- Validation/errors display without layout breakage.
- Required fields and disabled/loading states remain clear.

## 7. Dialogs and Drawers

- Dialog title, content, close button, and footer actions are visible.
- Confirmation dialogs preserve destructive semantics.
- Mobile dialog/drawer content is scrollable.

## 8. Empty and Error States

- Empty lists show useful empty states.
- `app/error.tsx` reset action remains usable.
- Permission-denied/error states do not expose sensitive details.

## 9. Visual Unity

- Pages use one shared color, radius, shadow, typography, and spacing system.
- Director, teacher, and parent differences are purposeful, not stylistic fragmentation.

## 10. Copy

- Chinese copy is readable and not garbled.
- Do not introduce unexplained English UI text except technical labels that already exist.

## 11. Sensitive Information

- Do not expose secrets, tokens, internal IDs, real credentials, or private personal data.
- Screenshot artifacts should remain demo-safe.

## 12. Lint

- Run `npm run lint`.
- Record warnings/errors.

## 13. Build

- Run `npm run build`.
- Record failures with concise cause.

## 14. Screenshot Capture

- Run `npm run capture:ui` for visual QA tasks and final QA.
- Use `CAPTURE_BASE_URL` if testing a non-default local/remote deployment.

## 15. Design Asset Comparison

- Compare captured UI with `docs/refactor/DESIGN_ASSET_INDEX.md` and `artifacts/refactor-design-assets/design-images.index.json`.
- Compare style direction, not pixels.

## 16. T07 Shared State QA

- Empty, error, permission, loading, and skeleton states should use the shared `state-block` visual rhythm.
- Error states must keep an explicit recovery path such as retry, reset, return, or clear-filter.
- Permission states should explain the access boundary without exposing sensitive details.
- Loading states should not create oversized rounded decorative panels or layout jumps.

## 17. T07 Form, Dialog, and Drawer QA

- Form controls keep visible labels, required markers, helper text, inline validation, disabled state, and loading state.
- Mobile form controls and action buttons keep at least 44px touch targets.
- Dialogs and bottom-sheet style dialogs remain within the viewport and scroll internally on mobile.
- Confirmation dialogs keep danger/warning semantics visible and do not trigger destructive actions during QA.
- Drawers use safe-area footer padding and full-width mobile actions.

## 18. T07 Responsive Verification Notes

- T07 supplemental Playwright smoke verified director, teacher, and parent routes at 1440, 768, and 390 widths with no blank page, no Runtime Error text, and no document-level horizontal overflow.
- `capture:ui` was attempted against local production server but timed out after 15 minutes after writing partial login/director screenshots.
- T08 should rerun full screenshot capture and visual review for the remaining teacher and parent screenshot set.
