# E99 Final Acceptance Prompt

你现在执行 E99：最终验收。

## Must Read

- all `docs/product-completion/*.md`
- all E01-E11 result files
- E90 merged status
- D99 final completion report

## Mission

Run final acceptance for the whole product-completion stage.

## Required Verification

- Validate no enabled action is ui-only or fake-success.
- Validate CRUD archive restore persists after refresh.
- Validate server-side scope rejects unauthorized role/child/class access.
- Validate weekly reports generate, archive, export, share, and view history.
- Validate OCR/ASR provider state is visible.
- Validate voice orb commands execute real commands with confirmation.
- Validate director, teacher, and parent real-user paths.

## Required Commands

Run:

- `npm run lint`
- `npm run build`
- `npm run feature:smoke`
- `npm run bugbash:smoke`

Use Browser Use where available; use Playwright fallback if Browser Use runtime is unavailable and document the fallback.

## Final Report

Write a final acceptance report under `docs/product-completion/` with:

- completed scope
- failed or blocked scope
- check results
- remaining production risks
- go/no-go recommendation

