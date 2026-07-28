# E02 Result

## Status

Done.

## Completed

- `/children` now uses the E01 API client for listing, searching, creating, editing, archiving, restoring and attendance updates.
- Child profile delete semantics are soft archive by default. Restored children reappear in the default active list.
- `/admin/teachers` was added as a director-only MVP for teacher list, detail, create, edit, class assignment, archive and restore.
- Teacher management APIs are director-only and use the E01 uniform `forbidden_scope` response for parent/teacher access.
- Child scope continues to use `lib/server/scope.ts`; parents can access children bound by `parentUserId`, teachers see scoped class children, and directors manage institution children.
- Child/teacher PATCH paths now strip immutable and archive audit fields so clients cannot bypass the archive endpoint.
- E02 API and UI Playwright coverage was added.

## Findings Fixed

- `C12-003`
- `C12-004`
- `C15-012`
- `C20-007`
- `C22-005`

## Evidence

- `artifacts/product-completion/E02/api-crud-archive-restore-permission.json`
- `artifacts/product-completion/E02/01-admin-child-created-edited.png`
- `artifacts/product-completion/E02/02-admin-child-archived.png`
- `artifacts/product-completion/E02/03-admin-child-restored.png`
- `artifacts/product-completion/E02/04-admin-teacher-created-edited.png`
- `artifacts/product-completion/E02/05-admin-teacher-archived.png`
- `artifacts/product-completion/E02/06-admin-teacher-restored.png`
- `artifacts/product-completion/E02/07-teacher-management-forbidden.png`

## Checks

- `npm run lint`: passed with 0 errors and 2 unrelated warnings.
- `npm run build`: passed.
- Targeted Node service/scope tests: 15/15 passed.
- E02 Playwright/API test: 4/4 passed.
- `FEATURE_BASE_URL=http://127.0.0.1:3330 FEATURE_SKIP_WEBSERVER=1 npm run feature:smoke`: 17/17 passed.

## Notes

- A temporary `next start` server was launched at `http://127.0.0.1:3330` because `.next/dev/lock` existed and the feature Playwright config would otherwise skip webServer startup. The process was stopped after verification.
- `C21-007` remains a production data-model risk: class/teacher/parent/child relationships still depend on the E01 demo/process-local repository.
- Standalone `npm run typecheck` still reports unrelated current AI/OCR/ASR provider type errors in dirty files outside E02 scope; the required E02 checks passed.
