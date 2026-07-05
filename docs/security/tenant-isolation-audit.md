# T8A 租户隔离审计

审计日期：2026-07-05

范围：开放注册真实数据库版上线后的多租户隔离风险。本文只记录当前代码事实和 T8B 修复建议，不修改注册、登录、数据库结构或业务代码。

结论概览：

- Next 业务 API 的主路径基本通过 `requireSession`、`AppDataService`、`scopeSnapshotForSessionUser` 和 `app_state_snapshots where institution_id = ?` 做隔离，整体风险较低。
- AI API 已集中使用 `authorizeAiRoute`，但部分路径仍把 `snapshot/currentUser/visibleChildren` 等客户端 payload 作为模型上下文，属于中风险，需要在 T8B 服务端重建上下文。
- FastAPI/brain 与 memory 表目前按内部服务假设运行。若 `/api/v1/*` 被浏览器或公网直接访问，风险会升高为高危。
- teacher 的班级隔离当前主要依赖 `className` 字符串，不是稳定 `class_id`。这不影响本次文档提交，但应作为 T8B 重点风险跟进。

## 1. 隔离模型

### admin

- 身份来源：现有 HMAC `ccs_session` cookie，经 `getCurrentSessionUser()`、`resolveRequestSession()` 或 `requireSession()` 还原为 `SessionUser`。
- 权限边界：只能访问 `session.user.institutionId` 对应机构的数据。
- 当前主防线：`AppDataService` 内的 `requireDirector()`、`requireTeacherAccess()`、`requireReportAccess()`，以及 `DefaultAppDataRepository` 只按当前 session 的 `institutionId` 读取和保存 `app_state_snapshots`。
- 风险点：任何 API 若接受客户端传入的 `institutionId` 作为权限依据，而不是使用 session 中的 `institutionId`，都应视为高风险。

### teacher

- 身份来源：同样来自 `ccs_session` 还原的 `SessionUser`。
- 权限边界：必须先限制在 `session.user.institutionId`，再按教师所属班级限制。如果存在班级结构，应该限制稳定班级标识。
- 当前主防线：`canAccessChild()`、`requireChildAccess()`、`requireClassAccess()` 对儿童和班级数据做 `institutionId + className` 检查。
- 风险点：当前班级隔离主要依赖 `className` 展示字段，改名、重名或历史数据不一致时可能造成跨班授权歧义。

### parent

- 身份来源：同样来自 `ccs_session` 还原的 `SessionUser`。
- 权限边界：只能访问 `session.user.childIds` 明确绑定的儿童，或 `child.parentUserId === session.user.id` 的儿童。
- 当前主防线：`canAccessChild()` 与 `filterChildrenForSessionUser()` 会同时检查 `institutionId`、`childIds` 和 `parentUserId`。
- 风险点：任何浏览器可达 API 若只读取 query/body 中的 `child`、`childId`，但没有调用 `requireChildAccess()`，都应视为高风险。

### family workspace

- 身份来源：注册后的真实 parent account，不进入 demo account，也不使用邀请码。
- 权限边界：只能访问 owner 创建并绑定到当前 parent 的家庭数据。
- 当前主防线：`app/api/parent/children/route.ts` 通过 `createParentChildWithConsent()` 创建儿童，写入 `institutionId=session.institutionId` 和 `parentUserId=session.id`，并更新 parent 的 `child_ids`。
- 风险点：家庭工作区数据不应从 demo snapshot 复制到真实账号，也不应允许其他 parent 通过伪造 `childId` 读取。

## 2. API 清单

风险等级定义：

- low：路由使用 `requireSession` 加 `AppDataService`/scope guard，或 `/api/state` 按 `app_state_snapshots where institution_id = ?` 查询后再裁剪。
- medium：路由有角色 guard，但仍信任客户端 payload 中的 `snapshot/currentUser/visibleChildren`，或依赖 `className` 字符串做班级隔离，或 FastAPI 仅靠内部网络假设隔离。
- high：浏览器可达路由无 session guard；真实 session 仍可落入未隔离 demo fallback；全量 snapshots/children 无 session、child 或 institution 过滤；客户端 `institutionId` 被当成权限依据。

### Next 业务 API

| API / 文件路径 | 当前如何获取 session | 当前如何获取 institution_id / childIds | 查询是否带隔离条件 | 风险等级 | 建议修复方式 |
| --- | --- | --- | --- | --- | --- |
| `app/api/state/route.ts` | `getCurrentSessionUser()` | `session.institutionId`、`session.childIds` | GET/PUT 都查询 `app_state_snapshots where institution_id = ?`，返回前用 `scopeSnapshotForSessionUser()` 裁剪，PUT 用 `mergeScopedSnapshotForSessionUser()` 合并 | low | 保持禁止 demo 写入；补 parent 伪造 `childId`、teacher 跨班、admin 跨机构的 `/api/state` 回归测试。 |
| `app/api/children/route.ts`、`app/api/children/[childId]/route.ts`、`archive` | `serviceFor(request)` -> `requireSession()` | `SessionUser.institutionId/className/childIds` | `listChildren()` 只返回 `canAccessChild()` 允许的 children；单个 child 走 `requireChildAccess()`；创建/归档要求 director | low | 保留服务层作为唯一入口；T8B 增加 parent query 伪造 child 的 403/不可见测试。 |
| `app/api/teachers/route.ts`、`app/api/teachers/[teacherId]/route.ts`、`archive` | `serviceFor(request)` -> `requireSession()` | `session.institutionId` | 教师管理要求 `requireDirector()`，目标 teacher 通过 `requireTeacherAccess()` 限定同机构 | low | 增加 admin 跨 `institutionId` 修改 teacher 的失败测试。 |
| `app/api/records/route.ts`、`app/api/records/[recordId]/route.ts`、`archive` | `serviceFor(request)` -> `requireSession()` | childId 来自 query/path/body，权限来自 session | child 记录读写都通过 `requireChildAccess()` 或 `canAccessChild()` | low | 确认所有新增 record type 继续绑定 childId，不接受裸 `institutionId`。 |
| `app/api/feedback/route.ts`、`app/api/feedback/[feedbackId]/route.ts` | `serviceFor(request)` -> `requireSession()` | feedback 关联 child，再用 session 校验 | 列表按可见 child 过滤；详情和状态更新走 `requireFeedbackViewAccess()` | low | 补 parent 访问他人 feedbackId 的失败用例。 |
| `app/api/messages/route.ts`、`read`、`reply` | `serviceFor(request)` -> `requireSession()` | message/conversation 关联 child，或 query childId | 列表按 `canAccessChild()` 过滤；回复走 `requireConversationReplyAccess()` | low | 保持 reply 不信任客户端 role/currentUser；增加跨 child conversation 测试。 |
| `app/api/reminders/route.ts`、`app/api/reminders/[reminderId]/route.ts` | `serviceFor(request)` -> `requireSession()` | reminder 关联 child 或 scope | 服务层按 child 权限过滤和写入 | low | 为 parent 删除或更新他人 child reminder 增加测试。 |
| `app/api/assignments/route.ts`、`app/api/assignments/[assignmentId]/route.ts` | `serviceFor(request)` -> `requireSession()` | assignment 关联 child/class/institution | 服务层按 child/class/director scope 判断 | low | teacher assignment 的 class 继续避免只靠客户端 className。 |
| `app/api/attachments/route.ts`、`app/api/attachments/[attachmentId]/route.ts`、`content` | `serviceFor(request)` -> `requireSession()` | `resolveAttachmentScope()` 从 child/report/feedback/material/consultation/storybook 解析，再回到 session scope | child 相关附件走 child/report/feedback/material/consultation/storybook 权限；institution 附件要求 director | low | 禁止新增未声明 scope 的附件类型；补 content 下载跨租户测试。 |
| `app/api/health-materials/route.ts`、`app/api/health-materials/[materialId]/route.ts`、`parse` | `serviceFor(request)` -> `requireSession()` | material 关联 child 或机构，权限来自 session | child material 走 child access，机构 material 走 director scope | low | parse 结果写回时继续要求 material 所属 scope。 |
| `app/api/consultations/route.ts`、`status`、`notes` | `serviceFor(request)` -> `requireSession()` | consultation 关联 child | 查询和状态/notes 更新通过 child access 或可见 feedback/consultation scope | low | 补 parent 访问他人 consultationId 的失败测试。 |
| `app/api/weekly-reports/route.ts`、`[reportId]`、`share`、`export`、`archive` | `serviceFor(request)` -> `requireSession()` | report scope 来自 child/class/institution，权限来自 session | `canAccessReport()`、`requireReportAccess()` 校验 report scope；institution report 仅 admin；class report 走 class access；child report 走 child access | low | T8B 应把 teacher class report 从 `className` 迁移到稳定 class id 或兼容映射。 |
| `app/api/storybooks/route.ts`、`[storybookId]`、`share`、`export` | `serviceFor(request)` -> `requireSession()` | storybook 关联 child | 列表、详情、生成、分享和导出均通过 child access 或 `canAccessChild()` | low | 保持 query `child` alias 只作为 childId 输入，不能绕过 `requireChildAccess()`。 |
| `app/api/storybooks/lin-xiaoyu/tts/route.ts` | `resolveRequestSession()` | 固定 storybook childId 经 `resolveLinXiaoyuChildId()`，再用 session 校验 | 只允许固定 `LIN_XIAOYU_CHILD_ID`，并调用 `requireChildAccess()` | low | 如果未来支持任意 storybook TTS，必须按 storybook.ownerChildId 做服务端校验。 |
| `app/api/analytics/director-dashboard/route.ts`、`admin/summary`、`admin/quality-metrics` | `serviceFor(request)` -> `requireSession()` | `session.institutionId` | director/admin analytics 要求 director，并按当前机构 snapshot 聚合 | low | 禁止从 query 接受 `institutionId` 覆盖 session；补跨机构 admin 参数测试。 |
| `app/api/analytics/teacher-workbench/route.ts`、`trends`、`parent-home`、`app/api/children/[childId]/trend/route.ts` | `serviceFor(request)` -> `requireSession()` | childId/classId 来自 query/path，权限来自 session | child trend 走 `requireChildAccess()`；class trend 走 `requireClassAccess()`；parent home 要求 child access | low | teacher class 仍建议从 `className` 迁移到稳定 class id；parent trend 保持 childId 必填和校验。 |
| `app/api/parent/children/route.ts` | `requireSession()` | `session.institutionId`、`session.id`，并锁定 parent `app_users` row | 只允许 normal parent；创建 child 写入当前 institution 和 parentUserId，并更新 parent `child_ids` | low | 保留 consent 记录与 parent row 校验；补同机构其他 parent 不能接管 child 的测试。 |
| `app/api/admin/notification-events/route.ts` | `resolveRequestSession()` | `session.user.institutionId` | legacy DB list/update 均使用 `where institution_id = ?`；同时 admin 路径要求 role admin | low | 禁止从 query/body 传入 institutionId；补 admin 跨机构 eventId 更新失败测试。 |
| `app/api/auth/session/route.ts` | `getCurrentSessionUser()` | session 直接来自 cookie | 只返回当前用户 session，不查询业务数据 | low | 避免把全量 childIds 以外的机构数据塞进 session 响应。 |

### Next AI / voice API

| API / 文件路径 | 当前如何获取 session | 当前如何获取 institution_id / childIds | 查询是否带隔离条件 | 风险等级 | 建议修复方式 |
| --- | --- | --- | --- | --- | --- |
| `app/api/ai/teacher-agent/route.ts` | `authorizeAiRoute(request, { requiredRole: "staff" })` | guard 从 session、URL/body/snapshot/currentUser/visibleChildren 中收集 child/class hints | guard 对收集到的 child/class 调用服务端 scope 校验；业务上下文仍可能来自客户端 payload | medium | T8B 优先改为服务端按 session 重建 teacher 可见 children 和 class context，不信任 `visibleChildren/currentUser`。 |
| `app/api/ai/admin-agent/route.ts` | `authorizeAiRoute(request, { requiredRole: "admin" })` | `session.institutionId`，payload 中可能还有 currentUser/snapshot | role 限制为 admin，但模型上下文若来自 payload 仍需二次约束 | medium | 服务端按 `session.institutionId` 加载 admin context；拒绝客户端传入的 institution override。 |
| `app/api/ai/admin-quality-metrics/route.ts` | `authorizeAiRoute(request, { requiredRole: "admin" })` | `session.institutionId` | admin role guard 后执行质量指标逻辑 | low | 确认内部聚合只从当前机构 snapshot 取数；补跨机构 payload 测试。 |
| `app/api/ai/high-risk-consultation/route.ts` | `authorizeAiRoute(request, { requiredRole: "staff" })` | payload 要求 `targetChildId`，guard 会收集并校验 | 有 child scope 校验，但 payload 包含 presentChildren、visibleChildren、records 等客户端上下文 | medium | 服务端使用 `targetChildId` 加载授权 child 及相关 records，丢弃客户端传来的 sibling/visible children 列表。 |
| `app/api/ai/high-risk-consultation/stream/route.ts` | `authorizeAiRoute(request, { requiredRole: "staff" })` | 同 high-risk consultation | SSE 路径有同样 child scope guard，但仍依赖客户端上下文生成 | medium | 与非 stream 路径共用服务端 context builder，并为 teacher 跨班写测试。 |
| `app/api/ai/high-risk-consultation/feed/route.ts` | `authorizeAiRoute(request, { requiredRole: "staff", requireScopedNormalSession: true, allowUnscoped: true })` | guard 要求 normal account 必须有可校验 scope hints | brain 不可用或空结果时有本地 feed fallback；历史审计已标记过 unscoped demo fallback 风险 | medium | T8B 应要求 feed fallback 也从当前 session 的 scoped snapshot 生成，不能返回固定 demo feed。若真实账号无 scope，直接 403/limited。 |
| `app/api/ai/weekly-report/route.ts` | 先 `authorizeAiRoute(... allowUnscoped)`，解析 payload 后再按 role 授权，normal account 要求 scoped | child/class/institution scope 来自 payload 和 session 校验 | 有 scoped normal session 防线；report context 仍有 payload 输入 | medium | 服务端按 report scope 从 snapshot 加载 records，禁止客户端提交完整可见数据集。 |
| `app/api/ai/parent-storybook/route.ts` | `authorizeAiRoute(request, { requiredRole: "parent", collectJsonClassNames: false })` | request childId 必须与 `payload.snapshot.child.id` 一致，demo seed 仅 demo account | 后续要求 childId 存在且与 snapshot child 匹配，guard 校验 child access | low | 保持 demo seed 只允许 demo；补 parent 伪造 snapshot.child.id 的测试覆盖。 |
| `app/api/ai/parent-storybook/media-status/route.ts` | `authorizeAiRoute(request, { requiredRole: "parent", collectJsonClassNames: false })` | payload childId、story.childId、storyId | 校验 story.childId 必须等于 childId，再由 guard 校验 child access | low | 继续要求 media 写入必须绑定 ownerChildId。 |
| `app/api/ai/parent-storybook/media/[mediaKey]/route.ts` | `authorizeAiRoute(request, { requiredRole: "parent", allowUnscoped: true })` | 本地 cache 的 `ownerChildId` 用于 `requireChildAccess()` | 有 ownerChildId 时校验 child access；无 ownerChildId 返回 limited/scope_required；未命中本地时可能转发 brain | medium | brain media 转发也应携带并校验 ownerChildId，或禁止无 ownerChildId 的真实账号访问。 |
| `app/api/ai/parent-trend-query/route.ts` | `authorizeAiRoute(request, { requiredRole: "parent", requireScopedNormalSession: true, collectJsonClassNames: false })` | child scope 来自 payload/query，再用 session childIds 校验 | normal parent 必须带可校验 child scope | low | 保持 query childId 必填；补 parent 伪造 childId 的测试。 |
| `app/api/ai/parent-message-reflexion/route.ts` | `authorizeAiRoute(request, { requiredRole: "parent", collectJsonClassNames: false })` | child scope 多来自 nested snapshot child | guard 会收集 snapshot childId，但 route 仍使用客户端 snapshot 做生成上下文 | medium | 服务端用授权 childId 读取 message/feedback context，拒绝含多个 child 的 payload。 |
| `app/api/ai/suggestions/route.ts` | `authorizeAiRoute(request, { requiredRole: "parent", collectJsonClassNames: false })` | child scope 多来自 payload snapshot/source | 有 guard，但上下文仍可能由客户端提供 | medium | 和 parent reflexion 一样改为服务端重建 parent child context。 |
| `app/api/ai/follow-up/route.ts` | `authorizeAiRoute(request, { requiredRole: "parent", collectJsonClassNames: false })` | child scope 多来自 payload snapshot/child | 有 guard，但缺少 `requireScopedNormalSession` 的显式约束 | medium | 要求 normal parent 必须带 child scope，并从服务端 snapshot 读取 follow-up source。 |
| `app/api/ai/health-file-bridge/route.ts` | `authorizeAiRoute(request, { requiredRole: "staff" })` | child scope 由 payload/bridge source 中的 childId 触发 guard | 有 staff role 和 child scope 校验；写回 brain memory 时依赖内部服务 | medium | 写回前服务端确认 child 属于当前 teacher/admin scope；FastAPI memory writeback 增加服务到服务鉴权。 |
| `app/api/ai/teacher-voice-understand/route.ts`、`teacher-voice-upload` | `authorizeAiRoute(request, { requiredRole: "staff" })` | voice payload 中的 child/context hints 由 guard 收集 | staff role guard 存在；语音识别结果和上下文仍需绑定服务端 scope | medium | 解析后的 command/action 执行前统一走 `requireChildAccess()` 或 command permission。 |
| `app/api/ai/vision-meal/route.ts` | `authorizeAiRoute(request, { requiredRole: "staff" })` | image/meal payload 中 child hints 由 guard 收集 | staff role guard 存在；若 payload 无 child scope，可能只做角色级授权 | medium | 对真实账号要求 meal/vision 写入必须有 childId，并在服务端校验 child access。 |
| `app/api/ai/voice-asr/route.ts` | `authorizeAiRoute(request, { allowUnscoped: true })` | 不直接查询 child/institution 数据 | 只做 ASR/provider 能力，允许无 child scope | low | 保持为纯转写，不在该路由返回业务数据。 |
| `app/api/ai/diet-evaluation/route.ts` | `authorizeAiRoute(request, { allowUnscoped: true })` | payload 是营养输入文本，不强制 childId | 不直接查询租户数据，但可转发 brain 或 fallback 生成 | medium | 若未来写回 meal/record，必须要求 childId 并调用 child access；当前保持只读/生成。 |
| `app/api/ai/intent-router/route.ts` | `authorizeAiRoute(request, { allowUnscoped: true })`，若 `roleHint` 存在会再次按 role 授权 | session role 和可选 roleHint | 不直接读业务数据；用于意图路由 | low | 不允许 roleHint 提升权限；后续实际执行仍要走业务 API/service。 |
| `app/api/ai/provider-status/route.ts` | `authorizeAiRoute(request, { allowUnscoped: true })` | 不使用 childIds | 只返回 provider 状态 | low | 避免泄露密钥、端点或租户数据。 |
| `app/api/ai/stream/route.ts`、`react-agent` | `authorizeAiRoute(... normalAccountAccess: "demo-only")` 或同等限制 | normal 真实账号被阻断 | demo-only 路径不服务真实开放注册账号 | low | 保持真实账号不可用，直到有完整服务端 scope。 |
| `app/api/voice-assistant/commands/route.ts`、`lib/voice-assistant/command-bus.ts` | route 下沉到 `planAssistantCommand()`、`executePlannedAssistantCommand()`，内部 `requireSession()` | `buildAssistantParseContext()` 从当前 session 加载 scoped snapshot，再构造 children/allChildren/teachers | children/reminders/storybooks 按 `canAccessChild()` 过滤；teacher list 按 role 和 institution/class 限制；执行前走 command permission | low | 继续禁止 command 直接携带越权 childId；为 execute 阶段补跨 child confirmation token 测试。 |

### FastAPI / brain / memory / DB 逻辑

| API / 文件路径 | 当前如何获取 session | 当前如何获取 institution_id / childIds | 查询是否带隔离条件 | 风险等级 | 建议修复方式 |
| --- | --- | --- | --- | --- | --- |
| `backend/app/api/v1/endpoints/agents.py` | 无浏览器 session；当前假设只被 Next server 或内部网络调用 | 从请求 payload 或内部 repository 构造上下文 | FastAPI 层自身没有 HMAC session guard；依赖 Next 代理完成授权 | medium | 生产环境必须保持内网不可直达，或增加服务到服务签名和 scope claim。若公网可达应视为 high。 |
| `backend/app/api/v1/endpoints/memory.py` | 无浏览器 session；当前假设内部调用 | `/memory/context` 使用请求中的 `child_id`，writeback 使用 payload child/workflow | endpoint 层没有 institution 校验；memory service 按 child_id 查询 | medium | 增加服务到服务认证；Next 调用时传入已授权 child scope，并在 FastAPI 层验证签名。 |
| `backend/app/db/mysql.py` | DB helper 无 session 概念 | `child_profile_memory`、`agent_state_snapshots`、`agent_trace_log` 主要按 `child_id/session_id` | memory 表缺少 `institution_id`；`list_recent_snapshots()` 如果无 child/session/type 条件可构造全量 snapshots 查询 | medium | 给 memory 表补 `institution_id` 或通过 signed scope 强制 child filter；禁止任何调用无条件列出 snapshots。 |
| `backend/app/db/childcare_repository.py` | 无 session 概念 | `ChildcareRepository.create(..., institution_id=...)` 使用调用方传入的 institution_id | 有 institution_id 时查询 `app_state_snapshots where institution_id = %s`；若调用方传错则 repository 本身不知权限 | medium | repository 只能接收 Next 签名后的 institution scope；不要让浏览器或 AI payload 决定 institution_id。 |
| `lib/server/memory-context.ts` | 调用方应已在 Next 路由完成 `authorizeAiRoute` 或 service 校验 | 向 brain 发送 `child_id/workflow_type/options` | 本模块本身不校验 child access，只负责转发 | medium | 调用前必须统一要求 `requireChildAccess()`；在 helper 注释或类型上表达“已授权 childId”。 |
| `lib/server/app-data-repository.ts` | 接收 `SessionUser` | `session.institutionId` | real DB 模式读取和保存均按 `app_state_snapshots where institution_id = ?` 或 upsert 当前 institution | low | 保持 repository 不接受客户端 institution override。 |
| `lib/persistence/state-scope.ts` | 接收 `SessionUser` | `session.institutionId/className/childIds/id` | `scopeSnapshotForSessionUser()` 裁剪 children、attendance、meals、growth、feedback、health、tasks、messages、consultations、storybooks 等桶 | low | `isAuthorizedParentChildId()` 目前偏向 `childIds`，建议和 `parentUserId` 语义保持一致并补测试。 |
| `lib/server/scope.ts` | 接收 `SessionUser` | `session.institutionId/className/childIds/id` | `canAccessChild()` 先校验 institution，再按 admin/teacher/parent 角色判断 | low | teacher 班级从 `className` 迁移到稳定 class id；parent 保持 childIds 与 parentUserId 双重兼容。 |
| `lib/server/ai-route-guard.ts` | `requireSession()` | 从 session 和 payload hints 收集 childIds/classNames | 对 hints 调用 `requireChildAccess()`、`requireClassAccess()`；可配置 `requireScopedNormalSession` | medium | 不能把 guard 当作上下文可信化工具；T8B 应要求 AI route 在服务端重建上下文。 |

## 3. 高风险点列表

1. 无条件读全量 children

   当前 Next 业务 API 未发现浏览器可达的全量 children 读取；`AppDataService.listChildren()` 和 `/api/state` 都按 session scope 裁剪。T8B 应防止新增 API 直接返回 `snapshot.children`，尤其是 AI route 或 debug route。

2. 无条件读全量 snapshots

   `/api/state` 和 `DefaultAppDataRepository` 已使用 `app_state_snapshots where institution_id = ?`。风险集中在 memory 侧：`backend/app/db/mysql.py` 的 `list_recent_snapshots()` 支持无 child/session/type 条件的查询形态。只要该能力被未授权 endpoint 暴露，就会变成高危。

3. parent 可通过 query `child=xxx` 或 `childId=xxx` 访问别人孩子

   业务 API 主路径当前由 `requireChildAccess()` 挡住。仍需重点测试 `storybooks` 的 `child` alias、`parent-trend-query`、`parent-storybook/media`、`parent-message-reflexion`、`suggestions`、`follow-up` 这类 AI 入口，避免只因 payload 中出现 childId 就把客户端 snapshot 当作可信数据。

4. admin 可通过 `institutionId` 参数访问别人机构

   当前主要业务 API 使用 session 中的 `institutionId`，未发现以 query/body `institutionId` 作为权限依据的主路径。FastAPI 的 `ChildcareRepository.create(... institution_id=...)` 和任何 brain payload 中的 institution 字段不能暴露给浏览器作为授权来源。

5. teacher 可跨班级

   当前防线是 `institutionId + className`。它能阻止多数跨班访问，但 className 是展示字段，不是稳定授权标识。班级重名、改名或迁移时可能造成授权歧义，T8B 应作为中高优先级修复。

6. high-risk consultation fallback 可能绕过真实 scope

   `high-risk-consultation/feed` 有 guard，但本地 feed fallback 曾作为历史高风险点出现。真实账号下 fallback 必须从当前 session 可见 child 集合生成，不能返回固定 demo 数据或全机构数据。

7. FastAPI 内部路由暴露

   `backend/app/api/v1/endpoints/agents.py` 和 `memory.py` 自身没有浏览器 session 校验。如果部署或代理配置让浏览器直接访问这些路径，应立即视为高危并加服务签名或网络隔离。

8. memory 表缺少 `institution_id`

   `child_profile_memory`、`agent_state_snapshots`、`agent_trace_log` 主要按 `child_id/session_id` 隔离。若 childId 不全局唯一、或存在测试/demo/真实混用，可能出现跨租户读取风险。

9. AI route 信任客户端 context

   `teacher-agent`、`admin-agent`、`high-risk-consultation`、`weekly-report`、parent 相关 AI route 都有 auth guard，但 prompt context 仍可能来自客户端 `snapshot/currentUser/visibleChildren`。这会扩大越权注入和混租数据回传风险。

10. demo fallback 与真实账号混用

   开放注册后真实用户不能写入 demo account，也不能在真实 session 下拿到 demo child/story/feed。任何 fallback 都必须检查 `session.accountKind` 或等价字段。

## 4. T8B 修复清单

1. 为 FastAPI `/api/v1/agents/*` 和 `/api/v1/memory/*` 增加服务到服务签名，或在部署层明确阻断公网和浏览器直连。
2. 禁止 `backend/app/db/mysql.py` 的 snapshot 查询在无 child/session/type 条件下被 endpoint 调用；为 memory 查询强制 child scope。
3. 给 memory 表和写回链路补 `institution_id`，或引入签名 scope claim，确保 child memory 无法跨机构读取。
4. 将 `teacher` 班级隔离从 `className` 字符串迁移到稳定 class id，保留历史 className 兼容映射。
5. 改造 `teacher-agent`、`admin-agent`、`high-risk-consultation`、`weekly-report`：只接受 scope id，服务端按 session 重建 prompt context。
6. 改造 parent AI route：`parent-message-reflexion`、`suggestions`、`follow-up`、`parent-trend-query` 统一要求授权 childId，并从服务端 snapshot 读取数据。
7. 修复 `high-risk-consultation/feed` fallback：真实账号 fallback 只能使用当前 session 可见 child；无 scope 时返回 403/limited。
8. 为 `parent-storybook/media/[mediaKey]` 的 brain 转发路径补 ownerChildId 校验，禁止真实账号访问无 ownerChildId 的 media。
9. 补齐权限回归测试：parent 伪造 childId、teacher 跨班、admin 伪造 institutionId、AI payload 夹带他人 child snapshot、FastAPI 直连被拒。
10. 建立新增 API checklist：所有真实数据 API 必须说明 session 来源、scope 来源、查询过滤条件和 demo fallback 行为后才能合入。
## T8B 修复状态（2026-07-05）

已完成：

- 新增 `lib/server/session-scope.ts`，AI route 可从当前 `ccs_session` 加载真实 `DefaultAppDataRepository` snapshot，并生成 `scopedSnapshot`、`visibleChildren`、`authorizedChildIds` 和服务端 signed scope claim。
- `teacher-agent`、`admin-agent`、`high-risk-consultation`、`weekly-report`、`parent-message-reflexion`、`suggestions`、`follow-up`、`parent-trend-query` 改为在 Next 服务端用 session scope 重建或替换业务上下文，不再把前端传入的 `institutionId/currentUser/visibleChildren/appSnapshot` 当作授权数据源。
- `high-risk-consultation/feed` 的 normal account fallback 改为只从当前 session 可见 children/consultations 生成；无可见 child scope 返回 `423 scope_required`，不再给真实账号返回固定 demo feed。
- `parent-storybook/media/[mediaKey]` 对 cached media 继续校验 `ownerChildId`；真实账号缓存未命中时不再转发到 brain 拉取无 owner scope 的媒体。
- FastAPI `/api/v1/agents/*` 和 `/api/v1/memory/*` 增加内部服务验签。`/memory/context` 与 `/memory/health-file-bridge-writeback` 校验 payload `child_id` 必须包含在 signed scope claim 的 `childIds` 中。
- `list_recent_snapshots` 禁止无 `child_id/session_id/snapshot_types` 的零过滤调用；兼容 `list_memory` 改为显式 snapshot type 过滤。

剩余 TODO：

- teacher 班级隔离仍以 `institutionId + className` 为边界。本轮在代码中保留 `TODO(T8B-classId)`，后续需要迁移到稳定 `classId` 并保留历史 className 映射。
- memory 物理表仍缺少 `institution_id` 字段。本轮通过 Next signed scope claim 和 FastAPI child scope 校验隔离读写，后续应补数据库字段与迁移脚本，形成物理租户边界。
- 部分纯 provider/多模态 route 当前不读业务数据；若未来把结果写回真实 child record，必须先接入 `getSessionScope`/`requireScopedChild`。
