# SmartChildcare Agent 比赛架构总说明

更新基准：`2026-04-12`

本文件是**比赛叙事、lane 映射与 shared contracts 主文档**。如果与其他文档冲突，统一按下面优先级处理：

`代码事实 > docs/current-status-ledger.md > docs/competition-architecture.md > README / 旧任务地图 / 旧描述`

## 1. 项目定位

SmartChildcare Agent 是面向托育场景的移动端优先 AI 智能体系统。它的目标不是做一个更复杂的托育后台，而是把教师、家长、园长最关键的判断、沟通、干预和复盘流程压缩成**适合录屏、答辩、继续延展**的产品主路径。

当前真实阶段是：

**5 条比赛展示路径已形成稳定演示基线，仓库正从旧 `T0-T13 / freeze 收口账本` 切换到 `T1-T31` 并行推进控制面。**

核心闭环固定写成：

`教师记录 -> 系统理解 -> 会诊与决策 -> 家长执行 -> 反馈回流 -> 下一轮连续判断`

## 2. 当前最稳定比赛主路径

当前最稳定 walkthrough 固定为：

1. `/teacher`
2. `/teacher/high-risk-consultation`
3. `/admin`
4. `/parent`
5. `/parent/storybook?child=c-1`
6. `/parent/agent?child=c-1`

一句话叙事：

**教师先发现问题，系统组织会诊，园长承接决策，家长先愿意看，再看懂趋势并反馈。**

## 3. 当前 5 条展示路径

### 3.1 Teacher 语音主线

- 起点：`/teacher`
- 角色目标：帮助教师低成本记录现场观察，并快速进入结构化草稿确认
- 现有页面 / route / service：
  - `app/teacher/page.tsx`
  - `app/teacher/agent/page.tsx`
  - `app/api/ai/teacher-voice-upload/route.ts`
  - `app/api/ai/teacher-voice-understand/route.ts`
  - `backend/app/services/teacher_voice_understand.py`
  - `backend/app/services/teacher_voice_router.py`
- 当前口径：
  - 主线可演示
  - `teacher-voice-understand` 已能返回结构化 Copilot 辅助槽位，用于补全提示、30 秒 SOP 与家长沟通脚本
  - ASR live upstream 仍未 fully verified

### 3.2 高风险会诊主线

- 起点：`/teacher/high-risk-consultation`
- 角色目标：把长期画像、近期上下文与当前信号收束成当前最强 Multi-Agent workflow
- 现有页面 / route / service：
  - `app/teacher/high-risk-consultation/page.tsx`
  - `app/api/ai/high-risk-consultation/route.ts`
  - `app/api/ai/high-risk-consultation/stream/route.ts`
  - `lib/agent/high-risk-consultation.ts`
  - `lib/agent/consultation/*`
  - `backend/app/services/orchestrator.py`
  - `backend/app/services/high_risk_consultation_contract.py`
- 当前口径：
  - 当前最强展示位
  - 不等于完整 `T8` 已交付
  - `providerTrace` / `memoryMeta` 是 explainability 事实，不是 fully live 声明

### 3.3 Admin 决策区主线

- 起点：`/admin`
- 角色目标：把高风险会诊结果压成园长可执行的优先级与决策卡
- 现有页面 / route / service：
  - `app/admin/page.tsx`
  - `app/admin/agent/page.tsx`
  - `app/api/ai/high-risk-consultation/feed/route.ts`
  - `components/admin/RiskPriorityBoard.tsx`
  - `lib/agent/use-admin-workspace-loader.ts`
  - `backend/app/services/admin_consultation_feed.py`
  - `lib/agent/priority-engine.ts`
- 当前口径：
  - 当前第二展示位
  - `ConsultationTraceCard` 已开始优先展示结构化 `evidenceItems` 证据链，兼容摘要仅作为 fallback
  - 不扩写为 `T9D` / `T9C` fully 打通

### 3.4 Parent 微绘本主线

- 入口顺序：`/parent` 作为桥接首页，`/parent/storybook?child=c-1` 作为 wow factor 主入口
- 角色目标：先让家长愿意看、愿意进入行动建议
- 现有页面 / route / service：
  - `app/parent/page.tsx`
  - `app/parent/storybook/page.tsx`
  - `app/api/ai/parent-storybook/route.ts`
  - `app/api/ai/parent-storybook/media/[mediaKey]/route.ts`
  - `components/parent/StoryBookViewer.tsx`
  - `backend/app/services/parent_storybook_service.py`
  - `backend/app/providers/story_image_provider.py`
  - `backend/app/providers/story_audio_provider.py`
- 当前口径：
  - 已具展示能力
  - 图像 / 配音与上游 live provider 仍有边界

### 3.5 Parent 趋势与反馈主线

- 起点：`/parent/agent?child=c-1`
- 角色目标：把趋势解释、今晚动作与反馈回流放在同一链路
- 现有页面 / route / service：
  - `app/parent/agent/page.tsx`
  - `app/api/ai/parent-trend-query/route.ts`
  - `app/api/ai/follow-up/route.ts`
  - `components/parent/TrendLineChart.tsx`
  - `components/parent/ParentTrendResponseCard.tsx`
  - `backend/app/services/parent_trend_service.py`
  - `backend/app/services/memory_service.py`
- 当前口径：
  - 已具展示能力
  - 必须保留 `source` / `dataQuality` / `warnings`
  - 依赖 FastAPI brain，不能写成本地完整能力

## 4. 当前架构分层

### 4.1 交互感知层

- 角色页与桥接入口：`app/teacher/*`、`app/admin/*`、`app/parent/*`
- 结构化卡片与 UI：`components/teacher/*`、`components/consultation/*`、`components/admin/*`、`components/parent/*`
- 全局状态与本地草稿：`lib/store.tsx`、`lib/mobile/*`

### 4.2 Next 桥接层

- 统一向前端暴露 `/api/ai/*`
- 优先转发到 FastAPI brain
- 仅在允许场景提供 fallback
- 当前关键 route：
  - `/api/ai/teacher-voice-understand`
  - `/api/ai/high-risk-consultation`
  - `/api/ai/high-risk-consultation/stream`
  - `/api/ai/high-risk-consultation/feed`
  - `/api/ai/parent-trend-query`
  - `/api/ai/parent-storybook`
  - `/api/ai/follow-up`
  - `/api/ai/weekly-report`
  - `/api/ai/teacher-agent`
  - `/api/ai/admin-agent`
  - `/api/ai/parent-message-reflexion`
  - `/api/ai/react-agent`

### 4.3 FastAPI brain

- workflow 编排：`backend/app/services/orchestrator.py`
- Teacher 理解：`backend/app/services/teacher_voice_understand.py`
- Parent 趋势：`backend/app/services/parent_trend_service.py`
- Parent storybook：`backend/app/services/parent_storybook_service.py`
- 家长消息反思：`backend/app/services/parent_message_reflexion.py`
- 管理侧聚合：`backend/app/services/admin_consultation_feed.py`

### 4.4 记忆中枢

- `backend/app/db/memory_store.py`
- `backend/app/services/memory_service.py`
- `backend/app/memory/session_memory.py`
- `backend/app/memory/vector_store.py`
- `app/api/state/route.ts`

当前允许表述为：

- `child_profile_memory` / snapshots / trace 已落地
- SessionMemory / vector store 仍是轻量骨架
- 主工作流已开始消费 memory context

## 5. 未来 Product Lanes / 架构延长线

下面这些 lane 都**依附现有 5 条比赛主路径延长**，不是独立新系统。

### 5.1 收口与体验修复线

- 任务：`T1`、`T5`、`T6`
- 依附主路径：
  - `/teacher/high-risk-consultation`
  - `/admin`
  - `/parent/agent`
- 现有锚点：
  - `components/admin/ConsultationTraceCard.tsx`
  - `components/consultation/*`
  - `components/parent/ParentTrendResponseCard.tsx`
  - `backend/app/services/high_risk_consultation_contract.py`
  - `backend/app/services/parent_trend_service.py`
- 当前代码事实：
  - `T6` 已把主视角补水表达收敛到 `lib/hydration-display.ts` 驱动的状态化 copy，并接入 `/parent/agent`、`/diet` 与角色首页派生视图
  - 底层 hydration 数据仍保留给 trend / aggregation / risk 判断链路，不写成“已删除精确字段”

### 5.2 Demo 数据与演示准备线

- 任务：`T2`、`T3`、`T4`
- 依附主路径：
  - Teacher / Admin / Parent 三端现有页面
- 现有锚点：
  - `lib/store.tsx`
  - `app/api/state/route.ts`
  - `backend/app/db/childcare_repository.py`
- 当前代码事实：
  - `T2/T3` 已把前后端 demo 基线都扩到 36 人；本轮 integration sweep 额外补上了 request snapshot 历史窗口锚点，避免 parent trend 随当前日期漂移
  - `T4` 的 demo seed matrix / script / QA 文档已存在，但仍需要按录屏顺序做 child QA 再验

### 5.3 外部健康文件桥接线

- 任务：`T7`、`T8`、`T9`、`T10`
- 依附主路径：
  - `/parent`
  - `/teacher`
  - `/parent/agent`
  - 高风险会诊与 follow-up 写回链路
- 现有锚点：
  - `app/teacher/health-file-bridge/page.tsx`
  - `app/api/ai/health-file-bridge/route.ts`
  - `lib/agent/health-file-bridge.ts`
  - `backend/app/schemas/health_file_bridge.py`
  - `backend/app/services/health_file_bridge_service.py`
  - `backend/app/providers/vivo_ocr.py`
- 当前代码事实：
  - `T7` 已落地 teacher 入口、Next bridge route、本地 fallback 与 backend schema/service skeleton
  - OCR / 多模态抽取、动作映射、写回闭环仍分别留给 `T8`、`T9`、`T10`，不把当前 skeleton 写成完整闭环

### 5.4 关怀模式 / 祖辈模式线

- 任务：`T11`、`T12`
- 依附主路径：
  - `/parent`
  - `/parent/agent`
- 现有锚点：
  - `app/parent/page.tsx`
  - `app/parent/agent/page.tsx`
  - `components/parent/CareModeToggle.tsx`
  - `components/parent/ParentCareFocusCard.tsx`
  - `components/parent/ParentTransparencyPanel.tsx`
  - `components/parent/ParentStructuredFeedbackComposer.tsx`
  - `components/weekly-report/WeeklyReportPreviewCard.tsx`
  - `lib/care-mode.ts`
- 当前代码事实：
  - `T11` Phase 1 已在 `/parent` 与 `/parent/agent` 落地前端关怀模式切换，不新增账户级设置，也不改 AI / feedback / weekly-report / transparency 的底层 contract。
  - 状态优先级固定为 `?care=1|0 > localStorage > false`，用于 QA / 录屏 deeplink 与本地持久化并存。
  - 关怀模式首屏先收敛为“今晚做什么 / 明天看什么 / 最近一次关键提醒（或为什么现在做）”，复杂次级信息统一后置到“更多内容”。
  - `T12` Phase 1 已在 `/parent` 与 `/parent/agent` 落地 browser-first 语音预览：关怀模式摘要、AI 今日提醒、周报预览、透明层摘要与 Agent 当前建议摘要可通过浏览器 `speechSynthesis` 播报，按钮状态明确显示“浏览器播报 / 停止播报 / 当前浏览器不支持”。
  - `ParentStructuredFeedbackComposer` 已补最小语音反馈入口：浏览器支持语音识别时把结果追加到 `notes`；不支持时退回本地录音 fallback，并明确提示“仅录音草稿 / 暂不自动转字”。
  - Storybook 页面本体、Storybook 音频、`backend/app/providers/vivo_tts.py`、`backend/app/providers/vivo_asr.py` 与账户级祖辈偏好仍是后续阶段，不在本轮宣称已 fully live。

### 5.5 统一意图入口线

- 任务：`T13`、`T14`
- 依附主路径：
  - Teacher / Parent / Admin 入口页与各自 agent 页
- 现有锚点：
  - `app/api/ai/teacher-agent/route.ts`
  - `app/api/ai/admin-agent/route.ts`
  - `app/api/ai/react-agent/route.ts`
  - `backend/app/services/orchestrator.py`
  - `backend/app/services/react_runner.py`
- 当前代码事实：
  - `T13` 已提供统一 contract：`targetWorkflow`、`targetPage`、`deeplink`、`previewCard`
  - `T14` 在 `components/intent/UnifiedIntentEntryCard.tsx` 与 `components/intent/IntentResultPreviewCard.tsx` 落地为轻量单次路由入口，不是长对话系统
  - 前端 caller 固定走 `lib/ai/intent-router-client.ts -> POST /api/ai/intent-router`
  - 三端接入点分别位于 `/teacher` 顶部 hero 下方、`/teacher/home` 右侧 AI 区顶部、`/admin` 首屏 main 顶部、`/parent` 右侧 aside 顶部
  - deeplink 只补最小 query adapter：`/teacher/agent`、`/teacher/high-risk-consultation`、`/parent/agent`

### 5.6 家长反馈闭环线

- 任务：`T15`、`T16`、`T17`
- 依附主路径：
  - `/parent/agent`
  - `follow-up`
  - `weekly-report`
  - consultation writeback
- 现有锚点：
  - `lib/store.tsx` 中的 `GuardianFeedback`
  - `app/api/ai/follow-up/route.ts`
  - `app/api/ai/weekly-report/route.ts`
  - `backend/app/services/memory_service.py`

### 5.7 会诊可解释性增强线

- 任务：`T18`、`T19`
- 依附主路径：
  - `/teacher/high-risk-consultation`
  - `/admin`
- 现有锚点：
  - `backend/app/services/high_risk_consultation_contract.py`
  - `backend/app/services/admin_consultation_feed.py`
  - `lib/consultation/evidence.ts`
  - `lib/consultation/trace-types.ts`
  - `lib/consultation/trace-view-model.ts`
- 当前代码事实：
  - `T18` 已把结构化 `evidenceItems` 接到 consultation result、admin consultation feed、trace view model
  - `T19` 已把结构化 evidence 变成 Admin `ConsultationTraceCard` 的证据链 UI，并在 Teacher `TraceStepCard` 增加最小预览
  - `T19` 仍只完成代码接入与展示层收口，不包含 walkthrough / 录屏再验，也不等于完整 explainability fully finished
  - 当前 UI 触点：
    - `components/admin/ConsultationTraceCard.tsx`
    - `components/consultation/TraceStepCard.tsx`
    - `lib/consultation/evidence-display.ts`
    - `lib/agent/admin-consultation.ts`

### 5.8 干预执行与升级线

- 任务：`T20`、`T21`
- 依附主路径：
  - intervention card
  - follow-up
  - Admin 派发与优先级
- 现有锚点：
  - `lib/agent/intervention-card.ts`
  - `lib/mobile/reminders.ts`
  - `app/api/admin/notification-events/route.ts`
  - `app/api/ai/follow-up/route.ts`
- 当前代码事实：
  - `T20` 已新增 `lib/tasks/types.ts` 与 `lib/tasks/task-model.ts`，把 intervention / follow-up 统一收敛为 canonical `CanonicalTask`
  - intervention card 会稳定物化成 2 个任务：家长侧 `intervention` 今晚动作，教师侧 `follow_up` 48 小时复查
  - reminder 现在是 task projection，不再作为唯一事实源；`family-task` / `review-48h` / `admin-focus` 分别投影 parent / teacher / admin 任务
  - snapshot、store、follow-up payload 与 admin dispatch source 已增加 task 兼容字段，但旧 `InterventionCard`、`ReminderItem`、`TaskCheckInRecord`、`AdminDispatchEvent` 链路仍保留
  - `T21` 继续承接自动升级与连续逾期规则；本轮不落升级阈值、不做 Admin 首页任务看板

### 5.9 年龄分层照护线

- 任务：`T22`、`T23`
- 依附主路径：
  - Teacher 首页
  - Parent 首页
  - Parent storybook
  - Weekly Report
- 现有锚点：
  - `lib/store.tsx` 中的 `AgeBand`
  - `app/teacher/page.tsx`
  - `app/parent/page.tsx`
  - `app/parent/storybook/page.tsx`
  - `app/api/ai/weekly-report/route.ts`
- 当前事实：
  - `T22` 已先把共享年龄分层策略层落到 `shared/age-band-care-policy.json`，并提供 TS / Python 双端 resolver。
  - 本轮只接入两条安全链：`backend/app/services/parent_trend_service.py` 与 Parent Weekly snapshot / builders / backend mock provider。
  - `app/api/ai/weekly-report/route.ts` 本轮继续只做 transport / validation，不承载新的 age-band 业务逻辑。
  - `T23` Phase 1 已把 `lib/agent/intervention-card.ts`、`lib/agent/parent-agent.ts`、`lib/agent/teacher-agent.ts` 接到同一 shared policy，Parent / Teacher / Intervention 主链开始消费 `ChildSuggestionSnapshot.child.ageBandContext`，并通过 `lib/ai/dashscope.ts`、`lib/ai/fallback.ts`、`lib/ai/mock.ts` 保持 prompt / fallback / mock 一致。
  - `T23` 本轮仍不扩散 UI：不改 Parent / Admin / Teacher 首页结构，不碰 Storybook 页面本体；页面 walkthrough、录屏与更完整的 Parent / Storybook 呈现留到后续阶段。

### 5.10 Teacher Copilot 线

- 任务：`T24`、`T25`
- 依附主路径：
  - `/teacher`
  - `/teacher/agent`
- 现有锚点：
  - `app/api/ai/teacher-agent/route.ts`
  - `app/api/ai/teacher-voice-understand/route.ts`
  - `lib/agent/teacher-agent.ts`
  - `backend/app/agents/teacher_agent.py`
  - `backend/app/services/teacher_voice_understand.py`
- 当前代码事实：
  - `T24` 已把 Teacher Copilot backend 主落点收敛到 `teacher_voice_understand`；官方结构化字段为 `record_completion_hints`、`micro_training_sop`、`parent_communication_script`
  - `T24` 保留了 legacy mirrors，避免打断当前 `teacher-agent` / mobile draft / Copilot UI 消费链路
  - `T25` 已把 Teacher Copilot UI 轻量接入 `components/teacher/TeacherDraftConfirmationPanel.tsx` 与 `components/teacher/TeacherAgentResultCard.tsx`
  - `/teacher` 继续保留轻入口；完整 Copilot 展示仍依附 `/teacher/agent`

### 5.11 Actionized Weekly Report 线

- 任务：`T26`、`T27`
- 依附主路径：
  - Teacher / Admin / Parent 的周报入口
- 现有锚点：
  - `app/api/ai/weekly-report/route.ts`
  - `app/admin/page.tsx`
  - `app/admin/agent/page.tsx`
  - `app/teacher/agent/page.tsx`
  - `app/parent/page.tsx`
  - `components/weekly-report/WeeklyReportPreviewCard.tsx`
  - `lib/agent/weekly-report-client.ts`
  - `lib/agent/parent-weekly-report.ts`
  - `backend/app/services/orchestrator.py`
- 当前代码事实：
  - `T26` 已把 weekly report standalone route 与 FastAPI `/api/v1/agents/reports/weekly` 收口到统一 backend-ready contract，按 `payload.role -> legacy snapshot.role` 解析 `teacher / admin / parent`
  - 现有返回同时保留 legacy `summary / highlights / risks / nextWeekActions / trendPrediction` 与新增 `schemaVersion / role / sections / primaryAction`
  - `T27` 已把三角色最小前端接入落到现有主路径：Teacher 预览在 `/teacher/agent` 主列，Admin 预览在 `/admin` 首页既有周摘要区域，Parent 预览在 `/parent` 首页成长记录与趋势入口之间
  - 三端都通过同源 `/api/ai/weekly-report` 获取周报；Teacher / Admin 复用既有 snapshot builder，Parent 仅补 `buildParentWeeklyReportSnapshot()` 薄 adapter，不重做 T26 backend schema
  - 当前前端只承接轻量 preview，不把 `/admin/agent?action=weekly-report` 重做成第二套首页，也不宣称 fully live；后续 walkthrough / richer drill-down 仍属于 `T27` 之后的细化工作

### 5.12 Admin 质量治理线

- 任务：`T28`、`T29`
- 依附主路径：
  - `/admin`
  - `/admin/agent`
- 现有锚点：
  - `lib/agent/priority-engine.ts`
  - `backend/app/services/admin_consultation_feed.py`
  - `backend/app/agents/admin_agent.py`
  - `backend/app/schemas/admin_quality_metrics.py`
  - `backend/app/services/admin_quality_metrics_engine.py`
  - `POST /api/v1/agents/metrics/admin-quality`
  - `app/api/ai/admin-quality-metrics/route.ts`
  - `components/admin/AdminQualityMetricsPanel.tsx`
- 当前事实：
  - `T28` 已把 Admin 质量指标聚合链路落到 backend；前端可直接消费 8 个 named metrics 与 `window / sourceSummary / source / fallback / warnings`
  - `T29` 已把质量驾驶舱作为 `/admin` 的第二层治理区挂载在主列，不改 `/admin/agent`、不重排周报工作区、也不挤占 `RiskPriorityBoard` 第一视角
  - 当前 UI 仍可能显示 demo / proxy 指标，因此 `source`、`fallback`、`confidence`、`coverage` 必须在界面上诚实保留

### 5.13 需求洞察与信任透明线

- 任务：`T30`、`T31`
- 依附主路径：
  - `/admin`
  - `/parent`
  - `/parent/agent`
- 现有锚点：
  - feedback、consultation、task、trend、weekly report 现有数据源
  - `components/parent/*`
  - `lib/consultation/trace-view-model.ts`

## 6. Shared Contracts

未来线程默认先扩 shared contract，再扩 UI / route / service，不要各自造结构。

### 6.1 feedback contract

- 用途：统一记录是否执行、执行次数、谁执行、孩子反应、是否改善、阻碍、附件
- 当前锚点：
  - `lib/store.tsx` 中的 `GuardianFeedback`
  - `AppStateSnapshot.feedback`

### 6.2 evidence contract

- 用途：统一会诊证据来源、置信度、是否需人工复核、建议类别
- 当前锚点：
  - `backend/app/services/high_risk_consultation_contract.py`
  - `backend/app/services/admin_consultation_feed.py`
  - `lib/consultation/evidence.ts`
  - `lib/consultation/trace-types.ts`
  - `lib/consultation/trace-view-model.ts`
- 当前结构：
  - `ConsultationEvidenceItem`
  - `sourceType`
  - `sourceLabel`
  - `sourceId`
  - `summary` / `excerpt`
  - `confidence`
  - `requiresHumanReview`
  - `evidenceCategory`
  - `supports`
  - `timestamp`
  - `metadata`
- 当前映射边界：
  - `providerTrace` 只进入 `metadata.provenance`，不单独冒充业务证据
  - `keyFindings`、`triggerReasons`、`explainability` 会投影到 `derived_explainability`
  - `memoryMeta`、`continuityNotes`、`multimodalNotes` 会投影到稳定 `sourceType` 的 evidence item
  - 旧 `evidenceHighlights` 继续由结构化 evidence 投影，供现有 Admin trace / feed 兼容消费
  - `lib/agent/admin-consultation.ts`
- 当前字段形状：
  - `ConsultationEvidenceItem`
  - `HighRiskConsultationResult.evidenceItems`
  - `ConsultationTraceViewModel.evidenceItems`
- 兼容边界：
  - `providerTrace` 只作为 provenance metadata，不单独冒充业务证据
  - `memoryMeta`、`explainability`、`keyFindings`、`triggerReasons` 仍保留旧字段，同时映射到 `evidenceItems`

- 当前最小字段约定：
  - `id`、`sourceType`、`sourceLabel`、`sourceId?`、`summary`、`excerpt?`
  - `confidence` 仅表达来源锚定/映射可信度，固定为 `low | medium | high`
  - `requiresHumanReview`
  - `evidenceCategory` 固定为 `risk_control | family_communication | daily_care | development_support`
  - `supports[]` 使用 `finding:key:{index}`、`finding:trigger:{index}`、`action:school:{index}`、`action:home:{index}`、`action:followup:{index}`、`explainability:{index}` 建立与 finding / action / explainability 的稳定映射
- 当前消费落点：
  - consultation normalize、SSE done、direct JSON route 同步输出 `evidenceItems`
  - admin feed item 与 admin trace view model 已开始消费 `evidenceItems`
  - Admin `ConsultationTraceCard` 已优先展示结构化 `evidenceItems`，Teacher `TraceStepCard` 已提供最小结构化证据预览
  - 旧 `evidenceHighlights`、`explainability` 与 stage legacy evidence 仍保留为兼容投影

### 6.3 task / follow-up contract

- 用途：统一 intervention、reminder、follow-up、dispatch、check-in 生命周期
- 当前锚点：
  - `lib/agent/intervention-card.ts`
  - `ReminderItem`
  - `TaskCheckInRecord`
  - `AdminDispatchEvent`
- 当前 contract：
  - canonical task 字段固定为 `taskId`、`taskType`、`childId`、`sourceType`、`sourceId`、`ownerRole`、`title`、`description`、`dueWindow`、`dueAt`、`status`、`evidenceSubmissionMode`、`completionSummary`、`createdAt`、`updatedAt`
  - 兼容与治理字段包括 `statusChangedAt`、`completedAt`、`lastEvidenceAt`、`relatedTaskIds`、`legacyRefs`
  - `TaskStatus` 统一为 `pending | in_progress | completed | overdue`，其中 `overdue` 在 T20 由读取时推导，不要求 legacy source 持久化该状态
  - `ReminderItem`、`AiFollowUpPayload`、`AiFollowUpResponse` 已增加 task 相关可选字段，旧 `currentInterventionCard` / `familyTask` / `latestFeedback` 继续保留给旧链路消费
  - admin dispatch 仍是镜像兼容层，只附带 `taskId/sourceType/sourceId/relatedTaskIds`，不在 T20 引入独立 overdue 持久化

### 6.4 age-band policy

- 用途：让不同年龄段在建议重点、语气、任务策略、storybook tone 上体现差异
- 当前锚点：
  - `lib/store.tsx` 中的 `AgeBand`
- T22 source of truth：
  - `shared/age-band-care-policy.json`
- Shared wrappers：
  - `lib/age-band/policy.ts`
  - `backend/app/services/age_band_policy.py`
- 当前 contract seam：
  - `WeeklyReportSnapshot.ageBandContext`
  - `ChildSuggestionSnapshot.child.ageBandContext`
  - `ParentTrendQueryChild.birthDate / ageBand / normalizedAgeBand / ageBandSource`
- 当前消费链路：
  - backend trend explanation / supportingSignals / warnings
  - Parent Weekly snapshot / local weekly builders / backend mock weekly provider
- T23 Phase 1 已新增主链消费：
  - `intervention-card` 的 `todayInSchoolAction / tonightHomeAction / tomorrowObservationPoint / reviewIn48h`
  - `parent-agent` 的 suggestion / follow-up builder、assistant answer 与 intervention card bridge
  - `teacher-agent` 的 communication / follow-up summary、action items、parent message draft、tomorrow observation 与 intervention card bridge
- 当前仍保守 fallback：
  - `birthDate` 优先；宽泛 legacy `ageBand` 在缺少生日时保持 unresolved，不强拆 `1-3岁`
  - Storybook 页面级接入、Parent 首页 walkthrough、透明层联动与录屏验证仍 deferred

### 6.5 actionized weekly report contract

- 用途：统一 Teacher / Admin / Parent 三版本周报 schema 与 action slot
- 当前锚点：
  - `app/api/ai/weekly-report/route.ts`
  - `WeeklyReport` 现有请求 / 输出链路
- 当前最小 contract：
  - request: `WeeklyReportPayload { role?, snapshot }`
  - role resolve: `payload.role -> legacy snapshot.role -> invalid`
  - response: `WeeklyReportResponse { schemaVersion: "v2-actionized", role, summary, highlights, risks, nextWeekActions, trendPrediction, sections, primaryAction? }`
  - section shape: `WeeklyReportSection { id, title, summary, items[] }`
  - Teacher section ids: `weeklyAnomalies` / `makeUpItems` / `nextWeekObservationFocus`
  - Admin section ids: `highRiskClosureRate` / `parentFeedbackRate` / `classIssueHeat` / `nextWeekGovernanceFocus`
  - Parent section ids: `weeklyChanges` / `topHomeAction` / `feedbackNeeded`
- 兼容边界：
  - 旧字段继续保留给现有 homepage / teacher-agent / admin-agent 消费链，不在 `T26` 删除
  - `sections[].items` 先固定为最小 actionized shape，允许 `T27` 以后按 UI walkthrough 再细化，不应在本轮宣称 shape fully settled

### 6.6 quality metrics contract

- 用途：统一会诊转闭环率、48h 复查完成率、家长反馈率、任务执行率等机构指标
- 当前锚点：
  - `lib/agent/priority-engine.ts`
  - `backend/app/services/admin_consultation_feed.py`
  - `backend/app/schemas/admin_quality_metrics.py`
  - `backend/app/services/admin_quality_metrics_engine.py`
  - `POST /api/v1/agents/metrics/admin-quality`
- 当前最小输出：
  - 8 个 named metrics：`consultationClosureRate`、`followUp48hCompletionRate`、`homeTaskExecutionRate`、`guardianFeedbackRate`、`suggestionEffectiveness`、`teacherLowConfidenceRate`、`morningCheckResponseLatency`、`recurringIssueHeat`
  - 面板级 envelope：`window`、`sourceSummary`、`source`、`fallback`、`warnings`
  - metric 级字段：`label`、`value`、`unit`、`summary`、`source.mode`、`confidence`、`coverage.coverageRatio`
- 前端消费边界：
  - `/admin` 首页当前通过薄代理 route 消费该 contract，不直连 backend
  - 本轮不展开 numerator / denominator、drill-down 与图表；后续若补这些能力，优先微调前端 adapter / TS 类型层，而不是回退 T28 schema 本体

### 6.7 demand insight contract

- 用途：统一家长关注点热区、执行难点、弱反馈班级 / 年龄段聚合
- 当前锚点：
  - `backend/app/services/demand_insight_engine.py`
  - `backend/app/schemas/demand_insight.py`
  - `POST /api/v1/agents/insights/demand`
- 当前输出：
  - `topConcernTopics`
  - `consultationTriggerHeat`
  - `actionDifficultyTopics`
  - `weakFeedbackSegments`
  - `recurringIssueClusters`
  - 统一附带 `window`、`sourceSummary`、`dataQuality`、`source`、`fallback`、`warnings`
- 当前数据链路：
  - `backend/app/db/childcare_repository.py` 提供 `children / feedback / growth / health / meals / taskCheckIns / interventionCards / reminders`
  - memory snapshots 提供 `consultation-result`
  - `weekly-report-result` 与 `parent-follow-up-result` 只作为来源统计或弱信号，不作为真实运营洞察主证据
- 当前保守边界：
  - 无真实 `consultation-result` 时，`consultationTriggerHeat` 会退化为基于 `growth / health / feedback` 的低置信度 proxy 聚合，并写入 warning
  - `demo_snapshot` / fallback 模式下仍可输出结构化 shape，但不能夸大为真实机构运营洞察

### 6.8 trust transparency copy layer

- 用途：统一 `source`、`fallback`、`dataQuality`、`warnings`、`memoryMeta`、`providerTrace` 的可见说明层
- 当前锚点：
  - `components/parent/ParentTrendResponseCard.tsx`
  - `components/parent/StoryBookViewer.tsx`
  - `components/consultation/*`

### 6.9 external health bridge contract

- 用途：统一上传解析结果、结构化风险、托育动作映射、写回目标
- 当前锚点：
  - `backend/app/schemas/multimodal.py`
  - `backend/app/services/orchestrator.py`
  - `backend/app/services/memory_service.py`

### 6.10 intent routing contract

- 用途：统一 `targetWorkflow`、`targetPage`、`deeplink`、`previewCard`
- 当前锚点：
  - `app/api/ai/intent-router/route.ts`
  - `lib/ai/intent-router.ts`
  - `lib/ai/intent-router-client.ts`
  - `components/intent/UnifiedIntentEntryCard.tsx`
  - `components/intent/IntentResultPreviewCard.tsx`
- 当前前端消费方式：
  - 入口卡统一传 `message + roleHint + sourcePage`，按页补 `childId` / `institutionId`
  - 结果卡只展示助手推荐语义与弱信息元数据，不直接暴露 debug JSON
  - 当前仍是轻量路由层，后续若扩成长对话，再在同一 caller / guard 之上外提 shared assistant workspace

### 6.11 teacher copilot contract

- 用途：统一 Teacher 语音理解后的补全提示、微培训 SOP、家长沟通脚本，并明确这些字段属于 Copilot 辅助而不是系统接管
- 当前锚点：
  - `backend/app/schemas/teacher_voice.py`
  - `backend/app/services/teacher_voice_understand.py`
  - `backend/app/services/teacher_voice_copilot.py`
  - `lib/ai/teacher-voice-understand.ts`
  - `lib/ai/teacher-voice-copilot.ts`
  - `lib/teacher-copilot/*`

## 7. Wave 视图

| Wave | 主目标 | 依赖关系 |
| --- | --- | --- |
| `A` | 快收口 / 低风险高收益 | `T4` 依赖 `T2/T3`，`T6` 依赖 `T5` |
| `B` | 新增亮点第一批 | `T7 -> T8 -> T9 -> T10`，`T11 -> T12`，`T13 -> T14` |
| `C` | 闭环与治理增强 | `T15 -> T16 -> T17`，`T18 -> T19`，`T20 -> T21` |
| `D` | 纵深化与比赛加分层 | `T22 -> T23`，`T24 -> T25`，`T26 -> T27`，`T28 -> T29`，`T31` 接在 `T18/T19` 与 `T30` 后 |

## 8. 当前最该避免的误表述

- 不要把 staging 写成 `fully healthy` / `fully switched`
- 不要把 vivo provider 写成 fully live
- 不要把 Parent trend 写成无 FastAPI brain 的本地能力
- 不要把 Parent storybook 写成图像 / 配音上游 fully live
- 不要把 Admin 第二展示位写成 `T9D` / `T9C` 主战场已完成
- 不要把任一 T1-T31 写成独立新系统；它们都必须挂回当前 5 条展示路径和 shared contracts

### 6.12 parent structured feedback contract

- Purpose: define one stable child-scoped contract for parent execution feedback so follow-up, trend, weekly-report, consultation, and escalation can consume the same normalized record.
- Persistence rule: do not introduce a second top-level bucket. Keep `feedback[]` as the single persisted bucket and normalize every item into `ParentStructuredFeedbackRecord`.
- Canonical fields: `feedbackId`, `childId`, `sourceRole`, `sourceChannel`, `relatedTaskId`, `relatedConsultationId`, `executionStatus`, `executionCount`, `executorRole`, `childReaction`, `improvementStatus`, `barriers`, `notes`, `attachments`, `submittedAt`, `source`, `fallback`.
- Legacy mirror on the same record: `id`, `date`, `status`, `content`, `interventionCardId`, `sourceWorkflow`, `executed`, `improved`, `freeNote`, `createdBy`, `createdByRole`.
- Normalization gates: `lib/store.tsx`, `lib/persistence/snapshot.ts`, and `app/api/state/route.ts` accept legacy-only, canonical-only, and mixed feedback payloads, then store one normalized record shape.
- Minimum consumers in this wave:
- Follow-up payloads read `executionStatus`, `childReaction`, `improvementStatus`, `relatedTaskId`, and `notes` through lite projections.
- Task/evidence and escalation rules match `relatedTaskId` first and fall back to `interventionCardId`.
- Backend child history, timeline, and memory continuity signals prefer canonical timestamps and summaries, then fall back to legacy fields.
- `T17` extends this into one shared consumption adapter: follow-up/consultation reselect task-aware feedback, weekly-report pulls summary/open-loops/primary-action support from the same source, parent trend explanation adds feedback-derived supporting signals, and orchestrator snapshots keep compact `latestFeedback` plus `recentDetails.feedback` for downstream memory consumers.
- Follow-on boundary: `T16` owns input UI, `T17` owns stronger writeback/trend/report consumers, and `T21` can later consume canonical feedback signals without another contract rewrite.
