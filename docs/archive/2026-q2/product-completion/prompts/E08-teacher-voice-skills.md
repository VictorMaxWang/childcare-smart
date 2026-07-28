# E08 Teacher Voice Skills Prompt

你现在执行 E08：教师端语音助手技能。

## Must Read

- `docs/product-completion/VOICE_ASSISTANT_SPEC.md`
- `docs/product-completion/COMMAND_INTENT_MAP.md`
- `docs/product-completion/OCR_ASR_PROVIDER_SPEC.md`
- E01 and E06 result files
- existing teacher voice implementation

## Mission

Enable teacher voice commands for fast records, parent replies, navigation, health material parsing, and consultations.

## Required Skills

- quick morning check
- quick meal record
- quick growth observation
- reply parent message
- navigate teacher pages
- parse health material
- create consultation

All official record writes, replies, and consultation creation require confirmation and class scope validation.

## Verification

Run:

- `npm run lint`
- `npm run build`
- teacher voice skill tests
- Playwright: teacher text fallback, save confirmed health/meal/growth record, reply parent, create consultation

## Result Files

Write `docs/product-completion/results/E08-result.json` and `.md`.

