# E05 Result

## Status

Done.

## Summary

- Read vivo AIGC docs on 2026-05-02 at `https://aigc.vivo.com.cn/#/document/index`.
- Confirmed vivo supports chat/text generation, general OCR, and ASR.
- Added `lib/providers/vivo/*` and connected OCR/ASR/LLM provider resolvers.
- Secured 21 `/api/ai/*` routes with an E01-based server-side guard using `requireDemoSession` and scope helpers.
- Updated health material parsing to show provider status, extracted text, local text fallback, save via E01 health materials API, and create consultation via E01 consultations API.
- Removed fake success for image OCR and audio ASR when no real provider is configured.

## Vivo Capabilities

- Chat: `POST https://api-ai.vivo.com.cn/v1/chat/completions`, `Authorization: Bearer AppKey`, OpenAI-compatible JSON, SSE supported.
- OCR: `POST http://api-ai.vivo.com.cn/ocr/general_recognition`, form body `image`, `pos`, `businessid`, supports confirmed jpg/png/bmp.
- ASR: WebSocket realtime/long dictation documented; E05 implements HTTP long-audio flow with `/lasr/create`, `/lasr/upload`, `/lasr/run`, `/lasr/progress`, `/lasr/result`.

## Checks

- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run product:ai`: passed, provider status is `missing-env` for chat/OCR/ASR in this local env.
- Targeted Playwright E05: passed.
- `npm run feature:smoke`: timed out after 364s; artifacts show existing D08 communication/director/visual-only failures unrelated to the E05 targeted path.

## Evidence

Screenshots:

- `artifacts/product-completion/E05/e05-01-text-fallback-provider-status.png`
- `artifacts/product-completion/E05/e05-02-saved-refresh.png`
- `artifacts/product-completion/E05/e05-03-consultation-created.png`
- `artifacts/product-completion/E05/e05-04-provider-unavailable-no-fake-success.png`

Browser Use:

- Browser Use was attempted, but the local node_repl runtime reported Node `v22.20.0` while it requires `>= v22.22.0`.
- Playwright was used as the verification fallback.

## Remaining Risk

- Real vivo smoke test still requires live `VIVO_*` env.
- PDF OCR and webm ASR remain unsupported because vivo docs did not confirm them.
- Real-time ASR WebSocket is documented but not wired to the E06 voice ball UI in E05.
