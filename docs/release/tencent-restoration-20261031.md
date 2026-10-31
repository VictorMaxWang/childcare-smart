# 腾讯云功能恢复、三元课程与全量验收报告（草稿）

> 日期：2026-10-31。**尚未完成本轮生产部署和正式网站验收，不能据此宣告上线成功。**
> 正式网站仍为旧发布，主任务当前观测短 SHA 为 `44ef`；完整 `/api/health` 证据待归档。
> 本文保留此前失败记录。后续修复的最终 SHA、镜像、静态回归和正式验收结果由主任务更新；本报告不代表原 Vercel formal gate 通过。

## 1. 发布状态与证据边界

| 项目 | 当前记录 |
| --- | --- |
| 正式入口 | `https://www.smartchildcare.cn`；根域跳转、证书及最终发布信息仍须在部署后复核 |
| 目标服务器 | 现有腾讯云 `124.156.209.173`，本轮不新增付费云服务 |
| 本地候选入口 | 已有 HTTP 报告均指向 `http://localhost:18080`，不等同于正式 HTTPS 网站 |
| 已归档候选基准 | [candidate-commit.txt](../../artifacts/implementation-20261031/candidate-commit.txt) 记录 `5ce02f34f2367b0b9942ef02dbf647ad796d3c46`；不能据此认定之后追加修复已进入同一镜像 |
| Linux 构建 | [web-build-candidate.log](../../artifacts/implementation-20261031/web-build-candidate.log) 记录构建成功、90/90 静态页生成及镜像导出；这不是腾讯云部署成功证据 |
| 最终交付 SHA / 镜像摘要 | 待补，须与上线后 `/api/health` 和 GitHub `main` 一致 |
| 正式验收结论 | 未完成；关键 AI 绘本、家长回复等尚有未关闭项 |

本轮使用独立合成夹具：2 个目标机构、8 个普通账号、4 个合成儿童，角色为 2 名园长、3 名教师和 3 名家长；其中一名家长关联两个儿童。本地和正式夹具分开保存，不使用演示账号冒充普通账号验收。课程 HTTP 报告记录了相同账号和儿童数量，见 [local-courses-real-report.json](../../artifacts/implementation-20261031/local-courses-real-report.json)。凭据清单、会话 Cookie、私有 AI 正文及合成儿童明细不收录到本报告。

## 2. 功能覆盖与候选修复

以下区分实现覆盖、本地验证和正式验收，不能将其中一层替代另一层。

| 范围 | 候选修复与已有验证 | 尚待完成 |
| --- | --- | --- |
| 建档与监护同意 | 已归档 Node 测试覆盖未来生日、年龄边界、严格同意值、请求幂等、月末和跨日换算、撤销绑定后重放、事务回滚 | 正式 Chrome 从注册到建档、成功跳转、多个儿童切换 |
| 教师一日反馈与家长档案 | 本地普通账号验证健康、饮食、成长记录及私有照片；家长另一会话读取，家长执行反馈由教师读回 | 正式 HTTPS 完整链路；照片失败后只重传照片的交互验收 |
| 数据同步与并发 | 已归档测试覆盖请求合并；本地核心验证 10 个不同并发写入无丢写、10 个相同提交只产生一条记录 | 正式同负载短测、刷新/断网恢复、服务器资源与 OOM 检查 |
| 个性化方案与周报 | 主动生成、持久结果复用、未知结果不自动重发；本地初次/更新方案及各自缓存命中通过，教师沟通、周报通过 | 追加修复后的主卡动作/依据映射与年龄上下文重新验收；正式持久缓存和页面展示 |
| 会诊与家长 AI 回复 | 本地会诊 SSE 检查通过；家长回复 `parent-reflexion` 仍有失败记录 | 评审枚举修复后的真实复测，以及正式 SSE/取消/超时流程 |
| 成长绘本 | Node 测试覆盖 MaaS 来源、媒体任务幂等、未知不重发、恢复来源和任务状态、轮询退避、私有媒体读取；WAV 修复与追加回归需纳入最终候选归档 | 四页真实文字、四图、四音频、实际播放、保存重开、分享/导出及重启恢复；当前业务生成尚未通过 |
| 三元课程 | 本地 24/24 HTTP 检查与 21/21 MySQL 集成检查通过，覆盖课程读取、自检、实践、反馈、幂等和作用域隔离 | 正式三模块/9 微课逐项检查、B站链接可用性、390px/768px/桌面交互与跨设备进度 |
| 智慧推荐 | 本地 SQL 验证预算/模型身份缓存、并发任务、冲突、失联转 unknown、撤销授权及重新建连接后的持久化 | 独立真实推荐业务报告、5/10/20 分钟组合、反馈影响后续推荐与正式页面验收 |
| OCR / ASR / TTS / 图片 / 向量 | 供应商探针已分别得到成功结果，见费用与探针章节；失败探针仍保留 | 各业务入口真实验收；探针成功不能代替上传、识图、识音和音频播放完整流程 |
| 展示真实性 | 已安排去除无记录时的良好状态、固定更新时间、虚构绘本统计及教师计划归属；后续发现的模型主动作被年龄规则覆盖也已进入追加修复范围 | 以重新构建的最终候选完成 Chrome 复核，避免以真实 AI 标签展示规则主动作 |

上述早期候选的 Node 证据见 [node-full-final.log](../../artifacts/implementation-20261031/node-full-final.log) 与 [node-linux-final.log](../../artifacts/implementation-20261031/node-linux-final.log)。主卡映射、服务端可信生日重算月龄/年龄带、AI 评审枚举和绘本 JSON 模式属于此后追加修复，**必须补最终版本的静态回归和真实验收证据**。

## 3. 已归档验证结果

| 环境 / 检查 | 结果 | 证据与限制 |
| --- | --- | --- |
| Linux Node 回归，前一候选轮次 | 753 通过，0 失败、0 跳过 | [node-linux-final.log](../../artifacts/implementation-20261031/node-linux-final.log)；不覆盖其后追加修复 |
| Linux Python 回归，前一候选轮次 | 252 通过，1 条依赖弃用警告 | [python-linux-final.log](../../artifacts/implementation-20261031/python-linux-final.log)；不覆盖其后追加修复 |
| Windows 发布脚本测试 | 36/36 通过 | [release-tests.log](../../artifacts/implementation-20261031/release-tests.log)；这是脚本测试，不是正式发布 gate 结果 |
| 新增 QA 脚本离线测试 | 16/16 通过 | [qa-scripts-final.log](../../artifacts/implementation-20261031/qa-scripts-final.log)；不调用真实收费接口 |
| 本地 MySQL 课程集成 | 21/21 通过，AI 调用 0、外部网络请求 0 | [parent-courses-sql-integration.json](../../artifacts/implementation-20261031/parent-courses-sql-integration.json)；合成服务作用域，不能证明浏览器 Cookie 授权 |
| 本地普通账号核心链路 | 20/20 通过，收费业务请求 0 | [local-core-final-report.json](../../artifacts/implementation-20261031/local-core-final-report.json) |
| 本地普通账号课程 HTTP | 24/24 通过，AI 调用 0 | [local-courses-real-report.json](../../artifacts/implementation-20261031/local-courses-real-report.json) |
| 本地真实核心 AI | 7 通过、1 失败 | [local-core-final-ai-report.json](../../artifacts/implementation-20261031/local-core-final-ai-report.json)；未达到全通过 |
| 本地真实绘本 | 已停止：认证检查通过，生成业务请求失败 | [local-storybook-report.json](../../artifacts/implementation-20261031/local-storybook-report.json)；没有四图四音频完成证据 |
| Lint / 类型检查 | 已有候选归档日志未列出错误 | [lint-last.log](../../artifacts/implementation-20261031/lint-last.log)、[typecheck-final-local.log](../../artifacts/implementation-20261031/typecheck-final-local.log)；最终追加修复仍需重新归档 |
| 已知密钥扫描 | 1664 文件、9 项已知秘密模式，0 命中 | [known-secret-scan.json](../../artifacts/implementation-20261031/known-secret-scan.json)；仅代表该次已知模式扫描范围 |

各轮测试有重复和覆盖交集，不将这些数字累加为“独立功能总数”。HTTP 业务检查不能代替真实 Chrome 的点击、声音播放、布局、控制台和加载体验验收。

本地核心 20 项具体覆盖了：教师三类记录幂等写入、私有照片上传和绑定、另一家长会话读取、执行反馈闭环、同机构异班及跨机构拒绝、家长不能写教师专用记录、匿名拒绝、并发不同/重复提交、退出后的当前会话拒绝与过期会话拒绝。

## 4. 失败历史与处理状态

| 轮次 / 问题 | 已有证据 | 当前处理边界 |
| --- | --- | --- |
| 初次方案缓存断言不一致 | [local-core-ai-report.json](../../artifacts/implementation-20261031/local-core-ai-report.json)：1 通过、1 失败 | 后续 final 轮次的初次方案缓存检查已通过；保留早期报告，不抹去失败历史 |
| 方案更新请求结果未知 | [local-core-ai-update-report.json](../../artifacts/implementation-20261031/local-core-ai-update-report.json)：HTTP 503，1 失败、1 阻塞 | 未自动重复提交；后续 final 轮次的更新方案及缓存检查通过。根因与对应修复提交在最终版补录 |
| 家长回复未达到真实 AI 断言 | [local-core-final-ai-report.json](../../artifacts/implementation-20261031/local-core-final-ai-report.json)：`parent-reflexion` 失败，预留项为 unknown | 评审枚举修复已安排；尚无该最终修复的真实通过报告，不能将其算为通过 |
| 绘本业务生成失败 | [local-storybook-report.json](../../artifacts/implementation-20261031/local-storybook-report.json)：业务接口 HTTP 503 后停止 | 上游具体 HTTP 400 / JSON 协议诊断及修复仍需补证；没有继续自动收费重试，也没有用图片探针成功冒充整本通过 |
| 真实 AI 主动作被年龄规则覆盖 | Chrome 发现后的追加修复项，尚待最终候选归档 | 主卡动作/依据映射与服务端可信年龄上下文须一起重新构建、复测；仅显示 AI 徽标不算正确交付 |

失败或失联任务的费用结果未知时保留预留，不把“未拿到结果”视为“未计费”。恢复优先读取已保存结果与媒体；未经明确确认不重发可能收费的请求。

## 5. 性能基线与比较限制

[performance-before.json](../../artifacts/implementation-20261031/performance-before.json) 是 **正式旧站** 2026-10-31T08:14:58Z 的原始数据：5 并发，3 个接口各 30 次，共 90 请求，收费 AI 调用 0。

| 正式旧站接口 | 请求数 | p50（ms） | p95（ms） | 最大值（ms） | 意外状态数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/api/state` | 30 | 210.44 | 772.83 | 1556.89 | 0 |
| `/api/children` | 30 | 206.14 | 231.35 | 258.75 | 0 |
| `/api/records?type=growth&childId=<合成儿童>` | 30 | 204.60 | 527.67 | 1542.09 | 0 |

真正的正式站 `after` 尚未执行。不能用 localhost 的 75 次混合业务请求（p50 24.27ms、p95 162.99ms）宣称正式站提速，因为网络、数据和操作集合不同；这些本地数字仅来自 [local-core-final-report.json](../../artifacts/implementation-20261031/local-core-final-report.json)。

待部署后用相同账号数据、网络条件、并发和接口重跑正式 `after`；另补 10 并发普通业务、LCP、CLS、控制台错误、资源 404、实际模型首响应/首图/整本耗时及内存/OOM 记录。目前不能宣称达到 LCP ≤2.5 秒、CLS ≤0.1 或腾讯云负载验收通过。

本地真实 AI 检查的客户端观察耗时为：初次方案约 11.18 秒、更新方案约 13.35 秒、教师沟通约 11.56 秒、周报约 9.38 秒、会诊 SSE 检查约 5.34 秒。它们不是正式站性能，也不能当作模型内部推理耗时。

## 6. API 用量与费用

用户费用上限为 **30 元**。[qa-budget-allocations.json](../../artifacts/implementation-20261031/qa-budget-allocations.json) 登记的分类预留上界为 **26.38 元**：

| 分类 | 预留上界（元） |
| --- | ---: |
| 供应商探针 | 0.38 |
| 核心业务验收 | 10.00 |
| 绘本业务验收 | 5.00 |
| 浏览器 AI 验收 | 6.00 |
| 推荐业务验收 | 2.00 |
| 其他媒体验收 | 3.00 |
| 合计 | 26.38 |

**预留不是实际花费。当前实际累计费用尚未核定，不能填写 0 元或 26.38 元。** 各轮报告的预留可能继承同一预算账本，不能直接相加当作账单。usage 日志与供应商账单尚待汇总，需同时列出成功、失败、缓存命中与结果未知的请求。

[api-ledger.json](../../artifacts/implementation-20261031/api-ledger.json) 记录 12 次供应商探针、预留 0.38 元：文本最终成功探针约 4.46 秒，向量约 2.35 秒，图片约 4.12 秒，TTS 约 1.99 秒，ASR 两种成功协议约 3.01 / 4.46 秒，OCR 约 3.29 秒；同时保留了此前文本和 ASR 的 HTTP 400 失败。目录可见、探针成功、业务完成是不同证据层级。

本地核心 final AI 报告记录 6 个可能收费的业务请求：5 个 completed、1 个 unknown，另有 2 项缓存检查通过；该轮报告预留 3 元。绘本报告记录 1 个可能收费的业务 HTTP 请求后停止。完整 usage 与实际账单完成核对前，不据此推定真实计费次数或总费用。

## 7. 迁移、运行与恢复说明（待生产执行核验）

集中备份位置已在任务元数据登记为：

`D:\codex工作备份回滚\任务备份\20261031-154609-慧育童行功能恢复课程迁移`

目录登记不等于备份已完成。部署前需核对该目录中的生产数据库、Brain SQLite、私有运行配置、现用镜像与 Compose/Caddy 配置的备份清单和恢复入口；私有文件不加入 GitHub。

生产执行顺序：

1. 锁定最终源码 SHA、镜像摘要和增量 SQL 清单；追加修复后重跑静态检查及 Linux 构建，服务器仅运行预构建镜像。
2. 记录旧 `/api/health`、容器镜像、持久卷、数据库结构和当前解析；完成生产备份后再执行增量迁移。已有本地 MySQL 集成成功不代表生产迁移成功。
3. 以现有 Compose 运行 Caddy、Next.js、FastAPI 和 MySQL；数据库、Brain 记忆及证书保留持久卷。密钥只通过服务端私有运行配置注入，数据库及内部后端继续只走容器内网。
4. 核验数据库、内部签名、Blob 私有读取及各模型能力，再完成正式 HTTPS、根域跳转、Cookie 和 SSE 检查。本轮若无解析变更，应保持现有 DNS。
5. 在正式域名用独立普通账号执行核心、课程、AI、绘本、作用域拒绝及三种视口矩阵；重启本次容器后只读复查保存结果与媒体，不用重启触发再次收费生成。
6. 重跑正式性能 `after`、记录容器资源和 OOM 状态；补齐 usage/账单。通过后正常推送 GitHub `main`，确认线上 SHA 与交付提交一致，不强推。

回滚原则：

- 先保留故障日志、未知任务状态及本轮新增数据，再回退到部署前登记的旧应用镜像和配置；不删除持久卷。
- 增量表及新增业务写入保留；不得直接导入旧数据库覆盖新数据。应用版本兼容性需在回滚前核对，避免数据分叉。
- 若实际修改过解析，按已归档旧值恢复；本轮没有修改的 DNS 不另行重写。
- 未确认的收费任务保持阻塞并优先读取既有结果，不因回滚或重启重新发起。
- 恢复后复查健康 SHA、三角色作用域、普通读写和私有媒体；恢复动作及其结果另行追加到本报告。

## 8. 残余风险与未完成清单

早期依赖快照 [npm-audit-production.json](../../artifacts/implementation-20261031/npm-audit-production.json) 为 **11 项告警：9 high、2 moderate、0 critical**。最终锁文件独立复核时先确认还剩 7 项，再将 PDF.js 升至 6.4.299、selector parser 固定到已回补的 6.1.5，并将 Blob/OIDC 依赖链内嵌套的 Zod 4.1.11 统一到兼容的 4.6.7；隔离生产依赖审计结果降为 **0 项告警**。见 [dependency-final-review.json](../../artifacts/implementation-20261031/dependency-final-review.json) 及其指向的前后原始审计文件。PDF.js 6 的释放接口已适配为 `loadingTask.destroy()`；以实际 6.x 包和旧 5.x 包分别运行现有健康附件测试，均为 5/5 通过。没有改动 Windows node_modules 联接；最终干净 Linux 安装、构建及全量回归仍需主任务归档。审计是当日公告数据库快照，不构成“没有任何安全风险”的保证。

Linux Python 回归有 Starlette/TestClient 的 `httpx` 弃用警告，见 Python 日志，后续需安排兼容更新。本地核心报告还明确注明：退出清除当前客户端 Cookie，尚不提供服务端令牌全局撤销；当前退出检查通过不能证明历史令牌已全局失效。

正式交付前仍需关闭：

- 最终追加修复对应的 Node/Python/脚本回归、Linux 构建与唯一 SHA/镜像证据。
- `parent-reflexion` 与四页真实绘本的未通过项，以及主卡实际动作/依据/年龄上下文的真实页面复测。
- 正式注册、建档、多儿童切换、教师记录到家长方案与反馈完整闭环。
- 三元课程、真实智慧推荐、进度/反馈及跨设备恢复。
- OCR、ASR、TTS、图片与全部现有语音/识图业务入口；真实音频播放和分享/导出。
- 桌面 Chrome、390px、768px 的导航、按钮、加载/空/失败状态、控制台和资源检查。
- HTTPS/Cookie/SSE、私有媒体全矩阵、容器重启持久化、资源上限与无 OOM 证据。
- 正式性能 `after`、LCP/CLS、费用 usage/账单、最终依赖风险复核和 GitHub 推送。

在这些事项完成前，本报告结论保持为：**候选修复和部分本地验收已完成，生产上线及全量正式验收未完成。**
