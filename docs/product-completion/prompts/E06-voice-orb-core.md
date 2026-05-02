# E06 Voice Orb Core Prompt

你现在执行 E06：语音球助手核心框架。

## Must Read

- `docs/product-completion/VOICE_ASSISTANT_SPEC.md`
- `docs/product-completion/COMMAND_INTENT_MAP.md`
- `docs/product-completion/SERVER_SCOPE_SPEC.md`
- current teacher voice components and `lib/voice`
- route map and D99 docs
- E01 result files

## Mission

Build the common three-role voice orb framework. It must execute real commands, not just display UI.

## Required Implementation

- Extract or create shared `VoiceAssistantLayer`.
- Provide voice input and text fallback.
- Implement command planner, permission gate, confirmation controller, executor, and result presenter.
- Read-only commands may execute immediately.
- Write/send/archive/delete/export/share/dispatch commands require confirmation.
- Low confidence or missing child/object/content must ask for clarification.

## Verification

Run:

- `npm run lint`
- `npm run build`
- command planner/gate/executor tests
- Browser/Playwright: text fallback command, confirmed write, denied unauthorized command

## Result Files

Write `docs/product-completion/results/E06-result.json` and `.md`.

