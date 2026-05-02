# E11 Tests Browser Regression Prompt

你现在执行 E11：自动化测试 + Browser Use 回归。

## Must Read

- all `docs/product-completion/*.md`
- all E01-E10 result files
- existing `tests/feature-completion`
- existing `tests/bug-bash`
- Playwright configs
- `package.json`

## Mission

Add and run automated coverage for completed product-completion scope.

## Required Coverage

- API route tests
- server scope permission tests
- CRUD archive tests
- weekly report archive/export/share tests
- OCR/ASR provider fallback tests
- voice orb command planner/executor tests
- Browser Use or Playwright real-user paths for director, teacher, parent

## Required Commands

Run:

- `npm run lint`
- `npm run build`
- `npm run feature:smoke`
- `npm run bugbash:smoke`

If default port 3330 is blocked by `.next/dev/lock`, use explicit `FEATURE_BASE_URL=http://127.0.0.1:3000` and `BUGBASH_BASE_URL=http://127.0.0.1:3000`, and document it.

## Result Files

Write `docs/product-completion/results/E11-result.json` and `.md`.

