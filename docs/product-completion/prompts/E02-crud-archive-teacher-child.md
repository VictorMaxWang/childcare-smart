# E02 CRUD Archive Teacher Child Prompt

你现在执行 E02：真实 CRUD、归档删除、教师管理、儿童档案。

## Must Read

- all `docs/product-completion/*.md`
- `docs/feature-audit/INCOMPLETE_FEATURES.updated.md`
- `docs/feature-implementation/DATA_MODEL_SPEC.md`
- `docs/feature-implementation/DEMO_PERSISTENCE_SPEC.md`
- `docs/refactor/ROUTE_PAGE_MAP.md`
- E01 result files

## Mission

Implement real create/read/update/archive/restore flows for:

- child profiles
- teachers
- attendance
- health records
- meal records
- growth records

Deletion means archive. Do not implement hard delete.

## Required Implementation

- Add child and teacher API routes or connect existing UI to the E01 service layer.
- Add `archivedAt`, `archivedBy`, `archiveReason`, restore support where needed.
- Make forms submit to real service/API actions; no success toast unless data changed and refresh persists.
- Ensure teacher can only manage own class records; admin can manage same-institution records; parent read access stays child-scoped.

## Verification

Run:

- `npm run lint`
- `npm run build`
- CRUD archive tests
- Playwright path: create, edit, archive, restore, refresh, cross-role visibility

## Result Files

Write `docs/product-completion/results/E02-result.json` and `.md`.

