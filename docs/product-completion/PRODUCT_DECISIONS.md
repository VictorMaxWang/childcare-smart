## 2026-05-02 E03 Decisions

- Director aggregates must show real empty/zero states from `AppDataService`; fixed dashboard mock data must not override scoped API results.
- Weekly report save/archive/export/share is based only on saved `/api/weekly-reports` records, not client-forged snapshots.
- Share MVP is local authorized text/share metadata. Public anonymous links and PDF export remain outside E03.
- Export MVP uses JSON, Markdown, HTML, print HTML, and copied share text.
- Removing disabled export/share buttons is intentional; old visual-only smoke assertions that require disabled controls should move to E10 cleanup coverage.

## 2026-05-02 E04 Decisions

- Feedback status is normalized to `open | in-progress | resolved | archived`; teachers and directors may update status, parents may view only.
- Feedback detail aggregates the child, parent, teacher, feedback body, child-scoped messages/replies, attachments, and audit-derived status history.
- Attachment storage remains demo `metadata_only` with `localPreviewUrl` for refresh-safe preview/playback. This is not cloud upload and must not be presented as cloud success.
- Attachment size limit is 5MB per file and 3 attachments per related message/feedback/media item.
- `/api/attachments/[attachmentId]/content` is the only preview/download content route and must call scoped attachment lookup before returning bytes.
- Storybook media support in E04 is limited to `relatedType: "storybook"` metadata and scope validation; share/export packaging remains outside this task.
- Existing D08 visual-only tests that require disabled feedback-detail controls are obsolete once E04 opens the real detail flow.

## 2026-05-02 E05 Decisions

- vivo AIGC is the only real provider basis for E05. Endpoints, auth, params, formats, and limitations must follow the official vivo docs read on 2026-05-02.
- Missing `VIVO_*` env must produce `missing-env` or `provider_unavailable` status, not fake OCR/ASR/AI success.
- Text input fallback is allowed for health material parsing and ASR transcripts, but image/audio recognition cannot be fabricated.
- OCR is limited to vivo-confirmed jpg/png/bmp until PDF support is confirmed.
- ASR HTTP file transcription is limited to vivo-confirmed wav/pcm/m4a/mp3/aac/ogg/ogg_opus; webm remains unsupported unless confirmed or converted later.
- Real provider keys and authorized runtime metadata must stay server-side and must never be written to frontend code, docs, screenshots, logs, or result files.

## 2026-05-02 E06 Decisions

- E06 ships the shared command framework and basic commands only. Director/teacher/parent role-specific skill depth remains for E07/E08/E09.
- Local rule parsing is the default and must remain available without external LLM. vivo chat can enhance intent parsing later only through the E05 provider layer.
- `assign_task` is intentionally unsupported for execution in E06 because no stable E01 assignment API is present. The assistant may preview it, but must not show success.
- `SpeechRecognition` is the preferred live voice path. `MediaRecorder` + `/api/ai/voice-asr` is available, but the local vivo ASR status is `missing-env`, so the UI must clearly show text/local-rule fallback.
- `/api/voice-assistant/*` is an API-owned auth surface and must be proxy-bypassed like E01/E05 APIs so unauthenticated calls return JSON 401 instead of a login page.
- Weekly-report AI payload role must be authorized before backend forwarding; parent-to-admin or other role override attempts are rejected.

# Product Decisions

## Safe Defaults

- 删除即归档，不提供硬删除。
- 周报分享为站内授权分享，不开放公网匿名链接。
- 导出先支持 JSON、Markdown、HTML、复制文本。
- 附件在没有真实存储前保存元数据和预览，不显示云端成功。
- OCR/ASR fallback 只生成草稿，确认后才能写正式记录。
- 教师管理 MVP 只做列表、详情、班级绑定、启用/停用。
- 绘本分享导出 MVP 做站内查看、文本/HTML 导出，不做音频/图片包下载。
- E02 教师管理入口仅园长可访问；教师自助资料维护、手机号、邀请账号和登录启停不进入 E02。
- E02 儿童档案资料新增、编辑、归档、恢复由园长执行；教师和家长按 scope 只读档案，教师的日常写入先限定为本班考勤/记录类接口。

## Disabled Policy

不能完成真实功能的按钮必须：

- `disabled` 或 `aria-disabled`
- 有可见说明：`暂未开放`、`需要接入存储服务`、`需要真实 provider`
- 不触发成功 toast
- 不写入正式数据

## 2026-05-02 E10 Decisions

- Weekly report export/share is an MVP feature when a report exists in `/api/weekly-reports`. Supported MVP formats are JSON, Markdown, HTML/print HTML, and local share text. Public anonymous links, PDF generation, and external notification delivery are deferred.
- Feedback detail is an MVP feature for parent, teacher, and director roles through scoped feedback/detail APIs. Disabled "view detail" placeholders are obsolete.
- Teacher management MVP means director-managed roster CRUD, class binding, business archive/restore, and detail view. It does not mean login-account invitation, phone verification, password reset, or auth lifecycle management.
- Delete actions are implemented as soft archive/restore for children, teachers, records, and weekly reports. Hard delete remains outside MVP.
- Attachments, images, and voice are metadata-only MVP with local preview/playback and scoped content routes. The product must not call this cloud upload until object storage is connected.
- Teacher voice upload/understand may use typed transcript or explicit fallback text. Audio-only input without a configured ASR provider must return `provider_unavailable` and must not generate a mock transcript from a file name.
- Health material OCR may use request-supplied preview text or notes as local fallback. Image/PDF input without a configured OCR provider must return `provider_unavailable` and must not claim real OCR success.
- Storybook share/export MVP is local export/download plus local share/copy text. Public links, PDF, media package download, and social-share integrations are deferred.
- Director dispatch MVP is a single-assignment closure loop backed by E01 assignments/tasks/reminders. Batch dispatch and help/tutorial flows remain explicitly disabled until product confirms them.
- Assignment product vocabulary is `pending | in-progress | resolved`. The current E01 task layer still accepts legacy aliases (`in_progress`, `completed`) for compatibility and maps `resolved` to completed task storage until a durable schema migration is introduced.
- Voice assistant commands must execute only through the E06 command bus. Server execute paths must recompute confirmation requirements from intent and sanitize navigation paths; client-supplied `requiredConfirmation:false` is not trusted.
- If child matching is missing or ambiguous, the command must return `needs_params` or `needs_confirmation` with clarification. It must not write a best-guess child record.
- Global notification/message/search entries are non-MVP. They remain visibly disabled with reason text instead of clickable "success" or "coming soon" toasts.
