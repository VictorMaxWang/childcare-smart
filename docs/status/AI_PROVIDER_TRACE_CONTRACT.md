# AI Provider Trace Contract

Last updated: 2026-06-01

## Purpose

This contract makes AI provenance explicit for defense review and debugging. Key AI routes expose the same fields even when the real provider is unavailable:

- `source`
- `mode`
- `fallback`
- `fallbackReason`
- `provider`
- `providerTrace`

Existing business `mode` fields are preserved. For example, teacher-agent still uses `mode` for `class` / `child`, and storybook still uses `storybook` / `card`. The unified AI capability mode is always `providerTrace.mode`.

## Shared Types

Shared definitions live in `lib/ai/provider-trace.ts` and are re-exported from `lib/ai/types.ts`.

- `AiCapabilityMode`: `live | fallback | mock`, with `configured` allowed for config-only status rows.
- `AiFallbackReason`: built-in fallback tokens plus string extension for route-specific reasons.
- `AiProviderTrace`: safe provenance object for UI, tests and API clients.

Required runtime fields:

```ts
{
  provider: string;
  source: string;
  mode: "configured" | "live" | "fallback" | "mock";
  fallback: boolean;
  fallbackReason: string | null;
  realProvider: boolean;
  capability?: "llm" | "ocr" | "asr" | "tts" | "storybook-image" | "storybook-audio" | string;
  model?: string | null;
  requestId?: string | null;
  transport?: string | null;
  providerStatus?: {
    providerName?: string;
    configured?: boolean;
    live?: boolean;
    fallback?: boolean;
    mock?: boolean;
    status?: string;
    requiredEnv?: string[];
    warnings?: string[];
  } | null;
}
```

## Covered Routes

The following routes now return or derive the unified trace shape:

- `/api/ai/teacher-agent`
- `/api/ai/high-risk-consultation`
- `/api/ai/high-risk-consultation/stream`
- `/api/ai/parent-trend-query`
- `/api/ai/parent-storybook`
- `/api/ai/parent-storybook/media-status`
- `/api/ai/voice-asr`
- `/api/ai/teacher-voice-understand`
- `/api/ai/teacher-voice-upload`
- `/api/storybooks/lin-xiaoyu/tts`

TTS audio success responses use the safe `x-smartchildcare-provider-trace` header because the response body is binary. JSON error responses include the full trace fields.

## Provider Status

`/api/ai/provider-status` uses the existing `apiOk` envelope and exposes:

- legacy compatibility fields: `chat`, `ocr`, `asr`, `tts`, `fallbackText`
- aliases and new capabilities: `llm`, `storybookImage`, `storybookAudio`
- `capabilities`: six-row summary for LLM, OCR, ASR, TTS, storybook image and storybook audio

Each capability row includes:

```ts
{
  providerName: string;
  capability: string;
  configured: boolean;
  live: boolean;
  fallback: boolean;
  mock: boolean;
  mode: "configured" | "live" | "fallback" | "mock";
  state: "configured" | "live" | "fallback" | "mock";
  status: "ready" | "missing-env" | "unsupported" | "provider-unavailable" | "error";
  requiredEnv?: string[];
  warnings: string[];
}
```

The endpoint returns environment variable names only. It must never return app keys, tokens, Authorization headers, signatures, secrets or raw environment values.

## Debug UI

`/admin/ai-provider-status` is a read-only admin page for screenshots. It fetches `/api/ai/provider-status`, shows the six capabilities, and renders only provider names, modes, booleans, required env names and warnings.

## Fallback Rules

- `providerTrace.mode = "live"` means the request path used a real provider result.
- `providerTrace.mode = "fallback"` means the response is local, text-based, rule-based, transport fallback, or provider-unavailable.
- `providerTrace.mode = "mock"` means a fixture/static/demo path was used.
- `providerTrace.mode = "configured"` is reserved for config-only provider-status rows and does not mean a network probe was performed.

Provider-status does not perform network liveness checks. It is config-based to avoid latency, cost and side effects.
