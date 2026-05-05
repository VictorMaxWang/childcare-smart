# Vivo AIGC Provider Notes

## Source

- 文档 URL: https://aigc.vivo.com.cn/#/document/index
- 读取日期: 2026-05-02
- SPA 正文来源: vivo 官方 `/vstack/webapi/service/doc/tree` 与 `/vstack/webapi/service/doc/info/v1` 文档接口。

## Confirmed Capabilities

### Text Generation / Chat

- Capability: supported.
- Endpoint: `POST https://api-ai.vivo.com.cn/v1/chat/completions`
- Auth: HTTP header `Authorization: Bearer <AppKey>`.
- Request: OpenAI-compatible JSON with `request_id`/`requestId`, `model`, `messages`, `stream`, `temperature`, `max_tokens` and related generation options.
- Response: OpenAI-like JSON, `choices[].message.content`, `model`, `usage`, optional reasoning fields.
- Streaming: supported through SSE when `stream: true`.
- File/image support: image understanding is documented through `image_url` message content.
- Required env: `VIVO_APP_KEY`, optional `VIVO_BASE_URL`, `VIVO_LLM_MODEL`.
- Current mapping: high-risk consultation narrative and future assistant text generation use `lib/providers/vivo/vivo-chat-provider.ts`; missing env falls back to local rules with visible status.

### OCR

- Capability: supported.
- Endpoint: `POST http://api-ai.vivo.com.cn/ocr/general_recognition`
- Auth: HTTP header `Authorization: Bearer <AppKey>`.
- Method/content type: `application/x-www-form-urlencoded`.
- Query: `requestId`.
- Request body: `image` base64, `pos`, `businessid="aigc"+AppId`, optional `sessid`.
- Response: `error_code`, `error_msg`, `result.words` or `result.OCR`, `version`, `support`.
- Error shape: non-zero `error_code` indicates provider failure. Docs mention image error and general failure codes.
- Required env: `VIVO_APP_KEY`, `VIVO_APP_ID`; optional `VIVO_BASE_URL`, `VIVO_OCR_PATH`.
- Streaming: not documented.
- File upload: direct image base64 in form body.
- Limitations: docs confirm jpg/png/bmp only; PDF support is not confirmed.
- Current mapping: teacher health material parsing uses vivo OCR for supported images only when env is complete. Text material uses explicit local text fallback. Image/PDF without real OCR returns `provider_unavailable`.

### ASR

- Capability: supported.
- Short/long dictation endpoint: `ws://api-ai.vivo.com.cn/asr/v2`.
- File transcription endpoints: `POST /lasr/create`, `POST /lasr/upload`, `POST /lasr/run`, `POST /lasr/progress`, `POST /lasr/result`.
- Auth: HTTP/WebSocket header `Authorization: Bearer <AppKey>`.
- Common params: `client_version`, `package`, `user_id`, `system_time`, `engineid`, `requestId`.
- Request shape: create task with audio type/session/slice count, upload multipart slices, run task, poll progress, fetch result.
- Response shape: file ASR returns `audio_id`, `task_id`, `progress`, and final `data.result[].onebest/bg/ed/speaker`.
- Error shape: `code`/`desc` style body; docs list ASR error code groups including auth/signature and limit failures.
- Required env: `VIVO_APP_KEY`, `VIVO_ASR_PACKAGE`, `VIVO_ASR_CLIENT_VERSION`, `VIVO_ASR_USER_ID`; optional `VIVO_ASR_ENGINE_ID`.
- Streaming: WebSocket ASR is documented, but E05 implements HTTP long-audio file transcription first.
- File upload: multipart 5M slices.
- Limitations: file transcription supports audio under 5 hours and under 500M; confirmed formats are wav/pcm/m4a/mp3/aac/ogg/ogg_opus. `webm` was not confirmed.
- Current mapping: `teacher-voice-upload` can pass audio bytes to the provider; unsupported/missing provider returns `provider_unavailable`. E06 can reuse the same ASR interface and add browser SpeechRecognition UI fallback.

## Project Mapping

- Health material parsing: `/api/ai/health-file-bridge` enriches request files through the OCR provider, then runs the local conservative health parser. Real OCR provenance is marked `source: vivo-ocr-provider`; text fallback is marked `source: local-text-fallback`.
- Voice assistant ASR: `/api/ai/teacher-voice-upload` uses `resolveAsrProvider()`. Without a real provider, only typed transcript fallback is accepted.
- AI assistant text generation: high-risk consultation LLM resolver now prefers vivo chat provider and falls back to local rules when env is missing or provider output is unusable.
- Command parsing: E05 exposes the shared provider interface; voice-ball command routing remains E06/E07+ work.

## Required Environment Variables

- `VIVO_APP_KEY`
- `VIVO_APP_ID`
- `VIVO_BASE_URL`
- `VIVO_LLM_MODEL`
- `VIVO_OCR_PATH`
- `VIVO_ASR_PACKAGE`
- `VIVO_ASR_CLIENT_VERSION`
- `VIVO_ASR_USER_ID`
- `VIVO_ASR_ENGINE_ID`

Tracked files contain placeholders only. Do not commit real keys, secrets, tokens, authorized package metadata, or account identifiers.

## Not Connected / Open Reasons

- Real provider smoke was not executed unless the deployment has complete vivo env.
- OCR PDF support is not documented, so PDF uses text/manual fallback only.
- ASR `webm` support is not documented, so browser-recorded webm returns `provider_unavailable` unless converted or confirmed later.
- Real-time WebSocket ASR is documented but not wired into UI in E05; E06 can build on the provider status/interface.
- Rate limits, QPS and billing details were not found in the read docs and require product/provider confirmation.
