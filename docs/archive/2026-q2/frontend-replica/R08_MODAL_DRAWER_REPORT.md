# R08 Modal And Drawer Report

## New Shared Primitives

- `components/ui/confirm-dialog.tsx`: shared confirmation dialog with loading, cancel/confirm labels, variants, Esc handling, overlay handling, and mobile-friendly layout.
- `components/ui/responsive-detail-sheet.tsx`: responsive detail surface using desktop drawer behavior and mobile bottom sheet behavior with body scrolling and sticky footer safe-area spacing.

## Covered Dialogs

- Child add/edit validation remains modal-based.
- Child archive/restore now uses `ConfirmDialog`; cancel does not write, confirm gates the API call.
- Teacher archive/restore now uses `ConfirmDialog`; native browser confirmation is no longer used.
- Parent feedback detail is a controlled page-level dialog with overlay close, Esc close, close button, attachments, status history, and director status actions.
- Voice command write paths remain confirmation-gated by existing voice assistant flows.

## Covered Drawers And Sheets

- Health material parse result opens in a responsive detail sheet after parse completion.
- Health material history/detail content uses the same responsive sheet pattern.
- Mobile detail surfaces keep `max-height` constraints, internal scrolling, sticky footer actions, and safe-area spacing.

## Overlay Stack

- Dialog/drawer/sheet overlays are above mobile sidebars, bottom navigation, and voice entry.
- The global voice entry has lower z-index than modal overlays and is shifted on teacher routes so it does not overlap the teacher-specific voice FAB.

## Remaining Notes

Weekly report, assignment, high-risk consultation, and storybook controls continue to use their existing business surfaces and are covered by product/voice/journey tests. R08 did not introduce new business functions.
