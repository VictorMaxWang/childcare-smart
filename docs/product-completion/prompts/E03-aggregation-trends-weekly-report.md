# E03 Aggregation Trends Weekly Report Prompt

你现在执行 E03：真实聚合、趋势查询、周报归档、导出分享。

## Must Read

- `docs/product-completion/AGGREGATION_TREND_SPEC.md`
- `docs/product-completion/WEEKLY_REPORT_SPEC.md`
- `docs/product-completion/BACKEND_API_SPEC.md`
- `docs/product-completion/SERVER_SCOPE_SPEC.md`
- D99 and incomplete feature docs
- E01 result files

## Mission

Replace static/demo-only director metrics and incomplete report actions with real derived data and persisted report records.

## Required Implementation

- Implement admin summary and quality metrics from current data service.
- Implement child trend query with local fallback when brain/FastAPI is unavailable.
- Implement weekly report records: create/list/detail/archive/restore.
- Implement export as JSON, Markdown, HTML, and copyable share text.
- Implement station-internal share with login and scope checks.
- Keep PDF/public sharing disabled unless fully implemented.

## Verification

Run:

- `npm run lint`
- `npm run build`
- weekly report API tests
- Playwright: generate report, save, refresh, archive, export, share permission

## Result Files

Write `docs/product-completion/results/E03-result.json` and `.md`.

