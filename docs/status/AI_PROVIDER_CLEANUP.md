# AI Provider Capability Cleanup

Last updated: 2026-06-01

## Status Vocabulary

| State | Meaning |
| --- | --- |
| `configured` | Env/config is sufficient to attempt a real upstream provider. No request success is claimed. |
| `live` | The current request actually succeeded against the upstream provider. Health/status endpoints must not claim this from config alone. |
| `fallback` | Deterministic local/text/script fallback. No upstream model or media provider was called for that capability. |
| `mock` | Demo/mock provider selected intentionally. |

Compatibility fields such as `status: "ready" | "missing-env" | "provider-unavailable"` remain, but `state` is the canonical audit label.

## Inventory

| Runtime | Capability | Provider path | Current state boundary |
| --- | --- | --- | --- |
| Next | LLM/chat | `lib/providers/vivo/vivo-chat-provider.ts`, `lib/ai/providers/llm-provider.ts` | `configured` from env; request success returns `live`; local rules return `fallback`. |
| Next | OCR | `lib/providers/vivo/vivo-ocr-provider.ts`, `lib/ai/providers/ocr-provider.ts` | Image OCR can be `live` only per request; text-only inputs are `fallback`. |
| Next | ASR | `lib/providers/vivo/vivo-asr-provider.ts`, `lib/ai/providers/asr-provider.ts` | Audio transcription can be `live` only per request; provided transcript/text is `fallback`. |
| Next | TTS | `lib/providers/vivo/vivo-tts-provider.ts`, `lib/ai/providers/tts-provider.ts` | Vivo adapter is used only when full TTS env is present; otherwise script-only `fallback`. No placeholder real TTS remains. |
| FastAPI | LLM | `backend/app/providers/vivo_llm.py`, `backend/app/providers/resolver.py` | `configured` only when Vivo creds and `BRAIN_PROVIDER=vivo` are present; otherwise `mock`. |
| FastAPI | OCR | `backend/app/providers/text_ocr_fallback.py` | Always `fallback`; FastAPI has no verified binary OCR transport. |
| FastAPI | ASR | `backend/app/providers/vivo_asr.py`, `backend/app/providers/resolver.py` | `configured` only when Vivo creds and `BRAIN_PROVIDER=vivo` are present; otherwise `mock`. |
| FastAPI | TTS | health/status only | `configured` only when Vivo creds plus Storybook TTS runtime env are present; no health endpoint claims `live`. |

## Env Matrix

| Capability | Required env/config for `configured` |
| --- | --- |
| Next chat | `VIVO_APP_KEY`, `VIVO_APP_ID`, `VIVO_BASE_URL`, `VIVO_LLM_MODEL` |
| Next OCR | `VIVO_APP_KEY`, `VIVO_APP_ID`, `VIVO_BASE_URL`, `VIVO_OCR_PATH` |
| Next ASR | `VIVO_APP_KEY`, `VIVO_APP_ID`, `VIVO_BASE_URL`, `VIVO_ASR_PACKAGE`, `VIVO_ASR_CLIENT_VERSION`, `VIVO_ASR_USER_ID`, `VIVO_ASR_ENGINE_ID` |
| Next TTS | `VIVO_APP_KEY`, `VIVO_APP_ID`, `VIVO_BASE_URL`, `STORYBOOK_TTS_MODEL`, `STORYBOOK_TTS_PRODUCT`, `STORYBOOK_TTS_PACKAGE`, `STORYBOOK_TTS_CLIENT_VERSION`, `STORYBOOK_TTS_SYSTEM_VERSION`, `STORYBOOK_TTS_SDK_VERSION`, `STORYBOOK_TTS_ANDROID_VERSION` |
| FastAPI LLM/ASR | `BRAIN_PROVIDER=vivo`, `VIVO_APP_ID`, `VIVO_APP_KEY`, `VIVO_BASE_URL` plus LLM model for LLM |
| FastAPI OCR | None; `text-ocr-fallback` is explicit fallback |
| FastAPI TTS health | same Storybook TTS env set as Next TTS |

Known placeholder values such as `your_appid`, `your_appkey`, `mock`, `demo`, `placeholder`, and `changeme` are treated as missing. Status responses list env names only and must not print app ids, app keys, bearer tokens, or signatures.

## Current Boundaries

- The legacy FastAPI OCR module was removed. FastAPI OCR is now `TextOcrFallbackProvider` in `backend/app/providers/text_ocr_fallback.py`.
- `/api/v1/health` keeps `providers`, but values are capability states (`configured`, `live`, `fallback`, `mock`) instead of fixed mock labels. Detailed `provider_status` is configuration-only and keeps `live=false`.
- Health-file bridge fallback provenance is `provider=text-ocr-fallback`, `state=fallback`, `fallback=true`, `mock=false`, `live=false`, `liveReadyButNotVerified=false`.
- Next high-risk consultation does not synthesize audio in the consultation response. `providerTrace.tts` and `providerTrace.modes.tts` are script-only `fallback`.
- Storybook TTS remains the dedicated audio route. A successful Vivo TTS request reports `live` only on that request result.

## Verification

Commands used for this cleanup:

```powershell
python -m pytest backend/tests/test_health.py backend/tests/test_health_file_bridge_service.py backend/tests/test_health_file_bridge_endpoint.py
node --import ./scripts/register-test-path-loader.mjs --test lib/providers/vivo/vivo-provider-status.test.ts lib/ai/providers/tts-provider.test.ts app/api/ai/high-risk-consultation/route.test.ts app/api/ai/high-risk-consultation/stream/route.test.ts lib/agent/health-file-bridge.test.ts
npm run typecheck
npm run build
```
