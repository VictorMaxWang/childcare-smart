# C13 Browser Use：家园沟通与消息闭环审计

你执行 C13，只审计沟通、消息、反馈闭环，不修业务源码。

## 输出文件

- JSON findings：`docs/feature-audit/findings/C13-chat-communication.json`
- Markdown 报告：`docs/feature-audit/findings/C13-chat-communication.md`
- 截图/证据目录：`artifacts/feature-audit/C13-chat-communication/`

只写以上文件，不要编辑 `INCOMPLETE_FEATURES.json`。

## 审计范围

- Demo 账号：林妈妈、李老师、周老师，必要时陈园长。
- 路由：`/parent/agent?child=c-1#feedback`、`/teacher`、`/teacher/agent`、`/admin`、相关沟通入口。
- 功能：家长发消息/反馈、教师回复、消息状态、已读/待处理、跨角色可见性、刷新持久化。

## 操作要求

1. 家长端提交一条可识别的反馈或回复内容。
2. 记录是否发起真实请求，是否有成功/失败反馈。
3. 刷新家长页面，看消息是否存在。
4. 登录教师账号，查找同一消息是否可见、可回复、可标记处理。
5. 刷新教师页面，再回到家长端检查回复是否可见。
6. 如果只是 AI 生成建议但没有消息存储，记录为沟通链路不完整。

## Finding 要求

- `findingId` 使用 `C13-001` 递增。
- `featureArea` 优先使用 `parent-communication`、`teacher-communication` 或 `shared-communication`。
- fake success、跨角色数据错乱、消息提交到错误孩子/班级时优先 F0/F1。
- `evidence.networkRequests` 必须标出发送消息、读取消息、回复消息各自是否存在。

## 报告内容

Markdown 报告包含：

- 家长到教师、教师到家长的链路覆盖情况。
- 每个链路节点的状态：complete、partial、ui-only、mock-only 等。
- 建议先实现哪些沟通功能。

