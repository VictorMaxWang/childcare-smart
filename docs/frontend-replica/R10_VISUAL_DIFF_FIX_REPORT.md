# R10 Visual Diff Fix Report

## Summary

- PAGE_SPEC comparisons: 247
- Current captures: 247
- Skipped: 0
- Unique capture states: 55
- Average visual closeness: 77.50
- P0 average / worst: 79.90 / 28.58
- Target goal status: 247/skipped=0 met; average 82+ and P0 worst 50+ not met.

## Main Differences

- State mapping gaps: several `/admin` design files are visually child archive/delete confirmation screens; R10 now records the effective route and capture state instead of mixing them with normal dashboard diffs.
- Diet route gaps: meal record designs were previously captured from `/children`; R10 maps the relevant targets to `/diet` and separates dashboard from batch confirmation dialog.
- Dialog gaps: shared dialog overlays were too dark and blurred; confirmation cards were too high/dense compared with target images.
- Login gaps: registration targets show a standard account signup flow; the existing UI was institution-first and missing phone/code/kindergarten fields.
- Mobile gaps: 390px drawer targets are narrow, compact side panels; the current drawer was too wide and generic.

## Fixed Differences

- Added `visualEffectiveRoute`, `captureState`, and `stateCorrectionReason` to the visual capture manifest.
- Added state-corrected vs UI-difference grouping to `VISUAL_DIFF_REPORT.md` and JSON output.
- Corrected children archive/delete visual targets to `/children + children-archive-dialog`.
- Corrected diet visual targets to `/diet`, including `diet-dashboard` and `diet-batch-confirm-dialog`.
- Corrected teacher drawer target capture to the teacher dashboard shell where the design shows the dashboard behind the drawer.
- Made `MobileNav` compact at mobile width with a narrow panel, lighter overlay, smaller text, compressed footer, and role-aware active states.
- Updated login registration UI to include phone, verification code demo control, password confirmation, identity, and kindergarten fields while keeping the existing register API.
- Tuned shared confirm dialogs and diet batch confirmation dialogs for lighter overlays, lower desktop placement, tighter cards, and compact buttons.
- Reduced teacher voice FAB mobile footprint so it interferes less with bottom nav and drawer targets.

## Remaining Differences

- The lowest child archive/delete targets still score poorly because target images show a different custom child-management shell and irreversible delete copy, while the product keeps archive/restore semantics and real permission boundaries.
- Diet dashboard/batch targets remain structurally different from the target designs; the current product retains real meal records, charts, and batch apply behavior instead of a static target-only table.
- Login desktop targets still vary widely across the 18 login design files; R10 improved standard registration state but did not redesign every login hero variant.
- Mobile parent/teacher drawers are closer in width but still lack the target-specific child/profile/promo content composition.
- The 82+ average and P0 worst 50+ goals remain open for a future broader page-level replica pass.

## Visual Results

- Visual report: `docs/frontend-replica/VISUAL_DIFF_REPORT.md`
- Current screenshots: `artifacts/frontend-replica/current/`
- Target screenshots: `artifacts/frontend-replica/targets/`
- Diff screenshots: `artifacts/frontend-replica/diff/`
- Worst remaining IDs: `SCFR-022`, `SCFR-089`, `SCFR-136`, `SCFR-093`, `SCFR-109`, `SCFR-035`, `SCFR-153`, `SCFR-129`, `SCFR-193`, `SCFR-100`

## Validation

- `npx playwright test tests/frontend-replica/visual-capture.spec.ts --config=playwright.product.config.ts --project=chromium --reporter=line`: pass, 247 captured
- `node scripts/frontend-replica-visual-diff.mjs`: pass, compared 247, skipped 0, average 77.50
- `npm run lint`: pass
- `npm run build`: pass
- `npm run product:ai`: pass
- `npm run product:voice`: pass
- `npm run product:journey`: pass
- `npm run feature:smoke`: pass
- `npm run bugbash:smoke`: pass
- `npm run demo-media:test`: pass after restarting the local dev server to reset demo seed state polluted by prior smoke tests
- `npm run growth-media:test`: pass
- `npx tsc --noEmit`: pass

## Git

- Commit: pending at report write time
- Push: pending at report write time
