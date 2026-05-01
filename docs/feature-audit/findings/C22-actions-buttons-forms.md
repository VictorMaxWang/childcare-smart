# C22 动作扫描：按钮、菜单、表单

- 审计日期：2026-05-01
- 扫描范围：登录页、家长端家园沟通/成长档案/绘本/健康/餐谱/提醒、教师端工作台/沟通/晨检/饮食/成长/材料解析/会诊、园长端看板/AI/周报/管理页、`/children`、`/health`、`/growth`、`/diet`
- 扫描方式：代码静态扫描与关键处理函数人工复核；只记录业务动作缺口，不把 UI 展开、筛选、表单输入、正常导航链接计入问题。

## 汇总

- Findings：16
- 无 onClick：2（C22-001、C22-002）
- console.log only：0
- fake success：7（C22-003、C22-004、C22-005、C22-006、C22-007、C22-008、C22-009）
- local state only：5（C22-010、C22-011、C22-013、C22-014，另 C22-004/C22-008 也有本地态问题）
- no API submit：6（C22-003、C22-006、C22-007、C22-008、C22-010、C22-014）
- 上传/解析缺口：2（C22-009、C22-012）
- 回复/消息缺口：2（C22-010、C22-013）
- 导出/分享缺口：2（C22-015、C22-016）

## 最高优先级

- F0：`/children` 删除会级联移除幼儿及关联记录并 toast 成功，但没有服务端删除、持久化确认或撤销。
- F1：`/health`、`/growth`、`/diet`、`/children` 的保存类动作多数只更新 store 并显示成功，未显式调用 API 或 `persistAppSnapshotNow()`。
- F2：园长周报导出/分享/查看反馈详情、登录忘记密码、教师班级选择、健康材料归档等入口呈现为功能但未实现真实动作。

## 已排除的真实动作

- 登录、注册、体验账号登录：`app/login/page.tsx` 通过 `useApp.login`、`register`、`loginWithDemo` 调用 `/api/auth/*`。
- 家长结构化反馈提交：`app/parent/agent/page.tsx` 在 `submitStructuredFeedback` 中调用 `persistAppSnapshotNow()`，本轮只记录“稍后提醒”分支未持久化。
- 家长/园长周报生成：通过 `fetchWeeklyReport` 调用 `/api/ai/weekly-report`。
- 教师/园长 AI 生成入口：教师工作流、园长 AI 工作流存在 `/api/ai/*` 调用；本轮只记录生成后的保存、派发、回复或归档缺口。
- 园长派单：`useAdminConsultationWorkspace` 通过 `/api/admin/notification-events` 创建/更新通知事件。
- 饮食图片识别：上传图片解析阶段调用 `/api/ai/vision-meal`；问题在确认录入后仍只写本地饮食记录。

## Findings

### C22-001 登录页“忘记密码？”无动作

- severity/category：F2 / no-onClick
- route：`/login`
- source：`app/login/page.tsx:509-512`
- evidence：按钮使用 `type="button"`，只有样式和文案，没有 `onClick`、`Link`、表单提交或禁用说明。
- expected：跳转密码找回流程、打开找回表单，或明确禁用/隐藏。

### C22-002 教师工作台班级下拉外观按钮无动作

- severity/category：F2 / no-onClick
- route：`/teacher/agent`
- source：`app/teacher/agent/page.tsx:1029-1032`
- evidence：按钮展示班级名称并带 `ChevronDown`，但没有 `onClick`、菜单或选择器。
- expected：支持切班则接入班级菜单；不支持则改为静态展示。

### C22-003 儿童档案保存只写本地并假成功

- severity/category：F1 / fake-success, no-api-submit
- route：`/children`
- source：`app/children/page.tsx:131-168`, `app/children/page.tsx:549`
- evidence：`handleSubmit` 调用 `addChild` 后显示 `toast.success("幼儿档案已保存")`，未发现 API 或 `persistAppSnapshotNow()`。
- expected：调用档案创建/更新 API 或统一快照持久化，并根据结果提示。

### C22-004 儿童出勤切换只写本地并假成功

- severity/category：F1 / fake-success, local-state-only
- route：`/children`
- source：`app/children/page.tsx:402-405`, `app/children/page.tsx:436-439`
- evidence：入口只调用 `toggleTodayAttendance(child.id)` 后 `toast.success`，没有出勤 API、持久化快照或失败回滚。
- expected：出勤状态应写入后端或快照，失败时恢复 UI。

### C22-005 儿童档案删除危险且假成功

- severity/category：F0 / dangerous-delete, fake-success
- route：`/children`
- source：`app/children/page.tsx:557-581`
- evidence：删除确认文案说明会清除出勤、饮食、成长与反馈记录；确认后直接 `removeChild(deleteId)` 并 `toast.success("档案已删除")`。
- expected：危险删除应走后端事务或软删除接口，返回成功后再更新 UI，并提供失败处理、审计记录和恢复策略。

### C22-006 晨检保存无 API

- severity/category：F1 / fake-success, no-api-submit
- route：`/health`
- source：`app/health/page.tsx:182-230`, `app/health/page.tsx:845-846`
- evidence：`handleSaveHealthCheck` 调用 `upsertHealthCheck` 后显示“晨检记录已保存”，未发现 API 或 `persistAppSnapshotNow()`。
- expected：晨检保存应持久化到健康记录 API 或统一快照 API。

### C22-007 成长记录保存无 API

- severity/category：F1 / fake-success, no-api-submit
- route：`/growth`
- source：`app/growth/page.tsx:161-189`, `app/growth/page.tsx:503-505`
- evidence：`submitRecord` 调用 `addGrowthRecord` 后 `toast.success("成长记录已保存")` 并清空表单。
- expected：成长记录应写入后端或持久化快照，失败时保留表单内容。

### C22-008 饮食录入/批量录入无 API

- severity/category：F1 / fake-success, no-api-submit
- route：`/diet`
- source：`app/diet/page.tsx:239-255`, `app/diet/page.tsx:360-379`, `app/diet/page.tsx:915`
- evidence：`saveMealRecord` 只调用 `upsertMealRecord`；`confirmApplyBulkTemplate` 只调用 `bulkApplyMealTemplate` 后显示“批量录入已完成”。
- expected：单餐和批量饮食录入应调用 meal record API 或统一快照持久化。

### C22-009 饮食图片解析真实，确认录入仍本地保存

- severity/category：F1 / upload-parse-gap, fake-success
- route：`/diet`
- source：`app/diet/page.tsx:381-425`, `app/diet/page.tsx:1136-1172`, `app/diet/page.tsx:1180-1208`, `app/diet/page.tsx:1378`
- evidence：图片识别调用 `/api/ai/vision-meal`；确认录入走 `confirmVisionFoods -> onSave -> saveMealRecord`，最终只写本地 store。
- expected：解析结果确认后应持久化到饮食记录。

### C22-010 教师家园沟通回复/标记处理没有消息 API

- severity/category：F1 / reply-message-gap, local-state-only
- route：`/teacher/agent?action=communication`
- source：`app/teacher/agent/page.tsx:907-934`, `app/teacher/agent/page.tsx:1123-1125`, `app/teacher/agent/page.tsx:1149-1152`, `app/teacher/agent/page.tsx:1185-1192`
- evidence：`sendCommunicationReply` 只更新 `sentCommunicationItems`、`processedCommunicationIds` 和本地 draft；`markCommunicationHandled` 只更新本地状态。
- expected：回复应创建真实沟通消息，标记已处理应持久化消息状态。

### C22-011 家长“稍后提醒”只保存本地状态

- severity/category：F2 / local-state-only
- route：`/parent/agent#feedback`
- source：`app/parent/agent/page.tsx:918-925`
- evidence：`snoozeFamilyReminder` 只调用 `updateReminderStatus(..., "snoozed")` 并设置本地状态文案，没有 `persistAppSnapshotNow()` 或提醒状态 API。
- expected：稍后提醒应与反馈提交一样持久化，或明确标注本地暂存。

### C22-012 健康材料只有解析，没有真实上传/归档

- severity/category：F1 / upload-parse-gap, no-archive-submit
- route：`/teacher/health-file-bridge`
- source：`app/teacher/health-file-bridge/page.tsx:169-176`, `app/teacher/health-file-bridge/page.tsx:203-222`, `app/teacher/health-file-bridge/page.tsx:431-536`, `app/teacher/health-file-bridge/page.tsx:554-625`
- evidence：文件选择后只转为元数据；解析调用 `/api/ai/health-file-bridge` 并 `setResult`；页面有“确认无误，归档”“归档完成”文案，但没有归档保存按钮或写入健康档案 API。
- expected：接入真实文件上传或明确仅文本解析；解析后提供人工确认归档动作。

### C22-013 高风险会诊讨论/邀请动作只写本地

- severity/category：F1 / reply-message-gap, local-state-only
- route：`/teacher/high-risk-consultation`
- source：`app/teacher/high-risk-consultation/page.tsx:566-570`, `app/teacher/high-risk-consultation/page.tsx:608-610`, `app/teacher/high-risk-consultation/page.tsx:786-818`
- evidence：`sendDiscussionNote` 只写 `discussionNotes`；“发起会诊 / 邀请专家”只展开输入区；侧栏动作只设置提示。
- expected：会诊讨论和专家邀请应写入真实消息、邀请或任务模型。

### C22-014 高风险会诊生成后同步声明缺少持久化证据

- severity/category：F1 / local-state-only, no-api-submit
- route：`/teacher/high-risk-consultation`
- source：`app/teacher/high-risk-consultation/page.tsx:469-490`, `app/teacher/high-risk-consultation/page.tsx:532-542`
- evidence：会诊生成调用 `/api/ai/high-risk-consultation/stream`；完成后只调用 `upsertConsultation`、`upsertInterventionCard`、`upsertReminder` 并显示“已同步教师端、家长端和园长端”。
- expected：生成结果和后续提醒应写入会诊/干预/提醒后端，再显示跨端同步成功。

### C22-015 园长周报导出/分享/查看反馈详情未开放

- severity/category：F2 / export-share-gap, static-detail
- route：`/admin/agent?mode=weekly`
- source：`components/admin/pixel-replica/DirectorWeeklyReportReplica.tsx:109-117`, `components/admin/pixel-replica/DirectorWeeklyReportReplica.tsx:269-283`
- evidence：导出周报、分享周报、查看反馈详情均使用 `ReplicaUnavailableButton`；重新生成周报和派单是可用动作，已排除。
- expected：导出/分享应实现文件生成、下载或分享链接；查看详情应进入反馈明细。

### C22-016 家长绘本缺少保存/分享/导出链路

- severity/category：F2 / share-export-missing
- route：`/parent/storybook`
- source：`app/parent/storybook/page.tsx:340-343`, `app/parent/storybook/page.tsx:472-481`
- evidence：绘本生成/重试调用 `/api/ai/parent-storybook`；页面动作扫描未发现保存、分享或导出入口，生成结果主要依赖本地 cache 与页面状态。
- expected：可留存绘本应提供版本保存、分享或导出链路；若只是临时预览，应在 UI 明确。

