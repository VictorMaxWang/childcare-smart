# E10 Cleanup UI Only Product Spec Prompt

你现在执行 E10：清理 ui-only / mock-only / fake-success 和产品规格落地。

## Must Read

- all `docs/product-completion/*.md`
- all E01-E09 result files
- `docs/feature-audit/INCOMPLETE_FEATURES.updated.md`
- `docs/feature-implementation/FINAL_FUNCTIONAL_COMPLETION_REPORT.md`

## Mission

Audit every remaining action button and product boundary. Enabled controls must do real work; unavailable controls must be clearly disabled or product-pending.

## Required Implementation

- Remove or fix fake success toasts.
- Ensure export/share/feedback detail actions are either real or disabled with explanation.
- Label provider fallback and local-only boundaries.
- Verify mock/local-only data is not written as production success.
- Update docs/product-completion status and E10 result only; do not merge shared status docs outside E10 result.

## Verification

Run:

- `npm run lint`
- `npm run build`
- visual-only safety tests
- Playwright sweep of director, teacher, parent key pages

## Result Files

Write `docs/product-completion/results/E10-result.json` and `.md`.

