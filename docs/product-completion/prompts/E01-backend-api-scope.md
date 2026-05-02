# E01 Backend API Scope Prompt

你现在执行 E01：API 层、服务端 scope 校验、统一数据服务。

## Must Read

- `docs/product-completion/README.md`
- `docs/product-completion/COMPLETION_PLAN.md`
- `docs/product-completion/BACKEND_API_SPEC.md`
- `docs/product-completion/SERVER_SCOPE_SPEC.md`
- `docs/product-completion/TASK_MATRIX.md`
- `docs/feature-implementation/FINAL_FUNCTIONAL_COMPLETION_REPORT.md`
- `docs/feature-audit/INCOMPLETE_FEATURES.updated.md`
- `docs/feature-implementation/DATA_MODEL_SPEC.md`
- `docs/feature-implementation/DEMO_PERSISTENCE_SPEC.md`
- `docs/feature-implementation/API_OR_LOCAL_STORE_DECISIONS.md`
- `docs/refactor/ROUTE_PAGE_MAP.md`
- `package.json`

## Mission

Implement the minimum production-shaped API/service foundation:

- `requireSession`
- `requireAdmin`
- `requireChildAccess`
- `requireTeacherClassAccess`
- `requireParentChildAccess`
- unified snapshot/service helpers for fine-grained read-modify-write
- consistent API error envelope
- tests for role/child/class/institution scope

Do not treat `/api/state` full snapshot PUT as production authorization. Keep it for compatibility only.

## Required Implementation

- Add server-side scope utilities under `lib/server` or the nearest existing server helper location.
- Add or prepare route/service boundaries for the minimum API surface in `BACKEND_API_SPEC.md`.
- Add tests proving cross-role and cross-child attempts return 403.
- Do not trust client-supplied role, institution, class, or childIds.

## Verification

Run:

- `npm run lint`
- `npm run build`
- targeted API/scope tests
- Browser Use for a key permission path, or Playwright fallback if Browser Use is unavailable

## Result Files

Write:

- `docs/product-completion/results/E01-result.json`
- `docs/product-completion/results/E01-result.md`

The JSON must include `status`, `changedFiles`, `checks`, `remainingRisks`, and `nextTasks`.

