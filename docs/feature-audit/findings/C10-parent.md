# C10 家长端功能完整性审计

- 审计时间：2026-05-01T00:16:43.468Z
- 本地地址：http://127.0.0.1:3000
- 浏览器：Playwright Chromium fallback
- Browser Use fallback 原因：Browser Use node_repl failed before execution because system Node C:\Program Files\nodejs\node.exe is v22.20.0; plugin requires >= v22.22.0. Audit executed with Playwright Chromium real-browser fallback against local dev server.
- 安全测试内容：`功能审计测试，请勿作为真实记录。2026-05-01T00-16-43-468Z`
## 重点不完整功能
- 家园沟通：not-persisted，反馈仅本地设备，教师端不可见。
- 成长档案：partial，以 demo/local store 为主。
- 成长绘本：partial，生成有 API 但保存/分享不完整。
- 健康管理：partial，直访健康页为权限提示。
- 营养餐谱：partial，缺家长只读餐谱 API。
- 日常提醒：not-persisted，只有局部本地状态。

## 汇总
- 审计功能数：7
- complete：0
- partial：5
- ui-only：0
- mock-only：0
- visual-only：0
- fake-success：0
- not-persisted：2
- backend-missing：0
- F0/F1/F2：0/1/6

## Findings
### C10-001 家长首页依赖 demo/local 状态与 AI fallback，首页数据不是端到端真实业务源
- severity/status：F2 / partial
- route/account：/parent?child=c-1 / 林妈妈
- persistence/api：not-applicable / local-state-only
- actual：首页可展示并能跳转，但主要记录来自前端 store/demo snapshot；观察到请求：GET /api/auth/session -> 401; POST /api/auth/demo-login -> 200。
- network：GET /api/auth/session -> 401; POST /api/auth/demo-login -> 200
- screenshots：`artifacts/feature-audit/C10-parent/parent-home-after-login-2026-05-01T00-16-43-468Z.png`
- recommendation：把家长首页关键指标切到按 childId 查询的真实 API，并在 AI fallback/规则兜底时显式标注数据来源。

### C10-002 家园沟通/家长反馈提交只落本地设备，无法作为真实老师消息回复闭环
- severity/status：F1 / not-persisted
- route/account：/parent/agent?child=c-1#feedback / 林妈妈
- persistence/api：lost-after-refresh / local-state-only
- actual：提交后页面提示“已提交/已记录”；提交阶段写请求 无。同浏览器刷新 localStorage 未找到测试记录；新上下文重登 不可见；李老师沟通页 不可见。
- network：未观察到相关请求
- screenshots：`artifacts/feature-audit/C10-parent/parent-agent-feedback-before-submit-2026-05-01T00-16-43-468Z.png`, `artifacts/feature-audit/C10-parent/parent-feedback-after-submit-2026-05-01T00-16-43-468Z.png`, `artifacts/feature-audit/C10-parent/parent-feedback-after-refresh-2026-05-01T00-16-43-468Z.png`, `artifacts/feature-audit/C10-parent/teacher-after-parent-feedback-switch-2026-05-01T00-16-43-468Z.png`
- recommendation：新增家园沟通/反馈写入 API，并让家长反馈在教师端按 childId/taskId 可见；保留明确发送失败状态。

### C10-003 成长档案以本地/demo 记录展示为主，详情和真实时间线能力不完整
- severity/status：F2 / partial
- route/account：/children; /growth / 林妈妈
- persistence/api：not-applicable / local-state-only
- actual：/children 可查看档案但家长端标注仅可查看；/growth 可展示/录入成长记录入口，未观察到成长记录读取 API，记录来源为本地 store/demo。页面包含测试前固定数据，空态需靠本地数据状态触发。
- network：未观察到相关请求
- screenshots：`artifacts/feature-audit/C10-parent/parent-children-archive-2026-05-01T00-16-43-468Z.png`, `artifacts/feature-audit/C10-parent/parent-growth-direct-2026-05-01T00-16-43-468Z.png`
- recommendation：补齐家长端成长档案 API、只读详情页和空态；明确家长是否允许补充成长观察。

### C10-004 成长绘本有生成 API 但保存/分享/翻页状态主要是页面缓存和预览交互
- severity/status：F2 / partial
- route/account：/parent/storybook?child=c-1 / 林妈妈
- persistence/api：unknown / real-api
- actual：观察到 parent-storybook 请求状态：200, 200, 200, 200；页面未直接显示 demoSeed；本地 storybook cache key 数量 0；重新生成按钮 可点击。分享/下载/保存未发现真实提交链路。
- network：POST /api/ai/parent-storybook -> 200; GET /api/ai/parent-storybook/media/4a3a30a6441fda4b82ce117a876b4fef14fbb436 -> 200; GET /api/ai/parent-storybook/media/d1d783c9e67958fedeafecb39e03a6f81b837bdb -> 200; POST /api/ai/parent-storybook -> 200
- screenshots：`artifacts/feature-audit/C10-parent/parent-storybook-loaded-2026-05-01T00-16-43-468Z.png`, `artifacts/feature-audit/C10-parent/parent-storybook-after-regen-click-2026-05-01T00-16-43-468Z.png`, `artifacts/feature-audit/C10-parent/parent-storybook-after-refresh-2026-05-01T00-16-43-468Z.png`
- recommendation：明确绘本保存/分享产品规则；将生成结果写入后端 storybook 表并按 childId/version 读取。

### C10-005 健康管理家长端没有独立真实功能页，直访晨检页只返回权限提示
- severity/status：F2 / partial
- route/account：/health / 林妈妈
- persistence/api：not-applicable / local-state-only
- actual：直访 /health 显示“当前账号无法操作晨检”。首页只展示摘要，未发现家长健康详情入口或真实 GET API。
- network：未观察到相关请求
- screenshots：`artifacts/feature-audit/C10-parent/parent-health-permission-2026-05-01T00-16-43-468Z.png`
- recommendation：提供家长只读健康详情页或在现有 /health 中按角色展示 child-scoped health records。

### C10-006 营养餐谱/饮食记录在家长端没有清晰只读边界，真实餐谱 API 缺失
- severity/status：F2 / partial
- route/account：/diet; /parent?child=c-1 / 林妈妈
- persistence/api：not-applicable / local-state-only
- actual：/parent 首页显示近 7 天饮食摘要；/diet 可打开共享饮食记录页面，未观察到餐谱 GET API。页面数据来自 local store，家长端营养反馈没有独立写入链路。
- network：未观察到相关请求
- screenshots：`artifacts/feature-audit/C10-parent/parent-diet-direct-2026-05-01T00-16-43-468Z.png`
- recommendation：补齐家长只读营养餐谱 API 与按日期反馈规则；避免家长直访共享录入页产生权限混淆。

### C10-007 日常提醒只有反馈页内局部“稍后提醒”状态，没有真实提醒列表或处理持久化
- severity/status：F2 / not-persisted
- route/account：/parent/agent?child=c-1#feedback / 林妈妈
- persistence/api：lost-after-refresh / local-state-only
- actual：提醒能力嵌在反馈卡中，点击稍后提醒只调用 updateReminderStatus 本地状态；未观察到提醒写 API，也没有独立日常提醒菜单。
- network：未观察到相关请求
- screenshots：`artifacts/feature-audit/C10-parent/parent-feedback-after-submit-2026-05-01T00-16-43-468Z.png`
- recommendation：新增日常提醒数据模型和已读/处理接口；明确提醒与家庭任务、教师提醒的关系。
