# SmartChildcare Agent 并行线程总控手册

更新基准：`2026-04-08`

本手册是并行线程进入仓库后的**启动协议与协作规则主文档**。它不负责维护当前阶段状态主账本，不负责维护 T1-T31 详细任务表，也不负责维护比赛架构映射；它负责告诉每个新线程：

- 这个项目是什么，不是什么
- 当前真实阶段是什么
- 新线程先读哪些文档
- 自己属于哪类任务
- 该派哪些 subagents
- 哪些模块能改，哪些不该碰
- 什么时候必须回写 `AGENTS.md`、`docs/current-status-ledger.md`、`docs/competition-architecture.md`、`docs/task-registry.md`

## 1. 项目是什么 / 不是什么

SmartChildcare Agent 是一个面向托育场景的**移动端优先、多角色协同、记忆中枢驱动**的 AI 智能体系统。它围绕教师、家长、园长三端，把记录、理解、会诊、行动建议、家庭执行与反馈回流组织成可演示、可答辩、可延长的产品闭环。

它不是：

- 不是普通托育后台外接一个聊天框
- 不是只做单轮问答的 AI demo
- 不是已经 fully live 的线上平台
- 不是 staging、vivo 上游、真实远端链路都已经 fully verified 的系统
- 不是每个线程都能随意扩写叙事、重排主路径、顺手重构的开放工作台

涉及 vivo 能力接入时，只允许使用官方文档口径，并且只允许通过环境变量注入 `VIVO_APP_ID` / `VIVO_APP_KEY`：

- [vivo 官方文档入口](https://aigc.vivo.com.cn/#/document/index?id=1746)

## 2. 当前阶段与最稳定比赛主路径

当前真实阶段统一定义为：

**5 条比赛展示路径已形成稳定演示基线，仓库正在从旧 `T0-T13 / freeze 收口账本` 切换到 `T1-T31` 并行推进控制面。**

当前最稳定比赛主路径固定为：

1. `/teacher`
2. `/teacher/high-risk-consultation`
3. `/admin`
4. `/parent`
5. `/parent/storybook?child=c-1`
6. `/parent/agent?child=c-1`

当前展示位口径固定为：

- 第一展示位：高风险会诊
- 第二展示位：Admin 决策区 / 风险优先级 / 会诊 trace 面板
- Parent storybook：已具展示能力
- Parent trend：已具展示能力，但必须保留 `source`、`dataQuality`、`warnings`
- 前端 36 人 demo：代码中已落地
- 后端 36 人 demo snapshot：仍未对齐完成

## 3. 文档与事实优先级

发生冲突时，统一按下面的优先级处理：

`代码事实 > docs/current-status-ledger.md > docs/competition-architecture.md > README.md / 旧任务地图 / 旧描述`

各文档的单一职责固定为：

- `docs/current-status-ledger.md`
  - 当前阶段、稳定 walkthrough、主展示位、状态边界的主账本
- `docs/competition-architecture.md`
  - 比赛叙事、lane 映射、shared contracts 的主文档
- `docs/task-registry.md`
  - `T1-T31` 详细任务清单、依赖、并行性、推荐 subagents、验收与回写要求的主文档
- `AGENTS.md`
  - 线程启动协议、任务分类法、subagent 协议、并行安全规则、回写规则
- `README.md`
  - 项目身份、当前稳定主路径、文档入口

冲突处理规则：

- 先核代码事实，再修正文档，不要盲目相信旧表述
- 不要把已具展示能力的内容误写回“未开始”
- 不要把代码层接入写成 fully live
- 不要把 staging 写成 `fully healthy` / `fully switched`
- 不要夸大 vivo 上游真实状态

## 4. 并行线程启动协议

每个新线程进入仓库后，默认按下面顺序启动：

1. 先读 `docs/current-status-ledger.md`
2. 再读 `docs/competition-architecture.md`
3. 再读 `docs/task-registry.md`
4. 最后回到 `AGENTS.md`，按这里的协议完成 kickoff
5. 按任务类型补读对应 QA / demo 文档，例如：
   - 会诊相关：`docs/teacher-consultation-qa.md`
   - Teacher 语音相关：`docs/teacher-voice-smoke.md`
   - Parent 趋势相关：`docs/parent-trend-smoke.md`
   - 录屏与答辩相关：`docs/demo-script.md`、`docs/freeze-checklists.md`

启动后必须做的判断：

- 先在 `docs/task-registry.md` 找到自己的 `Task ID`
- 根据 `lane` 判断自己是主线任务还是架构延长线任务
- 根据“建议触达模块”判断允许改动范围
- 根据任务类型判断自己是 docs / UI / backend / cross-layer / architecture / state-ledger 任务
- 根据“推荐前置依赖”判断能否立即并行推进

开始编辑前必须明确写出自己的任务边界：

- 允许改动范围
- 禁止触碰区域
- 依赖哪些前置任务
- 是否需要更新 docs

默认禁止触碰的区域：

- deployment / TLS / Caddy / SSH / staging 收口
- vivo secrets 与任何真实密钥
- 与当前 `Task ID` 无关的 role 页面、无关 route、无关 backend service
- 与当前任务无关的比赛主路径叙事重排

dirty worktree 处理规则：

- 默认把现有未提交改动视为他人工作，不要回滚
- 文档线程只改文档；不要顺手处理 unrelated code changes
- 如果文档改动必须引用真实代码事实，读取即可，不要修别人的代码

## 5. 任务分类法

### docs-only

只修改文档控制平面，不改业务代码。典型任务：

- 任务注册表收口
- ledger 收口
- lane 映射与 shared contract 收口
- demo script / checklist / README 口径统一

### UI

只在前端角色页、卡片层、渲染层、交互层落地。典型范围：

- `app/*`
- `components/*`
- `lib/*` 中的 view-model / client helper / render adapter

### backend

只在 API、service、schema、repository、provider 层落地。典型范围：

- `backend/app/api/v1/endpoints/*`
- `backend/app/services/*`
- `backend/app/schemas/*`
- `backend/app/db/*`
- `backend/app/providers/*`

### cross-layer

同时会改页面、route、backend service 或 shared contract。通常满足任一条件即视为 cross-layer：

- 跨多个角色页
- 同时涉及 Next route 与 FastAPI
- 同时涉及 UI 与 shared contract
- 同时涉及 writeback / trace / memory / notification / weekly report 等跨层链路

### architecture

不一定改业务功能，但会改 lane 映射、shared contracts、稳定主路径、主展示位定义或任务归属关系。

### state-ledger

不一定改功能，但会改任务状态、依赖、阶段、wave、回写规则或任务边界，是任务控制面收口任务。

## 6. 统一 Kickoff 模板

每个线程开始实现前，至少按下面模板声明：

```md
Task ID:
一句话目标:
所属 lane:
当前状态:
推荐前置依赖:
任务类型:
允许改动范围:
禁止触碰区域:
推荐 subagents:
最小验证方式:
完成后需回写 docs:
```

填写规则：

- `Task ID` 必须来自 `docs/task-registry.md`
- `当前状态` 以 `docs/task-registry.md` 为准，不自己发明
- `允许改动范围` 直接引用 task-registry 的“建议触达模块”
- `完成后需回写 docs` 不能留空；至少写明 `task-registry`，必要时补 `ledger` / `architecture` / `AGENTS`

## 7. Subagent 使用协议

如果运行环境支持 subagents，默认要求主动 dispatch。下面是**最小强制组合**：

- docs-only：至少 `docs_architect + status_ledger_editor + reviewer_tester`
- UI-only：至少 `repo_mapper + frontend_architect + reviewer_tester`
- backend-only：至少 `repo_mapper + backend_architect + reviewer_tester`
- cross-layer：至少 `repo_mapper + frontend_architect + backend_architect + reviewer_tester`
- architecture / lane mapping：至少 `repo_mapper + workflow_cartographer + docs_architect`
- state / task registry / ledger 收口：至少 `repo_mapper + status_ledger_editor + reviewer_tester`

额外强制规则：

- 任务跨多个角色页、多个 route、多个 backend service 时，必须主动 dispatch，不能只在主线程硬扫
- 任务同时涉及 stage 口径与 lane 归属时，必须至少补一个 `workflow_cartographer` 或 `status_ledger_editor`
- 任务涉及 shared contract 时，必须至少补一个 `backend_architect` 或 `workflow_cartographer`

角色职责固定为：

- `repo_mapper`
  - 核代码事实、真实模块锚点、现有页面 / route / service / provider / memory hub
- `docs_architect`
  - 设计章节树、信息压缩、文档引用关系、单一真源边界
- `status_ledger_editor`
  - 收口阶段口径、任务状态、验证边界、回写范围
- `workflow_cartographer`
  - 建立 lane、依赖、shared contracts、主路径到延长线映射
- `frontend_architect`
  - 负责角色页、卡片层、deeplink、entry、信息密度与移动端叙事
- `backend_architect`
  - 负责 route、service、schema、repository、provider、memory/writeback
- `reviewer_tester`
  - 审核并行安全、dirty worktree 风险、回写是否完整、口径是否夸大

## 8. 并行安全规则

所有线程都必须遵守：

- 不要改出当前 `Task ID` 建议触达模块之外的代码
- 不要顺手重构 unrelated 模块
- 不要重排整个比赛叙事，只能在 `docs/competition-architecture.md` 允许的 lane 范围内增量修订
- 不要把旧 freeze 任务表继续当成当前主任务表
- 不要把 staging、vivo、远端链路写得比真实状态更好
- 不要把已有展示能力写回“未开始”
- docs-only 任务默认不改 `app/`、`components/`、`lib/`、`backend/` 业务文件
- cross-layer 任务默认同时更新 task-registry；如果它改变阶段或主路径，也必须更新 ledger

遇到 dirty worktree 时：

- 不要回滚别人的改动
- 不要把别人未提交的代码纳入你的“顺手修复”
- 如果你的任务与现有脏改动直接冲突，先缩小范围；仍冲突时再询问

## 9. 什么时候必须回写文档

### 必须回写 `docs/task-registry.md`

任一线程完成后，只要发生下列任一情况，就必须回写：

- 任务状态变化
- 依赖变化
- 推荐 subagents 变化
- 建议触达模块变化
- 最小验收方式变化
- 并行性判断变化

### 必须回写 `docs/current-status-ledger.md`

发生下列情况时必须回写：

- 当前阶段定义变化
- 最稳定比赛主路径变化
- 第一 / 第二展示位变化
- Wave 优先级变化
- 可验证边界变化
- walkthrough、真机、录屏再验要求变化

### 必须回写 `docs/competition-architecture.md`

发生下列情况时必须回写：

- lane 归属变化
- 一个任务从独立能力改判为共享 contract 延长线
- shared contract 新增、拆分、合并或重命名
- 现有页面 / route / backend service 与 lane 的映射变化

### 必须回写 `AGENTS.md`

发生下列情况时必须回写：

- kickoff 协议变化
- 文档优先级变化
- subagent 最小组合变化
- 并行安全规则变化
- 统一 kickoff 模板变化

### README 的回写条件

只有以下情况才更新 README：

- 当前最稳定比赛主路径变化
- 项目当前阶段发生阶段性切换
- 延伸文档入口变化

## 10. 新线程的最先阅读顺序

并行线程进入仓库后，默认先读这 3 个文档：

1. `docs/current-status-ledger.md`
2. `docs/competition-architecture.md`
3. `docs/task-registry.md`

然后再读：

4. `AGENTS.md`

如果任务与当前 5 条展示路径强相关，再补读：

- `docs/agent-workflows.md`
- `docs/demo-script.md`
- `docs/freeze-checklists.md`

## 11. 永远不要用的旧口径

以下表述统一禁止继续使用：

- “Parent storybook 未开始”
- “`T13B` 仍未开始”
- “旧 `T0-T13` 就是当前主任务表”
- “staging 已 fully healthy / fully switched”
- “vivo provider 已 fully live”
- “Parent trend 是本地完整能力”
- “高风险会诊已经等于完整 T8 全量交付”

