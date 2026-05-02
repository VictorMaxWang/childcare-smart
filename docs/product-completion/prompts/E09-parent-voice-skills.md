# E09 Parent Voice Skills Prompt

你现在执行 E09：家长端语音助手技能。

## Must Read

- `docs/product-completion/VOICE_ASSISTANT_SPEC.md`
- `docs/product-completion/COMMAND_INTENT_MAP.md`
- `docs/product-completion/WEEKLY_REPORT_SPEC.md`
- E01 and E06 result files
- parent routes and components

## Mission

Enable parent voice commands for teacher messages, child status queries, navigation, reminders, feedback, and storybook export/share.

## Required Skills

- leave teacher message
- query today's child status
- open growth archive, storybook, health, diet, reminders
- mark reminder as read
- submit feedback
- generate/export/share storybook

Parent commands must be scoped to authorized childIds only. Messages, feedback, reminder updates, and storybook share/export require confirmation.

## Verification

Run:

- `npm run lint`
- `npm run build`
- parent voice skill tests
- Playwright: parent text fallback, send confirmed message, mark reminder, storybook export, unauthorized child denial

## Result Files

Write `docs/product-completion/results/E09-result.json` and `.md`.

