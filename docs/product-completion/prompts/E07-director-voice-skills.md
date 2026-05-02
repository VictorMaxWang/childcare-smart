# E07 Director Voice Skills Prompt

你现在执行 E07：园长端语音助手技能。

## Must Read

- `docs/product-completion/VOICE_ASSISTANT_SPEC.md`
- `docs/product-completion/COMMAND_INTENT_MAP.md`
- `docs/product-completion/WEEKLY_REPORT_SPEC.md`
- `docs/product-completion/AGGREGATION_TREND_SPEC.md`
- E01 and E06 result files

## Mission

Enable director voice commands for weekly reports, risk queries, dispatch closure, navigation, feedback handling, and metrics.

## Required Skills

- generate/view/archive/export/share weekly report
- query risks and high priority children
- dispatch task to teacher or parent
- open feedback detail
- process feedback
- view metrics
- navigate admin pages

All dispatch, status update, archive, export, and share actions require confirmation.

## Verification

Run:

- `npm run lint`
- `npm run build`
- director voice skill tests
- Playwright: `/admin` voice orb, generate weekly report, dispatch confirmation, feedback detail

## Result Files

Write `docs/product-completion/results/E07-result.json` and `.md`.

