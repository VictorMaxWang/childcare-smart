# E04 Feedback Attachments Media Prompt

你现在执行 E04：反馈详情、聊天附件、图片、语音消息。

## Must Read

- `docs/product-completion/ATTACHMENT_VOICE_IMAGE_SPEC.md`
- `docs/product-completion/CRUD_ARCHIVE_SPEC.md`
- `docs/product-completion/BACKEND_API_SPEC.md`
- D99 and incomplete feature docs
- E01 result files

## Mission

Turn feedback details and media-related entries into real product behavior or clearly unavailable states.

## Required Implementation

- Implement feedback detail route/API with scoped read and status update.
- Implement attachment metadata save/read for feedback, message, health material, and storybook owners.
- Add file selection and preview where in scope.
- If binary storage is not implemented, store metadata only and show `metadata_only`.
- Voice/image/message send actions must confirm before write.
- No button may show success unless metadata or message state persists after refresh.

## Verification

Run:

- `npm run lint`
- `npm run build`
- feedback detail and attachment tests
- Browser/Playwright: open feedback detail, attach metadata, refresh, verify scope denial

## Result Files

Write `docs/product-completion/results/E04-result.json` and `.md`.

