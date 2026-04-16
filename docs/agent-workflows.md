# SmartChildcare Agent 工作流地图

本文只整理 freeze 前最关键的 5 条展示路径：真实代码落点、route、service、provider / memory 与 fallback 边界，用于交接、录屏和答辩。

## 1. Teacher 语音主线

### UI 页面

- `app/teacher/page.tsx`
- `app/teacher/layout.tsx`
- `components/teacher/TeacherVoiceAssistantLayer.tsx`
- `app/teacher/agent/page.tsx`

### Next route

- `app/api/ai/teacher-voice-upload/route.ts`
- `app/api/ai/teacher-voice-understand/route.ts`

### FastAPI endpoint / service

- `backend/app/api/v1/endpoints/teacher_voice.py`
- `backend/app/services/teacher_voice_understand.py`
- `backend/app/services/teacher_voice_router.py`
- `backend/app/services/teacher_voice_prompt_chain.py`

### Provider / memory

- ASR provider：`backend/app/providers/vivo_asr.py`
- Next 本地 fallback：`resolveAsrProvider()` + `buildTeacherVoiceUnderstandFallback()`
- 草稿落点：Teacher Agent 页 + local draft persistence

### Fallback 边界

- Next route 支持 best-effort fallback
- 当前能保守写成“结构化草稿链路已演示可用”
- 当前不能写成 ASR live upstream fully verified

## 2. 高风险会诊主线

### UI 页面

- `app/teacher/high-risk-consultation/page.tsx`
- `components/consultation/*`
- `components/agent/InterventionCardPanel.tsx`

### Next route

- `app/api/ai/high-risk-consultation/route.ts`
- `app/api/ai/high-risk-consultation/stream/route.ts`

### FastAPI endpoint / service

- `backend/app/api/v1/endpoints/agents.py`
- `backend/app/services/orchestrator.py`
- `lib/agent/high-risk-consultation.ts`
- `lib/agent/consultation/*`

### Provider / memory

- memory context：`build_memory_context_for_prompt` 进入 consultation 主链
- trace / explainability：`providerTrace`、`memoryMeta`
- streaming：SSE

### Fallback 边界

- `trace=debug&traceCase=...` 只用于页面演练
- `providerTrace.transport=next-stream-fallback` 说明走了页面级 fallback
- 当前不能把 debug case / fallback 讲成远端 brain 全链路验收

## 3. Admin 决策区主线

### UI 页面

- `app/admin/page.tsx`
- `app/admin/agent/page.tsx`
- `components/admin/RiskPriorityBoard.tsx`

### Next route

- `app/api/ai/high-risk-consultation/feed/route.ts`
- `app/api/admin/notification-events/route.ts`

### FastAPI endpoint / service

- `backend/app/api/v1/endpoints/agents.py`
- `/api/v1/agents/consultations/high-risk/feed`
- consultation data 由 orchestrator / repository 提供

### Provider / memory

- consultation feed 来自高风险会诊结果
- notification events 与本地 consultation 会共同参与 UI 组装

### Fallback 边界

- feed route 本身在 brain 不可用时返回 unavailable
- UI 层会根据 `latestConsultations` 做展示级 local fallback
- 当前应表述为“Admin 第二展示位稳定可演示”
- 当前不应表述为 `T9D` / `T9C` 已彻底打通

## 4. Parent 趋势线主线

### UI 页面

- `app/parent/agent/page.tsx`
- `components/parent/ParentTrendResponseCard.tsx`
- `components/parent/TrendLineChart.tsx`
- `components/parent/ParentTrendQaPanel.tsx`

### Next route

- `app/api/ai/parent-trend-query/route.ts`

### FastAPI endpoint / service

- `backend/app/api/v1/endpoints/agents.py`
- `/api/v1/agents/parent/trend-query`
- `backend/app/services/parent_trend_service.py`

### Provider / memory

- trend 聚合依赖 FastAPI brain
- 数据来源会在结果里通过 `source`、`dataQuality`、`warnings` 明示

### Fallback 边界

- Next 本地 fallback 被明确禁用
- 如果 brain 不可用，route 会直接返回 `503`
- `demo_snapshot` 属于 backend 结果降级，不是前端本地伪造数据
- 录屏时必须保留 `source`、`fallback`、`dataQuality`、`warnings`

## 5. Parent 微绘本主线

### UI 页面

- `app/parent/page.tsx`
- `app/parent/storybook/page.tsx`
- `components/parent/StoryBookViewer.tsx`

### Next route

- `app/api/ai/parent-storybook/route.ts`

### FastAPI endpoint / service

- `backend/app/api/v1/endpoints/agents.py`
- `/api/v1/agents/parent/storybook`
- `backend/app/services/parent_storybook_service.py`

### Provider / memory

- storybook request builder：`lib/agent/parent-storybook.ts`
- image provider：`backend/app/providers/story_image_provider.py`
- audio provider：`backend/app/providers/story_audio_provider.py`
- tts provider 相关配置：`backend/app/providers/vivo_tts.py`

### Fallback 边界

- Next route 在 brain 不可用时支持 `next-json-fallback`
- service 允许 rule / asset / mock / media fallback
- 当前可表述为“Parent 微绘本已具展示能力并形成 wow factor”
- 当前不可表述为“图像 / 配音上游 fully live”

## 6. 真实链路与不该说的话

### 可以说

- Teacher 主线可录屏
- 高风险会诊是当前最强 Agent workflow
- Admin 是第二展示位
- Parent 趋势线和微绘本都已有真实代码落点与测试
- vivo 相关 provider 已有代码层接入与 smoke / test 基础

### 不该说

- staging 已 fully healthy / fully switched
- vivo 已 fully live
- Parent trend 有完整本地 fallback
- Parent storybook 图像 / 配音已完成真实上游验收
- Admin 第二展示位等于 `T9D` / `T9C` 已结束

## 7. 当前建议的最小人工 walkthrough

1. `/teacher`
2. `/teacher/high-risk-consultation`
3. `/admin`
4. `/parent`
5. `/parent/storybook?child=c-1`
6. `/parent/agent?child=c-1`
