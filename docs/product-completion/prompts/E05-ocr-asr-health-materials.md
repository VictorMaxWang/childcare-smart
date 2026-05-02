# E05 OCR ASR Health Materials Prompt

你现在执行 E05：OCR / ASR provider、健康材料解析真实接入。

## Must Read

- `docs/product-completion/OCR_ASR_PROVIDER_SPEC.md`
- `docs/product-completion/ATTACHMENT_VOICE_IMAGE_SPEC.md`
- `docs/product-completion/SERVER_SCOPE_SPEC.md`
- existing `lib/ai/providers`
- teacher voice and health material routes
- D99 and incomplete feature docs
- E01 result files

## Mission

Make OCR/ASR provider status explicit and safe. Health material parsing must distinguish real provider, provided text, fallback, and mock.

## Required Implementation

- Normalize OCR/ASR provider result fields.
- Add provider health/status surfaces where useful.
- Ensure mock/fallback cannot be presented as real provider success.
- Add server-side child/class scope checks to health material and voice APIs.
- Confirm before converting OCR/ASR output into official records.

## Verification

Run:

- `npm run lint`
- `npm run build`
- provider unit tests
- Playwright: health material parse, provider fallback label, confirm archive, refresh

## Result Files

Write `docs/product-completion/results/E05-result.json` and `.md`.

