# E90 Merge Results Prompt

你现在执行 E90：合并 E01-E11 结果。

## Must Read

- all `docs/product-completion/*.md`
- all `docs/product-completion/results/E??-result.json`
- all existing `docs/product-completion/results/E??-result.md`
- `docs/feature-audit/INCOMPLETE_FEATURES.updated.md`
- `docs/feature-implementation/IMPLEMENTATION_STATUS.md`

## Mission

Merge implementation results into product-completion status documents.

## Required Implementation

- Update `docs/product-completion/IMPLEMENTATION_STATUS.md`.
- Update `docs/product-completion/IMPLEMENTATION_LOG.md`.
- Produce a merged summary of completed, partial, blocked, and remaining risks.
- Do not overwrite task result files.
- Do not claim completion for tasks without passing checks.

## Verification

Run:

- `npm run lint`
- `npm run build`
- `npm run feature:smoke`

Use explicit base URL if needed and document it.

## Output

Write merged status and include next action for E99.

