# LIN_XIAOYU_AUDIO_TTS_REPORT

Latest update: STORYBOOK-LOCK-02

Status: done

## LOCK-02 Update

- The Lin Xiaoyu fixed storybook now points page audio to the authenticated server endpoint `/api/storybooks/lin-xiaoyu/tts?childId=c-1&page=N`.
- The endpoint checks static audio first and returns `audio/mpeg` when `public/demo-media/storybooks/lin-xiaoyu/audio/page-XX.mp3` exists.
- Runtime vivo TTS is used only when static audio is absent or explicitly bypassed server-side.
- `STORYBOOK_TTS_*` values are now optional server-side overrides with safe defaults. TTS readiness requires only the existing server-side vivo basics: `VIVO_APP_ID`, `VIVO_APP_KEY`, and `VIVO_BASE_URL`.
- Default voice is `yige_child`, with `vivoHelper` as a provider fallback where applicable.
- `npm run storybook:generate-xiaoyu-audio -- --force` completed successfully and generated all six mp3 files plus `audio-manifest.json`.
- Frontend playback reports `vivo 朗读暂不可用，已切换为本地朗读。` or `朗读暂不可用，图片和文字可继续阅读。` on endpoint/audio failure and never treats fake audio as success.

Generated audio files:

- `public/demo-media/storybooks/lin-xiaoyu/audio/page-01.mp3`
- `public/demo-media/storybooks/lin-xiaoyu/audio/page-02.mp3`
- `public/demo-media/storybooks/lin-xiaoyu/audio/page-03.mp3`
- `public/demo-media/storybooks/lin-xiaoyu/audio/page-04.mp3`
- `public/demo-media/storybooks/lin-xiaoyu/audio/page-05.mp3`
- `public/demo-media/storybooks/lin-xiaoyu/audio/page-06.mp3`
- `public/demo-media/storybooks/lin-xiaoyu/audio/audio-manifest.json`

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
