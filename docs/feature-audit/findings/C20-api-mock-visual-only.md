# C20 API / Mock / Visual-only 代码扫描报告

- 扫描日期：2026-05-01
- 扫描类型：只读代码扫描，不修改业务源码
- 扫描范围：`app/`、`components/`、`lib/`、`shared/`、`scripts/`、`backend/` 下的代码与必读审计文档
- 必读文件：`docs/feature-audit/FEATURE_STATUS_TAXONOMY.md`、`docs/feature-audit/README.md`、`docs/bug-bash/BUGS.json`、`package.json`
- 代码文件数：432
- JSON 结果：`docs/feature-audit/findings/C20-api-mock-visual-only.json`
- 代码证据摘要：`artifacts/feature-audit/C20-code/code-signals.md`

## 扫描统计

| 指标 | 数量 |
| --- | ---: |
| 扫描文件数 | 432 |
| findings 总数 | 15 |
| mock-only 功能数 | 5 |
| visual-only 功能数 | 2 |
| no-api 功能数 | 7 |
| fake-success 风险 | 7 |
| backend-missing 风险 | 5 |

## 判定口径

- 真实 API：必须是功能级 API，能表达该业务对象的创建、更新、读取、错误处理和权限边界。
- 通用 `/api/state` 快照不计为家园沟通、健康、饮食、成长、幼儿档案、会诊或周报的完整功能 API。
- 仅 `useState`、store setter、`localStorage`、`sessionStorage`、`toast.success`、`console.log` 或 `setTimeout` 模拟成功，均按 local-state-only、no-api 或 fake-success 记录。
- API route 返回 fallback/demo/mock 数据，且业务 UI 未清晰隔离为演示模式时，按 mock-only 或 backend-missing 风险记录。
- 有 UI 入口但按钮 disabled、payload 固定为空、文案写明稍后开放或仅展示，按 visual-only 记录。

## 最高优先级

- F0：`C20-001` 高风险会诊完成提示声明“已同步教师端、家长端和园长端”，但 fallback/rule 结果只进入前端 store，没有 feature-specific consultation 持久化。
- F1：`C20-002` 至 `C20-009` 覆盖教师沟通回复、家长反馈、晨检、饮食、成长、幼儿档案、健康材料解析、教师语音/OCR 草稿等核心写入链路。
- F2：`C20-010` 至 `C20-015` 覆盖家长趋势 backend-missing、绘本 demoSeed、园长 demo feed、静态 dashboard metrics、周报无保存、反馈附件占位。

## Findings 明细

| ID | 优先级 | 类型 | 功能 | 关键代码证据 | 结论 |
| --- | --- | --- | --- | --- | --- |
| C20-001 | F0 | fake-success / local-state-only | high-risk consultation | `app/teacher/high-risk-consultation/page.tsx:469`、`:471`、`:472`、`:490`；`app/api/ai/high-risk-consultation/stream/route.ts:49`；`app/api/ai/high-risk-consultation/route.ts:211`；`lib/store.tsx:5171` | SSE/JSON fallback 可产出会诊结果，页面随即写本地 store 并显示三端同步成功；未发现 feature-specific consultation 保存 API。 |
| C20-002 | F1 | fake-success / no-api | teacher communication reply | `app/teacher/agent/page.tsx:145`、`:150`、`:911`、`:929`、`:1123`、`:1187` | 教师回复构造 `sentItem` 后只更新 component state，没有 `send/reply` API 或消息线程持久化。 |
| C20-003 | F1 | fake-success / local-state-only | parent feedback | `app/parent/agent/page.tsx:868`、`:885`、`:901`；`lib/store.tsx:5120`、`:4739`、`:4750` | 家长结构化反馈写入 `guardianFeedbacks` 和通用快照；demo 用户只返回 `local_only`。 |
| C20-004 | F1 | fake-success / no-api | health check | `app/health/page.tsx:182`、`:209`、`:220`、`:224`；`lib/store.tsx:5260` | 晨检保存调用 `upsertHealthCheck` 并直接 toast 成功，未发现 health-check 写入 API。 |
| C20-005 | F1 | fake-success / no-api | diet / nutrition | `app/diet/page.tsx:239`、`:274`、`:310`、`:363`、`:376`；`lib/store.tsx:5044`、`:5079` | 单餐、批量和 AI 营养建议最终都写本地 `mealRecords`；AI/vision 端点不承担饮食记录持久化。 |
| C20-006 | F1 | fake-success / no-api | growth | `app/growth/page.tsx:161`、`:170`、`:180`；`lib/store.tsx:5100` | 成长记录只调用 `addGrowthRecord`，本地生成 id 后 toast 成功。 |
| C20-007 | F1 | fake-success / no-api | children archive | `app/children/page.tsx:131`、`:146`、`:164`、`:573`、`:670`；`lib/store.tsx:4995`、`:5004` | 新增/删除幼儿档案只改本地 store；编辑档案入口 disabled 且显示暂未开放。 |
| C20-008 | F1 | mock-only | health file bridge | `app/teacher/health-file-bridge/page.tsx:75`、`:190`、`:203`、`:222`；`app/api/ai/health-file-bridge/route.ts:149`、`:165` | 上传只提交文件元数据和 previewText；本地 extractor fallback 标记 `mock: true`，确认归档没有真实写入。 |
| C20-009 | F1 | mock-only | teacher voice/OCR drafts | `app/teacher/agent/page.tsx:314`、`:327`、`:335`；`lib/mobile/voice-input.ts:12`；`lib/mobile/ocr-input.ts:4`；`lib/ai/providers/*` | 快捷入口使用 `buildMockVoiceDraft`、`buildMockOcrDraft`；ASR/OCR/TTS provider 仍是 mock/stub/placeholder。 |
| C20-010 | F2 | backend-missing | parent trend query | `app/parent/agent/page.tsx:657`、`:671`；`app/api/ai/parent-trend-query/route.ts:20`、`:31`；`components/parent/TrendLineChart.tsx:101` | 家长趋势查询依赖 brain；没有可用 response 时直接 503，不生成趋势结果。 |
| C20-011 | F2 | mock-only | parent storybook demoSeed | `app/api/ai/parent-storybook/route.ts:185`、`:194`、`:216`、`:262`；`components/parent/StoryBookViewer.tsx:1470` | `demoSeed` 请求被隔离为本地 fallback 故事，remote generation 被绕过。 |
| C20-012 | F2 | mock-only | admin consultation feed | `app/api/ai/high-risk-consultation/feed/route.ts:3`、`:19`、`:36`、`:53`；`lib/demo/demo-consultations.ts:1` | 园长会诊 feed 在后端空或不可用时返回 demo consultation feed，可能掩盖真实后端缺失。 |
| C20-013 | F2 | visual-only / mock-only | director dashboard metrics | `components/admin/pixel-replica/directorReplicaData.ts:1`、`:9`、`:11`、`:23`；`app/admin/page.tsx:6` | pixel replica 含静态图表、班级分布、档案行和周报待办，属于视觉复刻/硬编码 metrics。 |
| C20-014 | F2 | backend-missing / no-api | weekly report | `lib/agent/weekly-report-client.ts:80`、`:92`；`app/api/ai/weekly-report/route.ts:32`；`app/admin/page.tsx:35`、`:121` | 周报有 generate/preview API，但未发现 save/list/detail/share API；页面只做本地 cache/useState。 |
| C20-015 | F2 | visual-only / no-api | parent feedback attachments | `components/parent/ParentStructuredFeedbackComposer.tsx:250`、`:528`、`:535`、`:867`、`:870`、`:873` | 语音、图片、视频补充是 disabled 占位，提交 payload 固定 `attachments: {}`。 |

## 风险分组

### mock-only 功能

- `C20-008` 健康材料解析 fallback 标记 `mock: true`。
- `C20-009` 教师语音/OCR 草稿由 `buildMock*` 和 placeholder provider 生成。
- `C20-011` 绘本 `demoSeed` 强制走本地 fallback。
- `C20-012` 园长会诊 feed 后端空/不可用时回填 demo consultations。
- `C20-013` 园长 pixel replica 使用静态 mock metrics。

### visual-only 功能

- `C20-013` 园长看板静态视觉复刻混入业务指标展示。
- `C20-015` 家长反馈附件、语音、图片补充是 disabled 占位入口。

### no-api 功能

- `C20-002` 教师沟通回复。
- `C20-004` 晨检记录保存。
- `C20-005` 饮食记录保存与批量应用。
- `C20-006` 成长记录保存。
- `C20-007` 幼儿档案新增/删除。
- `C20-014` 周报保存/归档。
- `C20-015` 家长反馈附件上传。

### fake-success 风险

- `C20-001` 高风险会诊三端同步成功文案。
- `C20-002` 教师本地回复。
- `C20-003` 家长反馈提交。
- `C20-004` 晨检保存。
- `C20-005` 饮食保存与批量应用。
- `C20-006` 成长记录保存。
- `C20-007` 幼儿档案保存。

### backend-missing 风险

- `C20-001` 高风险会诊缺少真实 consultation 持久化。
- `C20-003` 家长反馈缺少 feature-specific feedback/message API。
- `C20-008` 健康材料解析缺少真实 upload/parse/archive 链路。
- `C20-010` 家长趋势查询依赖未就绪后端。
- `C20-014` 周报缺少 save/list/detail/share API。

## 后续建议

1. 先处理 `C20-001`：把高风险会诊从“生成结果 + 本地 store”升级为服务端 consultation 记录，成功文案必须依赖服务端写入结果。
2. 再处理 `C20-002`、`C20-003`：统一家园沟通消息、家长反馈和教师回复的数据模型，避免两个端各自维护本地状态。
3. 对 `C20-004` 至 `C20-007` 建立最小写入 API，至少区分 saved、pending、failed 三种状态，替换无条件成功 toast。
4. 对 `C20-008`、`C20-009`、`C20-011`、`C20-012`、`C20-013` 统一加 demo/mock 显式开关，生产路径不能静默回填演示数据。
5. 对 `C20-014`、`C20-015` 明确产品决策：若不是本期功能，应降级为隐藏或清晰标注；若是本期功能，需要补 API。
