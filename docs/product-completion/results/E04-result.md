# E04 Result: Feedback Details And Attachment Media Loop

Status: done

## Completed

- Opened real feedback detail flows for parent, teacher, and director.
- Added feedback detail aggregation through E01 `AppDataService`: child, parent, teacher, feedback body, messages, replies, attachments, and audit/status history.
- Added staff status updates for `open | in-progress | resolved | archived`.
- Reused E01 `lib/api/client.ts` via `lib/api/communication.ts`.
- Reused E01 scope helpers in `lib/server/scope.ts` through `AppDataService`.
- Added attachment metadata kind, preview URL, download URL, audio duration, and scoped content route.
- Added UI attachment picker and preview for image/file/audio, with MediaRecorder recording and audio-file fallback.
- Connected parent message attachments, parent feedback attachments, and teacher reply attachments to `/api/attachments`.
- Added server-side 5MB and 3-per-related-object attachment guards.
- Added storybook attachment `relatedType` foundation with child scope validation.
- Removed the disabled director feedback detail action and routed it to a real detail flow.

## Evidence

- Targeted Playwright: `npx playwright test tests/feature-completion/e04-feedback-attachments.spec.ts --config=playwright.feature.config.ts --reporter=line` passed 1/1.
- Screenshots: `artifacts/product-completion/E04/`
  - `parent-feedback-detail.png`
  - `parent-message-attachment-after-refresh.png`
  - `teacher-feedback-detail.png`
  - `teacher-reply-audio.png`
  - `parent-sees-teacher-audio.png`
  - `admin-feedback-status-resolved.png`

## Checks

- `npm run lint`: passed.
- `npm run build`: passed.
- `FEATURE_BASE_URL=http://127.0.0.1:3000 FEATURE_SKIP_WEBSERVER=1 npm run feature:smoke`: E04 test passed; full suite failed 5 D08/non-E04 cases and left 1 test unrun.

## Notes

- Storage remains demo `metadata_only` with data-URL preview/playback for refresh-safe local evidence. This is not cloud object storage.
- ASR/OCR transcription and voice assistant behavior remain outside E04.
- Full storybook media export/share packaging remains outside E04; E04 only adds metadata/scope foundations.
