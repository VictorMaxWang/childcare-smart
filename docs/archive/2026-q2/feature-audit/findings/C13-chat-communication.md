# C13 家园沟通专项功能审计

## 结论摘要

- 审计范围：家长发起反馈、教师查看、教师回复、家长回看、园长查看、AI 沟通建议。
- 审计方式：先尝试 Browser Use；因 node_repl 使用系统 Node v22.20.0，低于插件要求的 >= v22.22.0，Browser Use 初始化失败。随后使用 Playwright Chromium 真实浏览器自动化完成点击、输入、提交、刷新、退出登录、跨账号检查和网络记录。
- Base URL：`http://127.0.0.1:3000`
- 测试消息：`C13-parent-feedback-2026-04-30T23-54-44-366Z`
- 教师回复：`C13-teacher-local-reply-2026-04-30T23-58-26-304Z`
- 是否存在真实消息闭环：不存在。家长反馈只进入林妈妈本地 demo storage，教师端列表由班级上下文合成，教师回复只进 React state，刷新丢失，家长回看不到回复。

## 覆盖结果

| 场景 | 角色 | 结果 | featureStatus | 严重程度 |
| --- | --- | --- | --- | --- |
| 家长发起反馈 | 林妈妈 | 可提交 UI，但无真实发送 API，写本账号 localStorage，教师/园长不可见 | backend-missing | F1 |
| 教师查看家长消息 | 李老师 / 周老师 | 李老师未看到林妈妈测试消息；列表是 classContext 合成项；周老师未见向阳班内容但不是基于真实消息权限验证 | mock-only | F1 |
| 教师回复家长 | 李老师 | 点击后“我发起的”立即出现，但无网络请求，刷新丢失 | fake-success | F1 |
| 家长查看教师回复 | 林妈妈 | 重新登录后看不到教师回复，没有消息列表 API | backend-missing | F1 |
| 园长查看反馈 | 陈园长 | 有汇总/风险 UI 和 notification-events API，但看不到林妈妈真实提交内容 | partial | F2 |
| AI 沟通建议 | 李老师 | `/api/ai/teacher-agent` 请求真实返回，但未插入真实回复链路，也不发送/持久化 | partial | F2 |

## 关键证据

### 家长提交

- 路径：`/login` -> 林妈妈 -> `/parent/agent?child=c-1#feedback`
- 操作：填写测试内容后点击提交反馈。
- 网络：只观察到 `POST /api/ai/suggestions 200` 和 `POST /api/ai/parent-message-reflexion 200`，没有家园消息发送 API，也没有 `/api/state` 写入。
- 持久化：测试内容出现在 `childcare.demo:v4-demo-recovery-hotfix:u-parent.feedback.v3` localStorage 中，但刷新后没有作为沟通记录展示。
- 跨账号：李老师、周老师、陈园长均未看到该测试内容。
- 截图：
  - `artifacts/feature-audit/C13-chat-communication/parent-feedback-before-submit.png`
  - `artifacts/feature-audit/C13-chat-communication/parent-submit-after-click.png`
  - `artifacts/feature-audit/C13-chat-communication/parent-submit-after-refresh.png`

### 教师查看与回复

- 路径：`/login` -> 李老师 -> `/teacher/agent?action=communication`
- 查看：待回复列表存在 3 条，但没有林妈妈测试消息。
- 代码信号：`app/teacher/agent/page.tsx` 中 `allPendingCommunicationItems` 来自 `classContext.visibleChildren`，`feedbackCommunicationItems` 来自 `classContext.weeklyFeedbacks`，不是消息列表 API。
- 回复：输入 `C13-teacher-local-reply-2026-04-30T23-58-26-304Z` 后点击“发送本地回复”。
- 网络：点击回复后的 `networkAfterReply` 为空，没有 send/reply/thread API。
- 持久化：回复立即出现在“我发起的”，刷新后消失。
- 截图：
  - `artifacts/feature-audit/C13-chat-communication/teacher-li-communication-mode-open.png`
  - `artifacts/feature-audit/C13-chat-communication/teacher-reply-targeted-draft-filled.png`
  - `artifacts/feature-audit/C13-chat-communication/teacher-reply-targeted-after-send.png`
  - `artifacts/feature-audit/C13-chat-communication/teacher-reply-targeted-after-refresh.png`

### 班级隔离

- 周老师进入 `/teacher/agent?action=communication` 后处于晨曦班上下文。
- 周老师未看到林妈妈测试消息，也未看到李老师本地回复。
- 该结果没有发现跨班泄漏，但由于消息根本未进入共享后端，不能证明真实 classId 权限模型完成。
- 截图：`artifacts/feature-audit/C13-chat-communication/teacher-zhou-communication-mode.png`

### 家长回看

- 李老师回复后重新登录林妈妈。
- 家长端未看到教师回复，也没有 conversation/message/reply 列表 API。
- 截图：`artifacts/feature-audit/C13-chat-communication/parent-recheck-after-teacher-reply.png`

### 园长查看

- 路径：`/login` -> 陈园长 -> `/admin` 和 `/admin/agent`
- 园长端有反馈汇总、反馈风险和派单 UI。
- 网络：`GET /api/admin/notification-events 200`、`POST /api/ai/high-risk-consultation/feed 200`、`POST /api/ai/admin-agent 200`。
- 缺口：未显示林妈妈测试反馈；notification-events 是通知/派单事件，不是家园沟通消息模型。
- 截图：
  - `artifacts/feature-audit/C13-chat-communication/director-home-feedback-summary.png`
  - `artifacts/feature-audit/C13-chat-communication/director-agent-feedback-dispatch.png`
  - `artifacts/feature-audit/C13-chat-communication/director-agent-after-action-attempt.png`

### AI 沟通建议

- 路径：李老师 `/teacher/agent?action=communication`
- 操作：点击沟通项 AI 建议。
- 网络：`POST /api/ai/teacher-agent 200`。
- 结果：AI 建议真实生成，但未基于真实家长消息列表，也未自动插入当前回复草稿；发送仍是本地 state。
- 截图：
  - `artifacts/feature-audit/C13-chat-communication/teacher-ai-suggestion-from-communication-item.png`
  - `artifacts/feature-audit/C13-chat-communication/ai-suggestion-teacher-guide-after-click.png`

## 不完整功能列表

- F1 `C13-001`：家长提交家园反馈只写入本账号本地状态，未形成可跨角色读取的消息。
- F1 `C13-002`：教师家长沟通列表由班级上下文合成，未读取家长真实提交消息。
- F1 `C13-003`：教师回复点击后只进入本地“我发起的”，无网络请求且刷新丢失。
- F1 `C13-004`：家长无法回看教师回复，家长-教师消息闭环不存在。
- F2 `C13-005`：园长端反馈汇总未接入家长真实提交内容，处理动作走通知事件而非家园沟通模型。
- F2 `C13-006`：AI 沟通建议有真实 AI 请求，但未闭环到回复插入、发送和持久化。

## 需要补齐的实现面

- 后端：conversation/message/guardianFeedback/reply 数据模型；发送、列表、回复、已读、处理状态 API；按 parentId、teacherId、directorId、childId、classId 做权限过滤。
- 前端：家长端和教师端从同一消息 API 读取；提交/回复使用 pending/sent/failed 状态；刷新和重新登录恢复服务端数据。
- 产品规则：明确“结构化晚间反馈”是否等同家园沟通消息；园长能看到哪些内容、何时升级为风险/派单；AI 建议插入草稿还是仅供参考。
