# D01 Result

Status: complete

## Summary

- Implemented `lib/demo-data` as the shared D01 demo data API for D02-D06.
- Demo accounts now use shared institution localStorage namespace: `demo:v5-d01-shared-demo:institution:{institutionId}`.
- `AppStateSnapshot` now includes `demoPersistenceSchemaVersion: "d01-v1"` and D01 buckets: `messages`, `conversations`, `healthMaterials`, `nutritionMenus`, `storybooks`.
- Existing `useApp()` method names are preserved. Demo scoped writes are merged back into the shared institution snapshot so parent/teacher/director can read the same business data through their own scoped views.
- Normal accounts still use `/api/state`; `persistAppSnapshotNow` now also returns `syncStatus`.

## Capabilities

- Messages: list, send, reply, mark read.
- Daily records: create/update morning-check, diet and growth records.
- Health materials: create, parse and save parse result.
- Consultations: list, create, add note and update status.
- Reminders: list and mark read.
- Nutrition menus: list by child/class/date range.
- Storybooks: list and generate from growth records.
- Derived data: director dashboard metrics, teacher workbench data, parent home data.

## Checks

- `node --import ./scripts/register-test-path-loader.mjs --test ./lib/demo-data/*.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `BUGBASH_BASE_URL=http://127.0.0.1:3000 npx playwright test tests/bug-bash/d01-regression.spec.ts --config=playwright.bugbash.config.ts --project=chromium --reporter=line`: passed.
- `BUGBASH_BASE_URL=http://127.0.0.1:3000 npm run bugbash:smoke`: passed.

## Notes

- Did not modify `docs/feature-audit/INCOMPLETE_FEATURES.json`.
- Did not modify `docs/feature-implementation/IMPLEMENTATION_STATUS.md`.
- D02/D03/D04/D05/D06 can now run in parallel against `lib/demo-data`.
