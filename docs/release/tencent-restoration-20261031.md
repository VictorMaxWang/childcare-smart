# 腾讯云功能恢复阶段归档（0639 / ac5）

> 本文保留各阶段的原始状态与失败，不代表当前部署状态；正文中的“待完成”须按该阶段理解。当前交付、重启、费用与边界请看 [最终验收报告](tencent-final-acceptance-20261031.md)。
> 原始报告不改写失败或未知结果，不构成旧 Vercel formal gate 通过。

## 1. 正式版本与部署状态

| 项目 | 当前证据 |
| --- | --- |
| 上线入口 | `https://www.smartchildcare.cn`，腾讯云服务器 `124.156.209.173` |
| 正式应用 SHA | `0639de1ea870993e6a5639d9077e729fc0d273c3`；[正式健康响应](../../artifacts/implementation-20261031/prod-health-0639de1-initial.json)、[既有 AI 入口前后锁版](../../artifacts/implementation-20261031/prod-entrances-0639de1-context.json) |
| 最终修复候选 | `ac5b8d57f55c224d54b632a736784887ac265e87`；854 项 Node / 286 项 Python、lint、类型检查和 Linux web/backend 镜像构建通过；生产部署后锁版复验待归档 |
| 发布标识 | `restoration-20261031-0639de1`；[发布准备清单](../../artifacts/implementation-20261031/prepared-release-0639de1-summary.json) |
| 运行部署 | [生产 rollout 日志](../../artifacts/implementation-20261031/production-rollout-0639de1.log) 记录 web/backend 更新且 healthy；该时点两者 `OOMKilled=false`、`RestartCount=0`，不等同持续负载或重启验收 |
| 镜像与构建 | 本机构建后传输，服务器运行；[镜像传输与摘要清单](../../artifacts/implementation-20261031/images-0639de1-delta.tar.gz.report.json)；最终运行镜像摘要与 GitHub `main` 对照待补 |
| 数据与配置 | 原 MySQL 凭据、业务数据及 MySQL/Brain/Caddy 持久卷保留，Compose/Caddy 文件保持原样，见发布准备清单 |
| 增量迁移 | [生产迁移日志](../../artifacts/implementation-20261031/production-migration-0639de1.log) 记录执行两遍、6 张增量表检查通过；完整生产结构与重启后耐久证明仍待主任务归档 |

正式和本地使用分开的合成空间：**2 个目标机构、8 个普通账号、4 个合成儿童**，覆盖园长、同班/异班教师、不同家长以及一名家长关联多个儿童。没有使用演示账号或 Mock 冒充正式业务。已归档正式业务报告关联 `0639de1`；不能自动升级为 `ac5b8d5` 的生产通过，也不再以前期 `5bb5e4e` 代替交付版本。

当前文本/识图/OCR 模型为实际可调用的 `qwen3.8-flash`；图片为 `z-image-turbo`，TTS 为 `qwen3-tts-flash`，ASR 为 `qwen-audio-3.0-asr-flash`，课程向量为 `qwen3.7-text-embedding-flash`。此前 GLM 鉴权失败和用户允许后的切换过程保留为历史，不以目录可见推断实际调用成功。

## 2. 最终候选回归与已归档正式验收

| 检查 | 实际结果 | 证据及边界 |
| --- | --- | --- |
| 最终候选 Node 回归 | `ac5b8d5`：854 通过，0 失败、0 跳过 | [Node 日志](../../artifacts/implementation-20261031/node-ac5b8d5.log)；原 0639 轮次 825 项保留为历史 |
| 最终候选 Python 回归 | `ac5b8d5`：286 通过，1 条依赖弃用警告 | [Python 日志](../../artifacts/implementation-20261031/python-ac5b8d5.log)；Starlette/TestClient 的 `httpx` 兼容更新另行安排 |
| Lint / 类型检查 / Linux 构建 | `ac5b8d5` 通过 | [Lint](../../artifacts/implementation-20261031/lint-ac5b8d5.log)、[types](../../artifacts/implementation-20261031/types-ac5b8d5.log)、[web 构建](../../artifacts/implementation-20261031/web-ac5b8d5.log)、[backend 构建](../../artifacts/implementation-20261031/backend-ac5b8d5.log)；构建成功不代替生产复验 |
| 核心普通业务 | 20/20 通过，收费模型请求 0 | [核心报告](../../artifacts/implementation-20261031/prod-core-0639de1-report.json)：教师健康/饮食/成长、私有照片、另一家长会话读取、执行反馈到教师读取、异班/异儿童/跨机构、匿名、10 并发、退出与过期会话 |
| 核心真实 AI | 8/8 通过 | [AI 报告](../../artifacts/implementation-20261031/prod-core-0639de1-ai-report.json)：初次/更新方案及各自缓存、教师沟通、周报、会诊 SSE、家长反馈润色；[前锁版](../../artifacts/implementation-20261031/prod-core-0639de1-ai-health-before.json)、[后锁版](../../artifacts/implementation-20261031/prod-core-0639de1-ai-health-after.json) |
| AI 结果业务持久化 | 7/7 通过，新增收费请求 0 | [持久化报告](../../artifacts/implementation-20261031/prod-core-0639de1-ai-persistence-report.json)：复用已收到结果，按现有保存/读取契约验证，不以新生成替代读回 |
| 三元课程 | 24/24 通过，收费模型请求 0 | [课程报告](../../artifacts/implementation-20261031/prod-courses-0639de1-report.json)：目录/详情、互动、自检、家庭实践和反馈、幂等/冲突、另一会话读取及权限边界 |
| 既有 AI 入口 | 10/10 通过，10 个新业务请求，预留 2.3 元 | [入口报告](../../artifacts/implementation-20261031/prod-entrances-0639de1-report.json)、[前后锁版](../../artifacts/implementation-20261031/prod-entrances-0639de1-context.json)：真实识图、膳食、健康 OCR、教师语音上传、通用 ASR、追问、趋势及园长三工作流 |
| 独立补充 AI 入口 | 2/2 通过，预留 0.7 元 | [补充报告](../../artifacts/implementation-20261031/prod-remaining-0639de1-report.json)：教师语音理解弹层、JSON 会诊及适用持久化/家长读回/feed/越权；不以通用 ASR 替代语音理解 |
| 四页完整绘本 | 48/48 HTTP 业务检查通过 | [绘本报告](../../artifacts/implementation-20261031/prod-storybook-0639de1-report.json)：真实文字、4 图 4 音频、私有 Blob 字节解码、保存重开、另一授权会话、逐媒体越权、5 种导出和分享；不等同浏览器实际播放 |
| 绘本分镜对应 | 4/4 页通过 | [对应关系报告](../../artifacts/implementation-20261031/prod-storybook-0639de1-alignment-report.json)：每页实际旁白与音频输入一致，图片提示包含该页正文；浏览器逐页视觉体验另验 |
| 智慧推荐 5/20 分钟 | 两档业务通过 | [组合报告](../../artifacts/implementation-20261031/prod-recommendations-0639de1-report.json)、[5 分钟](../../artifacts/implementation-20261031/prod-recommendations-0639de1-5m-report.json)、[20 分钟](../../artifacts/implementation-20261031/prod-recommendations-0639de1-20m-report.json)：真实模型/1024 维向量身份、目标覆盖/相关/互补/偏好/去重、预算和跨家长拒绝；10 分钟 UI 与反馈后推荐由主任务进行 |
| API 只读覆盖 r2 | 匿名按契约拒绝 92、单列受控跳转 3；普通角色读取 43；明示排除 15 | [r2 报告](../../artifacts/implementation-20261031/prod-readonly-0639de1-r2-report.json)、[跳转分类](../../artifacts/implementation-20261031/prod-readonly-0639de1-redirect-controlled-denial.json)；其中 **24 个 AI HTTP 方法严格返回 401**，未发送收费生成；3 个历史 307 不冒称 401 通过 |

上述检查有覆盖交集，不累加为独立功能总数。只读覆盖不代表完整 CRUD；15 项排除保留逐项原因。3 个历史跳转方法严格检查 `/login` Location 和路径型响应；默认跟随重定向的 JSON 客户端仍可能收到登录 HTML，这一兼容边界未隐去。

## 3. 业务行为与真实来源

核心链路已在正式 HTTPS 普通账号完成：教师记录一日情况并绑定私有照片，家长另一会话读取相同记录，生成个性化方案，提交执行反馈，教师读回，再更新方案。服务端使用授权儿童/机构的可信快照；缓存读取与主动生成分开，客户端 `source: ai` 不能自行取得真实来源。

识图和膳食评价结果已保存并由家长读回。健康材料实际 OCR 读到合成 `36.5`，签名原始回执按 `completed` 写回并由家长读取；后续健康分析明确为**保守规则分析**，不冒称模型诊断。公开 HTTP 响应不能独立证明 Brain SQLite 重启耐久性。

教师语音上传和通用 ASR 均实际调用音频模型；教师转写保存为合成成长记录并由家长读取。语音理解弹层另有独立真实验收。录音权限、麦克风输入和浏览器播放仍需 UI 验证。

园长 daily/follow-up/weekly 正式结果均有实际 `live/realProvider/model/requestId` 和 3 个行动项。无规则风险卡的机构保留模型真实动作为待园长确认的机构建议，未伪造儿童风险或绑定。趋势数字由服务端确定性聚合并逐天对照饮食记录，文字解释另有真实模型证据。

三元课程为营养、心理、体育各 3 个微课，采用原创知识卡、自检和家庭实践。视频仅打开已核验 B站 BV 外链，不把打开当作学习完成。推荐保留 ≤20 候选、最多 3 项、5/10/20 分钟硬预算、语义向量和组合复核；5/20 分钟业务通过，10 分钟 UI 与反馈闭环待下一次补录。

绘本先给文字，再补齐图片和音频。生成回执先私有持久化，后续恢复只下载/转码/写 Blob，未知收费任务不自动重发。正式四页书的保存重开、授权媒体、导出和分享 HTTP 验收已完成，浏览器阅读、声音和布局另验。

## 4. 性能前后对比

正式 before/after 使用同一已填充合成家长/儿童、相同网络入口、**5 并发、3 个接口各 30 次，共 90 次 GET**，收费 AI 调用 0；三个接口前后响应字节数一致，没有更换数据或用 localhost 代替正式结果。见 [before](../../artifacts/implementation-20261031/performance-before-filled.json)、[固定数据上下文](../../artifacts/implementation-20261031/performance-before-filled-context.json)、[after](../../artifacts/implementation-20261031/performance-after-filled-0639de1.json)。

| 接口 | before p95（ms） | after p95（ms） | 前后意外状态 |
| --- | ---: | ---: | ---: |
| `/api/state` | 780.64 | 526.354 | 0 / 0 |
| `/api/children` | 314.31 | 207.7783 | 0 / 0 |
| `/api/records?type=growth&childId=<合成儿童>` | 398.59 | 200.3129 | 0 / 0 |

正式核心报告 75 次普通读写 p95 为 **898.87ms**。10 个不同并发成长记录全部保存，10 个相同并发提交仅产生 1 条；并发不同写入子集 p95 为 **1471.71ms**，不能以整体 p95 冒称各子集都 ≤1 秒。收费模型未压测，这些短测也不替代长期负载、无 OOM 或页面 LCP/CLS。

正式四页绘本的客户端观察耗时：**文字 8.701 秒，首图 21.372 秒，整本完成 65.592 秒**。首音同在 21.372 秒可用，四图四音于 65.279 秒就绪，65.592 秒包含整本完成观察。进度不算模型完成；这些不是模型内部推理时长或所有网络条件的保证。

## 5. 历史失败与未知结果

### 晚期真实浏览器发现与 ac5b8d5 修复

这些问题发生在已通过 HTTP 矩阵之后，说明真实浏览器验收仍有独立价值。浏览器记录见[实际交互证据](../../artifacts/implementation-20261031/production-browser-evidence.json)。下表为**已实现并回归的候选修复**，不是最终生产复测通过：

| 真实缺陷 | 根因与 ac5b8d5 修复 | 生产仍需复验 |
| --- | --- | --- |
| 教师生成的绘本由家长播放/下载/分享后，离开重开媒体被清空 | 家长恢复页面自动回写教师签名正文，跨用户验签失败后覆盖原书；取消只读恢复回写、签名原文不做客户端规范化，服务端从已授权规范原版继续，事务内拒绝未验证/倒退版本覆盖已完成媒体。严格跨用户验签保持，未重生收费媒体 | 家长跨角色重开、播放、下载、分享、再重开与重启读回；[原失败页面](../../artifacts/implementation-20261031/prod-storybook-ui-provenance-failure.txt)保留 |
| “主动参与/情绪稳定”等正向观察被写成执行阻碍 | 固定观察标签与真实自由文本障碍混用。新输入、历史受控模板读取和 AI 可信输入分别投影为观察/支持需求，真实障碍保留，原始历史记录不批量改写 | 家长提交正向观察后教师读取；旧记录显示和后续方案输入语义 |
| 同日多条记录显示覆盖 4/7 天、57%，展开依据泄露历史模型 JSON | 完整 ISO 字符串去重误当业务日；改为 UTC+8 近 7 业务日去重，反馈使用业务日期。派生视图清理 JSON/内部参数，历史摘要标过往建议；后端只抽取有来源的完整业务摘要，历史证据待人工确认，不把旧模型输出当新事实 | 正式页面应显示实际唯一业务日；依据不含 raw JSON/内部 trace，签名原始响应不被改写；[原 DOM](../../artifacts/implementation-20261031/prod-ui-parent-agent-390.txt)保留 |
| 仅有一条成长记录、没有餐食记录的儿童被提示蔬果低摄入/补水偏少 | 空饮食聚合的数值 0 被当成实际摄入。无餐食时只提示缺记录/不评估，真实已记录零值仍保留原阈值；首页使用同一月龄规则，避免退回随机学前任务 | 正式第二儿童“只有成长照片、无餐食”的缺数据状态与 24–36 月龄规则；有真实餐食时阈值不变 |

同时修正无出勤登记时被显示为缺勤的页面语义；已有明确缺勤原因和操作保留。这些 UI 修复不新增考勤接口、不改已有业务数据。

### 更早轮次记录

| 历史问题 | 保留证据 | 当前结论 |
| --- | --- | --- |
| 缓存断言受 JSON 键序影响 | [早期 AI 报告](../../artifacts/implementation-20261031/local-core-ai-report.json) | QA 改用递归规范键哈希，数组顺序保留；正式缓存检查另有成功证据，旧失败未改 |
| GLM 未开通/鉴权拒绝 | [探针账本](../../artifacts/implementation-20261031/api-ledger.json) | 不将所有 HTTP 400 当成同一原因；允许后切换实测 Qwen，成功另列 |
| 绘本早期文字/媒体失败及未知状态 | [旧文字报告](../../artifacts/implementation-20261031/local-storybook-qwen-report.json)、[5bb 媒体报告](../../artifacts/implementation-20261031/local-storybook-5bb5e4e-report.json) | 正文先持久化、媒体收据恢复和冷读预算已修；正式新意图成功不把旧 unknown 改为 passed，也不宣称旧请求未计费 |
| 健康 QA 错用 `parsed` | [旧入口报告](../../artifacts/implementation-20261031/local-entrances-qwen-media-report.json)、[零新调用重验](../../artifacts/implementation-20261031/local-entrances-qwen-health-revalidated-report.json) | 改回真实契约 `completed` 并复用原签名；正式新材料再次通过 |
| 家长追问上下文过大、园长元数据/动作丢失 | [旧入口报告](../../artifacts/implementation-20261031/local-entrances-qwen-final-five-remaining-report.json)、[修复后本地报告](../../artifacts/implementation-20261031/local-entrances-0639de1-report.json) | 压缩可信上下文、透传实际来源、保留真实动作；本地和正式新意图通过，旧正文/未知状态保留 |

失败、取消或失联可能已计费，未知任务保留预留。优先读取已有结果与媒体，未经明确新意图授权不重发收费生成。

## 6. API 用量与费用边界

用户整轮上限 **30 元**。[分类预留](../../artifacts/implementation-20261031/qa-budget-allocations.json) 合计 **26.50 元**，包含本地和正式测试：

| 分类 | 预留上界（元） |
| --- | ---: |
| 探针与鉴权诊断 | 0.50 |
| 核心业务 | 10.00 |
| 绘本业务 | 5.00 |
| 浏览器 AI | 1.50 |
| 推荐业务 | 2.50 |
| 其他媒体/既有入口 | 7.00 |
| 合计 | 26.50 |

**预留不是实际费用，整轮实际累计账单仍未知。** 分类可在总额不变下调整，以该文件和主任务最终总账为准。报告可能继承同一 journal 的预留，不能直接相加；一次业务 HTTP 可能含多个供应商调用或命中缓存，不等于计费次数。

正式 10 入口启动 10 个业务请求，预留 2.3 元；补充语音理解/JSON 会诊预留 0.7 元。健康 OCR 与规则分析、趋势聚合与模型解释分别标注。TTS 按汉字双计费单位作保守上界；适配器对实际 `qwen3-tts-flash` 超过 600 Unicode 字符的输入在请求前明确拒绝，不静默截断原文或伪造成功。

已有 [usage 账本](../../artifacts/implementation-20261031/usage-ledger.json)、[阶段估算](../../artifacts/implementation-20261031/usage-estimate.json)、[后续本地估算](../../artifacts/implementation-20261031/usage-local-complete-2e56d34-estimate.json) 仅覆盖各自时间截面，不覆盖全部生产/浏览器调用。最终仍需汇总全部请求、未知费用、折扣/舍入并核对账户账单，不能用旧局部估算、0 元或 26.50 元代替实际总支出。

## 7. 迁移、运行与回滚

集中备份根目录：`D:\codex工作备份回滚\任务备份\20261031-154609-慧育童行功能恢复课程迁移`。私有配置、生产数据库、Brain SQLite、旧镜像与恢复清单只在集中备份保存；最终完整性和生产重启核验待补，目录存在不等于恢复成功。

增量 SQL 为 `20261031_ai_result_cache.sql`、`20261031_parent_courses.sql`、`20261031_storybook_media_receipts.sql`，新增 6 张独立表；生产日志记录重复执行两遍且未清空原业务表。本地 [课程 SQL 21 项](../../artifacts/implementation-20261031/parent-courses-sql-integration.json)、[收据 SQL 9 项](../../artifacts/implementation-20261031/storybook-receipts-sql-integration.json) 验证幂等、租约、作用域和连接重建，不替代最终生产结构快照。

继续使用 Caddy/Next.js/FastAPI/MySQL，只有 Caddy 接收公网 HTTP/HTTPS，媒体沿用私有 Blob，不购买额外服务。模型、数据库、会话与内部签名密钥仅通过私有配置注入，报告和 Git 不包含其值。

回滚先保护新增数据、未知任务和故障证据，再恢复旧镜像/配置；不删持久卷，不导入旧数据库覆盖新写入。新增表保留，先确认旧应用兼容。只有实际改过 DNS 才按已存旧值恢复。恢复后复核 SHA、作用域、读写和私有媒体，未知收费任务仍不得自动重发。

## 8. 交付仍需补录的项目

最终生产依赖复核为 0 项已知公告告警，见[依赖复核记录](../../artifacts/implementation-20261031/dependency-final-review.json)；这是该次审计范围和时间截面，不代表不存在其他安全风险。退出测试证明当前客户端 Cookie 清除及随后拒绝，现有认证仍未提供服务端历史有效令牌全局撤销，不将退出通过扩大为全部令牌已失效。

- 桌面、390px、768px 的 **28 页真实浏览器矩阵**：导航/按钮、麦克风/实际播放、SSE 取消/断网、控制台/404、空/失败态和角色权限。HTTP 成功和零散截图不替代该矩阵。
- `ac5b8d5` 的上述四项生产复测和最终 SHA 锁版；0639 的历史成功不覆盖后来真实发现的失败。
- 智慧推荐 10 分钟 UI、反馈后组合及跨设备恢复；主任务正在验证，不先写为通过。
- 生产重启后 MySQL、Brain SQLite、课程进度/任务、AI 缓存和私有媒体读回；完整 SQL 结构、资源限制及无 OOM 证据。
- 权威 DNS、根域和 `www` 证书、HTTP/根域跳转、Cookie、SSE 的最终网络归档；健康 HTTPS 请求不能替代全部检查。
- 页面 LCP/CLS 与移动布局；API p95 不冒称页面性能。
- 完整费用总账、GitHub `main` 正常推送、最终镜像与健康 SHA 对照。未强推，不把本文修改说成已推送。

当前结论：**0639 正式业务证据已归档，ac5 最终修复候选通过 854/286 回归和构建；生产复测、重启与推送待完成，整项全量交付尚未结束。**
