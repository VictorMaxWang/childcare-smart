# OCR And ASR Provider Spec

## Provider Status

All OCR/ASR outputs must expose provider identity and whether the result came from a real provider or an explicit fallback:

- `providerName`
- `capability`: `ocr | asr`
- `configured`
- `supported`
- `isRealProvider`
- `status`: `ready | missing-env | unsupported | provider-unavailable | error`
- `warnings`
- `requiredEnv`

Fallback output may help the user continue with text input, but it must not claim that an image or audio file was truly recognized.

## OCR

Interface:

```ts
interface OcrProvider {
  getStatus(): VivoProviderStatus;
  extract(input: {
    attachmentName?: string;
    fallbackText?: string;
    mimeType?: string;
    imageBase64?: string;
  }): Promise<OcrProviderResult<OcrProviderOutput>>;
}
```

Current E05 provider mapping:

- Real provider: vivo AIGC 通用 OCR, `POST /ocr/general_recognition`.
- Confirmed formats: jpg, png, bmp.
- Required env: `VIVO_APP_KEY`, `VIVO_APP_ID`; optional `VIVO_BASE_URL`, `VIVO_OCR_PATH`.
- Text fallback: allowed for teacher-entered text or text files. Output must be marked `isRealProvider: false`.
- Images/PDF without a real OCR provider: return `provider_unavailable`; do not return fabricated OCR text.
- PDF: vivo docs did not confirm support. PDF remains text fallback/manual input unless later provider support is confirmed.

## ASR

Interface:

```ts
interface AsrProvider {
  getStatus(): VivoProviderStatus;
  transcribe(input: {
    attachmentName?: string;
    transcript?: string;
    fallbackText?: string;
    mimeType?: string;
    durationMs?: number;
    scene?: string;
    audioBytes?: Buffer;
  }): Promise<AsrProviderResult<AsrProviderOutput>>;
}
```

Current E05 provider mapping:

- Real provider: vivo AIGC 长语音转写 HTTP flow, `/lasr/create`, `/lasr/upload`, `/lasr/run`, `/lasr/progress`, `/lasr/result`.
- Confirmed formats: wav, pcm, m4a, mp3, aac, ogg, ogg_opus.
- Limits from docs: audio file under 5 hours and under 500M.
- Required env: `VIVO_APP_KEY`, `VIVO_ASR_PACKAGE`, `VIVO_ASR_CLIENT_VERSION`, `VIVO_ASR_USER_ID`; optional `VIVO_ASR_ENGINE_ID`.
- Browser `SpeechRecognition` and typed transcript are allowed front-end fallbacks for E06 reuse.
- Audio files without a real ASR provider or unsupported formats such as unconfirmed `webm` must return `provider_unavailable`; do not fabricate transcripts.

## UI Rules

- Provider status must be visible in the health material parse result.
- `missing-env` must be presented as “未配置 vivo AIGC / 当前未接入真实 OCR/ASR provider”.
- Text fallback may save a parse result only when the displayed provenance says it is local fallback.
- Provider unavailable must not save fake success.

## E10 Provider Cleanup

- `/api/ai/voice-asr`, `/api/ai/teacher-voice-upload`, and `/api/ai/teacher-voice-understand` must return `503 provider_unavailable` for audio-only input when ASR is missing-env or unavailable.
- Teacher voice routes may return successful local results only when the request includes a typed transcript or explicit fallback text. Those responses must be labeled as fallback/local text, not real ASR.
- Backend ASR fallback must not synthesize a transcript from `attachment_name`. If no transcript or fallback text exists, it returns `source: provider_unavailable` with an empty transcript.
- Backend OCR fallback must not treat file names as recognized OCR text. File names may remain metadata, but they are not extraction evidence.
- Next `/api/ai/*` remains the public browser surface and must continue to use `authorizeAiRoute()` and server-side scope helpers. FastAPI backend agent routes require internal-only exposure or service auth before production.
