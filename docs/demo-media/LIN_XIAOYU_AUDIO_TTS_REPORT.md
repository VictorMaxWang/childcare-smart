# LIN_XIAOYU_AUDIO_TTS_REPORT

Task: STORYBOOK-LOCK-01

Status: partial

## vivo Reference

Checked vivo AIGC documentation entry points:

- Capability/document index: https://aigc.vivo.com.cn/#/document/index?id=1746
- Audio generation/TTS reference: https://aigc.vivo.com.cn/#/document/index?id=1735

The docs are served as a JavaScript application. The implementation follows the audio generation WebSocket approach described in the plan and keeps all vivo credentials server-side.

## Provider

Added a server-side vivo TTS provider:

- `lib/providers/vivo/vivo-tts-provider.ts`
- exports through `lib/providers/vivo/index.ts`
- status/env support in `lib/providers/vivo/vivo-provider-status.ts`

The provider does not expose secrets to the browser and does not use `NEXT_PUBLIC_VIVO_*`.

## Runtime Endpoint

Added authenticated runtime route:

- `/api/storybooks/lin-xiaoyu/tts`

Behavior:

- Requires a valid session.
- Resolves child/page server-side.
- Allows only fixed Lin Xiaoyu page text for `c-1`.
- Enforces existing child scope.
- Limits request size and text length.
- Returns static audio first if present.
- Falls back to vivo runtime TTS only when static audio is missing or bypassed.
- Returns classified JSON errors without leaking secrets.

Error kinds:

- `missing-env`
- `provider-unavailable`
- `auth/signature`
- `endpoint`
- `network`
- `unsupported-format`
- `unknown`

## Static Audio Generation

Added local generation script:

- `scripts/generate-lin-xiaoyu-storybook-audio.mjs`
- npm script: `storybook:generate-xiaoyu-audio`

Attempted generation result:

- status: `missing-env`
- missing runtime metadata:
  - `STORYBOOK_TTS_MODEL`
  - `STORYBOOK_TTS_PRODUCT`
  - `STORYBOOK_TTS_PACKAGE`
  - `STORYBOOK_TTS_CLIENT_VERSION`
  - `STORYBOOK_TTS_SYSTEM_VERSION`
  - `STORYBOOK_TTS_SDK_VERSION`
  - `STORYBOOK_TTS_ANDROID_VERSION`

No fake success was recorded. No static audio files were generated in this run.

## Fallback

The frontend prioritizes static `audioSrc`. If static audio is absent, it calls the authenticated TTS endpoint. If vivo is unavailable or env is incomplete, the page keeps rendering text/images and reports reading as unavailable or subtitle-only. Runtime does not attempt to write into `public/`.

