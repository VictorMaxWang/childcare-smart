# Teacher Consultation QA

适用页面：`/teacher/high-risk-consultation`

目标：在不修改 consultation stage 顺序、不修改 SSE 事件名的前提下，验证 teacher 端是否清楚暴露了 provider、memory 和 transport 的真实状态。

## 1. 真链路调试入口

页面：

```text
/teacher/high-risk-consultation?trace=debug
```

不要带 `traceCase`，因为 `traceCase` 是前端演练，不代表真实 staging 链路。

## 2. 进入页面后先看什么

至少确认这 5 个信号：
1. 总体状态从 `loading / streaming / done` 正常推进。
2. 三个 stage 顺序完整：`long_term_profile -> recent_context -> current_recommendation`。
3. `providerTrace` 可见。
4. `memoryMeta` 可见。
5. `providerTrace.transport` 明确显示 `fastapi-brain` 或 `next-stream-fallback`。

## 3. 必看调试字段

`providerTrace` 至少要能看到：
- `source`
- `provider`
- `model`
- `requestId`
- `transport`
- `transportSource`
- `consultationSource`
- `fallbackReason`
- `realProvider`
- `fallback`

`memoryMeta` 至少要能看到：
- `usedSources`
- `matchedSnapshotIds`
- `matchedTraceIds`

## 4. 结果如何判读

- `providerTrace.transport=fastapi-brain`
  说明远端 FastAPI brain 真正处理了本次 SSE 请求。
- `providerTrace.transport=next-stream-fallback`
  说明页面虽然跑通，但这是 Next 本地 fallback，不算远端 brain stream 真链路。
- `providerTrace.source=vivo` 只说明 provider source 是 vivo。
- 只有 `realProvider=true` 且 `fallback=false`，才能说明本次结果不是 mock/fallback。

## 5. 前端演练 case 仍然保留

这些 URL 仍然只用于 UI 演练，不用于 staging 真链路判定：
- `/teacher/high-risk-consultation?trace=debug&traceCase=fallback`
- `/teacher/high-risk-consultation?trace=debug&traceCase=empty-memory`
- `/teacher/high-risk-consultation?trace=debug&traceCase=partial`
- `/teacher/high-risk-consultation?trace=debug&traceCase=invalid-result`
- `/teacher/high-risk-consultation?trace=debug&traceCase=error`

## 6. 最小人工验收

一次真实 teacher walkthrough 至少确认：
- 页面显示三个 stage 的推进过程
- 页面显示最终 recommendation 和 48 小时复查卡片
- 页面 debug 区域能同时看到 `providerTrace` 与 `memoryMeta`
- `providerTrace.transport=fastapi-brain`
- `providerTrace.source=vivo`
- `realProvider=true`
- `fallback=false`
