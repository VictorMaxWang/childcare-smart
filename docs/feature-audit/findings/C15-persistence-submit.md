# C15 提交、保存、持久化专项审计

- 审计时间：2026-05-01T00:16:43.468Z
- 本地地址：http://127.0.0.1:3000
- 浏览器：Playwright Chromium fallback
- Browser Use fallback 原因：Browser Use node_repl failed before execution because system Node C:\Program Files\nodejs\node.exe is v22.20.0; plugin requires >= v22.22.0. Audit executed with Playwright Chromium real-browser fallback against local dev server.
- 安全测试内容：`功能审计测试，请勿作为真实记录。2026-05-01T00-16-43-468Z`
## 持久化专项口径
- persisted：1
- fake-success：5
- no-submit：2
- local-state-only：7
- backend-missing：0
- not-persisted：3

## 汇总
- 审计功能数：13
- complete：0
- partial：5
- ui-only：0
- mock-only：0
- visual-only：0
- fake-success：5
- not-persisted：3
- backend-missing：0
- F0/F1/F2：0/9/4

## Findings
### C15-001 家长端今晚反馈提交无真实写 API，demo 成功实际是本地设备状态
- severity/status：F1 / not-persisted
- route/account：/parent/agent?child=c-1#feedback / 林妈妈
- persistence/api：lost-after-refresh / local-state-only
- actual：提交阶段写 API：无；刷新同上下文 localStorage 未保留；新上下文 不可见；教师端 不可见。
- network：未观察到相关请求
- screenshots：`artifacts/feature-audit/C10-parent/parent-feedback-after-submit-2026-05-01T00-16-43-468Z.png`, `artifacts/feature-audit/C10-parent/teacher-after-parent-feedback-switch-2026-05-01T00-16-43-468Z.png`
- recommendation：实现 guardian feedback POST/GET，教师沟通页读取同一后端记录。

### C15-002 家长端稍后提醒/日常提醒标记没有提交按钮对应的远端持久化
- severity/status：F2 / not-persisted
- route/account：/parent/agent?child=c-1#feedback / 林妈妈
- persistence/api：lost-after-refresh / local-state-only
- actual：稍后提醒只更新前端 reminders 状态，未观察到 /api 写请求；且函数未调用 persistAppSnapshotNow。
- network：未观察到相关请求
- screenshots：`artifacts/feature-audit/C10-parent/parent-feedback-after-submit-2026-05-01T00-16-43-468Z.png`
- recommendation：新增 reminder status update API，并在按钮处显示同步失败状态。

### C15-003 成长绘本重新生成/保存状态依赖 API + 本地缓存，缺少用户可见持久保存/分享提交
- severity/status：F2 / partial
- route/account：/parent/storybook?child=c-1 / 林妈妈
- persistence/api：unknown / real-api
- actual：重新生成点击 成功触发；请求 POST /api/ai/parent-storybook -> 200；本地 storybook cache keys=0。未发现分享/保存提交按钮真实链路。
- network：POST /api/ai/parent-storybook -> 200; GET /api/ai/parent-storybook/media/4a3a30a6441fda4b82ce117a876b4fef14fbb436 -> 200; GET /api/ai/parent-storybook/media/d1d783c9e67958fedeafecb39e03a6f81b837bdb -> 200; POST /api/ai/parent-storybook -> 200
- screenshots：`artifacts/feature-audit/C10-parent/parent-storybook-after-regen-click-2026-05-01T00-16-43-468Z.png`
- recommendation：补后端 storybook version/save/share 接口并暴露保存结果。

### C15-004 教师晨检记录保存显示成功但 demo 下没有真实持久化 API
- severity/status：F1 / fake-success
- route/account：/health / 李老师
- persistence/api：unknown / local-state-only
- actual：保存后页面提示 未捕获成功文案；写请求 无；localStorage 未含测试备注；刷新页面 正文未直接显示测试备注。
- network：未观察到相关请求
- screenshots：`artifacts/feature-audit/C15-persistence-submit/teacher-health-after-save-2026-05-01T00-16-43-468Z.png`
- recommendation：实现 health-check save API；demo 本地保存应标注本地模式，避免成功提示误导。

### C15-005 教师饮食单餐/批量录入保存没有远端写入，成功 toast 可能误导
- severity/status：F1 / fake-success
- route/account：/diet / 李老师
- persistence/api：unknown / local-state-only
- actual：单餐阶段写请求 无；批量阶段写请求 无；页面成功文案 未稳定出现；localStorage 未确认测试食物。
- network：未观察到相关请求
- screenshots：`artifacts/feature-audit/C15-persistence-submit/teacher-diet-after-single-save-2026-05-01T00-16-43-468Z.png`
- recommendation：新增 meal record single/bulk save API，并将 AI 营养建议与餐次记录一起持久化。

### C15-006 教师成长记录保存仅写本地 store，没有真实 API
- severity/status：F1 / fake-success
- route/account：/growth / 李老师
- persistence/api：unknown / local-state-only
- actual：保存后写请求 无；localStorage 未含测试成长记录；刷新正文 可见。
- network：未观察到相关请求
- screenshots：`artifacts/feature-audit/C15-persistence-submit/teacher-growth-after-save-2026-05-01T00-16-43-468Z.png`
- recommendation：实现 growth records POST/GET，并按 childId 权限同步到家长端。

### C15-007 教师家园沟通回复是本地 React 状态，刷新即丢失
- severity/status：F1 / not-persisted
- route/account：/teacher/agent?action=communication / 李老师
- persistence/api：lost-after-refresh / no-api
- actual：发送阶段写请求 无；发送后页面 显示测试回复；刷新后 丢失。
- network：未观察到相关请求
- screenshots：`artifacts/feature-audit/C15-persistence-submit/teacher-communication-after-reply-2026-05-01T00-16-43-468Z.png`
- recommendation：实现 communication replies API 与消息状态机，刷新从后端读历史。

### C15-008 健康材料解析可以调用 AI 接口，但“归档完成/确认无误”没有真实保存动作
- severity/status：F1 / partial
- route/account：/teacher/health-file-bridge / 李老师
- persistence/api：no-submit / real-api
- actual：解析请求 POST /api/ai/health-file-bridge -> 200；页面出现 确认无误，归档文案，但未发现可点击归档提交按钮或保存请求。
- network：POST /api/ai/health-file-bridge -> 200
- screenshots：`artifacts/feature-audit/C15-persistence-submit/teacher-health-file-after-parse-2026-05-01T00-16-43-468Z.png`
- recommendation：在解析结果后增加人工确认归档动作，写入 health document/health record 后端表。

### C15-009 高风险会诊生成结果写入本地 store，跨角色同步声明缺少真实持久化证据
- severity/status：F1 / partial
- route/account：/teacher/high-risk-consultation / 李老师
- persistence/api：unknown / real-api
- actual：会诊请求 POST /api/ai/high-risk-consultation/stream -> 200；页面文案 声称已同步三端；后续提醒点击后没有观察到写 API。
- network：POST /api/ai/high-risk-consultation/stream -> 200
- screenshots：`artifacts/feature-audit/C15-persistence-submit/teacher-consultation-after-generate-2026-05-01T00-16-43-468Z.png`
- recommendation：会诊完成后调用 consultation persistence API，并让园长/家长端从同一后端读取。

### C15-010 园长 AI 建议可请求但建议处理/派单依赖通知事件后端，可用性不稳定
- severity/status：F2 / partial
- route/account：/admin/agent / 陈园长
- persistence/api：unknown / unknown
- actual：AI/建议请求 无；派单/处理请求 无；页面 显示通知派单暂不可用。
- network：未观察到相关请求
- screenshots：`artifacts/feature-audit/C15-persistence-submit/director-agent-after-action-2026-05-01T00-16-43-468Z.png`, `artifacts/feature-audit/C15-persistence-submit/director-dispatch-after-click-2026-05-01T00-16-43-468Z.png`
- recommendation：确保 notification-events 本地/演示环境有可写持久层，并在 UI 上区分派单不可用与成功。

### C15-011 园长周报可生成/刷新但没有保存为周报记录的提交链路
- severity/status：F2 / partial
- route/account：/admin/agent?action=weekly-report / 陈园长
- persistence/api：no-submit / real-api
- actual：周报阶段请求 POST /api/ai/admin-agent -> 200；页面有周报内容/规则兜底，但未发现保存周报按钮或持久化请求。
- network：POST /api/ai/admin-agent -> 200
- screenshots：`artifacts/feature-audit/C15-persistence-submit/director-weekly-after-generate-2026-05-01T00-16-43-468Z.png`
- recommendation：明确周报是否需要归档；若需要，新增 weekly reports save/list API。

### C15-012 幼儿档案新增显示保存成功但 demo 下仅本地持久化，编辑功能未开放
- severity/status：F1 / fake-success
- route/account：/children / 陈园长
- persistence/api：unknown / local-state-only
- actual：新增阶段写请求 无；页面 未稳定显示新增幼儿；localStorage 未确认。删除确认弹窗已打开但未点击最终删除；详情里显示“编辑档案（暂未开放）”。
- network：未观察到相关请求
- screenshots：`artifacts/feature-audit/C15-persistence-submit/director-children-after-add-2026-05-01T00-16-43-468Z.png`, `artifacts/feature-audit/C15-persistence-submit/director-children-delete-modal-not-confirmed-2026-05-01T00-16-43-468Z.png`
- recommendation：新增 children create/update APIs；启用编辑表单；demo 本地保存明确标识。

### C15-013 共享健康/成长/饮食表单共用本地 store 保存模型，缺少统一提交持久化层
- severity/status：F1 / fake-success
- route/account：/health; /growth; /diet / 李老师
- persistence/api：persisted / local-state-only
- actual：三个页面保存阶段均未观察到业务记录写 API：health=无；growth=无；diet=无。成功 toast 先出现，本地存储承担持久化。
- network：未观察到相关请求
- screenshots：`artifacts/feature-audit/C15-persistence-submit/teacher-health-after-save-2026-05-01T00-16-43-468Z.png`, `artifacts/feature-audit/C15-persistence-submit/teacher-growth-after-save-2026-05-01T00-16-43-468Z.png`, `artifacts/feature-audit/C15-persistence-submit/teacher-diet-after-single-save-2026-05-01T00-16-43-468Z.png`
- recommendation：抽象统一 record persistence layer；保存按钮按 API 结果展示成功/失败，并增加刷新/跨角色 E2E。
