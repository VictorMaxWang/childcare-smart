# File Ownership

## Shared Files

并行任务不要直接同时修改：

- `docs/product-completion/IMPLEMENTATION_STATUS.md`
- `docs/product-completion/IMPLEMENTATION_LOG.md`
- `docs/feature-audit/INCOMPLETE_FEATURES.updated.json`
- `docs/feature-implementation/IMPLEMENTATION_STATUS.md`

由 E90 统一合并。

## Task Ownership

| Task | Primary Write Scope |
| --- | --- |
| E01 | `app/api`, `lib/server`, `lib/persistence`, `lib/demo-data`, service tests |
| E02 | `app/api/children*`, `app/api/teachers*`, child/teacher UI, CRUD tests |
| E03 | `app/api/analytics*`, `app/api/weekly-reports*`, weekly report UI/tests |
| E04 | feedback/message/attachment API and UI, media metadata tests |
| E05 | `lib/ai/providers`, OCR/ASR routes, health material parsing tests |
| E06 | shared voice assistant libraries/components, command planner tests |
| E07 | director voice skills and admin pages |
| E08 | teacher voice skills and teacher pages |
| E09 | parent voice skills and parent pages |
| E10 | UI cleanup and product-state labels |
| E11 | `tests/product-completion` or existing Playwright suites |

## Result Ownership

每个任务只写自己的：

- `docs/product-completion/results/E??-result.json`
- `docs/product-completion/results/E??-result.md`

