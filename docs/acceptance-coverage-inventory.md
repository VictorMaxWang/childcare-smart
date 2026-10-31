# 页面、接口与真实验收覆盖清单

本清单记录2026-10-31工作树的源码入口和当时已落盘的验收证据。静态扫描得到 **28个页面、90条API路由、110个HTTP方法操作**；25条路由有同目录单元测试。这些数量不代表全量验收通过。发布前应重新运行 `node scripts/acceptance-inventory.mjs`，生成的 `artifacts/implementation-20261031/acceptance-source-inventory.json` 保留每个入口的源码、方法和测试文件。

普通账号HTTP测试、模型探针、真实业务AI、浏览器交互、部署后重启分别计证据。HTTP200、模型目录可见、已有测试文件、演示账号巡检均不能替代正式普通账号业务通过。本清单尚未取得能关联当前发布SHA的逐页Chrome报告；桌面、390px手机和768px平板的全部可见操作仍需主任务独立记录。根代理切换到实测Qwen文本配置后，先前GLM成功结果保留历史价值，但不能自动证明新配置的当前业务通过。

## 已有证据及边界

报告均位于忽略的 `artifacts/implementation-20261031/`，完整凭据、Cookie、模型body及儿童ID只保留在私有manifest/journal。下表不包含私人内容。

| 代号 | 报告 | 已实际完成 | 不能据此声称 |
|---|---|---|---|
| C-PROD | `prod-core-before-report.json` | 旧正式HTTPS网站20项零AI普通账号检查通过：记录、私有照片、家长反馈、四类越权、10并发无丢写、防重、退出及合法签名过期会话 | 候选发布、课程、AI、完整页面和重启通过 |
| C-LOCAL | `local-core-final-report.json` | 本地隔离候选相同20项零AI检查通过 | 生产性能或浏览器通过 |
| AI-LOCAL | `local-core-final-ai-report.json` | GLM真实建议初次/更新、两次缓存、教师沟通润色、周报、会诊SSE共7项通过；**家长反馈润色1项失败** | 所有工作流、JSON会诊、反馈润色或Qwen配置通过 |
| COURSE-LOCAL | `local-courses-real-report.json` | 本地24项通过：8账号儿童隔离、家长目录/互动/实践反馈、防重与冲突、换会话读回、非家长及跨儿童拒绝 | 真实向量推荐全流程、正式网站课程页面、B站点击交互通过 |
| SQL-LOCAL | `parent-courses-sql-integration.json` | 真MySQL隔离库21项：学习事件、任务幂等、租约并发、未知状态不重发、身份/维度缓存边界、权限撤销和连接重建 | 普通登录会话、真实模型推荐或生产重启通过 |
| VOICE-LOCAL | `local-entrances-voice-report.json` | 教师语音上传及家长通用ASR2项真实MaaS通过；教师转写存合成成长记录，由家长读回 | 教师语音理解弹层、命令执行、浏览器麦克风/播放、全部语音入口通过 |
| EXTRA-LOCAL | `local-entrances-vision-diet-report.json` | 三角色确定性intent通过；识图请求失败后停止，diet被阻断 | 识图或膳食AI业务通过 |
| BOOK-LOCAL | `local-storybook-report.json`、`local-storybook-r2-report.json` | 独立普通账号登录通过；绘本文字请求失败后停止 | 绘本文字、四图四音、保存、分享、导出或重启恢复通过 |
| PERF-BEFORE | `performance-before-filled.json`及`performance-before-filled-context.json` | 旧生产同一已填充家长/儿童，5并发90次读取均200；state/children/growth p95分别780.64/314.31/398.59ms | 候选after、页面LCP/CLS、10并发写性能或OOM通过 |

`local-entrances-voice-counter-summary.json` 是原语音报告的独立统计勘误：本轮实际开始2个业务请求，预留0.4元；原report的0.7元是同一journal累计预留，包含此前识图0.3元。原始报告不改写。脚本现以 `actualRequestStarted` 统计请求，以 `mode:live` 保留来源证据；已保存body重验不计新调用。所有预留都不是实际账单。

## 全部页面与待验可见操作

下表“已有证据”只指对应业务片段；所有行均需正式候选的真实Chrome交互、控制台/404检查、加载/空/失败态和适用角色拒绝。共享页面的写权限需按教师/园长和家长实际角色分别检查。

| 页面 | 受众/用途 | 必测可见操作与关联业务 | 已有片段证据 |
|---|---|---|---|
| `/` | 园长总览 | 儿童切换/筛选、风险卡、周报主动生成、周报保存/重开/导出/分享、导航 | AI-LOCAL仅周报生成；其余待验 |
| `/admin` | 园长管理 | 汇总、通知、派发、会话状态、跨机构拒绝 | 待验 |
| `/admin/agent` | 园长AI工作台 | daily-priority、question-follow-up、weekly-ops-report，结果保存/派发 | 新脚本admin三阶段已定义，实际待验 |
| `/admin/ai-provider-status` | 园长能力状态 | 已配置/真实通过/失败区分、模型身份、紧急停用展示 | 待验；不能用configured当live |
| `/admin/teachers` | 园长教师管理 | 教师新增/编辑/归档、邀请码创建/接受、异机构拒绝 | 矩阵setup用过注册邀请码；完整管理待验 |
| `/auth/login` | 兼容入口 | 重定向至`/login`并保留正确导航行为 | 待验 |
| `/auth/register` | 兼容入口 | 重定向至`/register` | 待验 |
| `/children` | 授权角色儿童管理 | 列表、详情、切换、编辑、归档、异班/跨儿童范围 | C-PROD/C-LOCAL仅列表与作用域 |
| `/diet` | 饮食记录 | 普通记录、防重、照片重传、食物识别、膳食评价、历史AI来源 | C-*普通记录；EXTRA-LOCAL识图失败/评价阻断 |
| `/growth` | 成长档案 | 健康/饮食/成长一日视图、日期/记录者/更新时间、照片只重传、筛选 | C-*记录与私有照片；完整UI待验 |
| `/health` | 健康管理 | 晨检、记录更新、材料入口、私有附件、健康分析来源 | C-*普通晨检；材料/OCR待验 |
| `/login` | 公共登录 | 普通三角色登录、错误口令、退出后重进、过期引导 | C-*API登录/会话；UI待验 |
| `/register` | 公共注册 | 园长注册、邀请教师/家长、重复信息、错误邀请码、角色落点 | 矩阵setup实际普通注册；UI/错误态待验 |
| `/parent` | 家长首页 | 授权儿童切换、一日记录同步、已有方案展示、主动更新、依据和回看 | C-*、AI-LOCAL建议/缓存片段 |
| `/parent/agent` | 家园沟通与家长AI | 反馈、附件、消息/回复/已读、反馈润色、追问、趋势、提醒状态 | C-*反馈；AI-LOCAL润色失败；其他待验 |
| `/parent/courses` | 家长三元课程 | 9课目录、月龄/模块、详情、知识卡、自检、家庭实践、B站BV外链、打开≠完成、5/10/20分钟推荐、反馈和换设备续学 | COURSE-LOCAL及SQL-LOCAL；真实推荐/UI待验 |
| `/parent/onboarding/child` | 家长建档 | 姓名/出生/性别、三项同意、重复点击、错误回显、成功跳转、多儿童 | setup实际建档与同意；完整UI待验 |
| `/parent/reminders` | 家长提醒 | 创建/编辑、执行/完成、儿童切换、刷新持久化、越权 | 待验 |
| `/parent/storybook` | 家长绘本 | 个性化/主题/混合、4/5/6/8页、预设/自定义风格、文字先返、当前页优先、单页失败、保存/重开/朗读/分享/导出、断线恢复 | BOOK-LOCAL失败；完整体验待验 |
| `/privacy` | 公共隐私条款 | 内容、监护同意链接可读和返回 | 待验 |
| `/teacher` | 教师工作台 | 班级范围、一日反馈、记录/照片、家长反馈、任务和语音弹层 | C-*记录与反馈；其他待验 |
| `/teacher/home` | 兼容教师页面 | 与教师工作台相同组件的导航和状态；本页不是重定向 | 待验 |
| `/teacher/agent` | 教师AI工作台 | 各workflow、沟通润色、成长建议、家长反馈读取、消息/派发、语音 | AI-LOCAL仅communication；其他待验 |
| `/teacher/health-file-bridge` | 教师健康材料 | 私有上传、OCR、签名结果写回、刷新/另一会话读回、Brain耐久性 | 新脚本health阶段已定义，实际待验 |
| `/teacher/high-risk-consultation` | 教师会诊 | 儿童scope、SSE逐步状态/正文/done、取消/断线、会诊feed、记录/备注/状态 | AI-LOCAL仅SSE；其余待验 |
| `/teacher/storybook` | 教师绘本 | 与家长相同真实媒体链路，教师班级scope、家长另一会话读取、侧栏课程入口角色落点 | BOOK-LOCAL失败；完整体验待验 |
| `/terms` | 公共服务条款 | 内容、注册/建档同意链接、返回 | 待验 |
| `/visual-parity/states` | 内部视觉夹具 | 单独记录夹具用途及普通访问边界，不当作真实账号业务页面证明 | 待验，单列演示/视觉报告 |

## AI与新增能力逐入口清单

所有收费入口需先核验当前模型、协议和计费，并使用独立journal；原请求未知时不自动重发。`core-journey-real-matrix.mjs`总预留≤10元、`ai-entrances-real-matrix.mjs`≤3元、`storybook-media-real-matrix.mjs`整册≤5元；主任务仍须累计所有直接探针、重试批次及推荐费用，确保整轮≤30元。脚本上限不能相加当作实际账单。

| API/能力 | 真实用途、来源断言及已定义验证 | 当前证据/剩余 |
|---|---|---|
| `POST /api/ai/suggestions` | 授权儿童服务端快照；真实provider/model、行动/依据/回看；初次/更新/两次cache-only | AI-LOCAL四检查通过；新Qwen/生产待验 |
| `POST /api/ai/follow-up` | 基于已生成方案和当前儿童记录追问；家庭步骤与48小时回看 | extra脚本`follow-up`定义；实际待验 |
| `POST /api/ai/parent-message-reflexion` | 家长反馈润色/反思；教师403是正确隔离，教师润色另走teacher-agent | AI-LOCAL失败，需修复并另存复验 |
| `POST /api/ai/weekly-report` | 真实周报生成；与`/api/weekly-reports`持久化/分享/导出分别验收 | AI-LOCAL生成通过；完整保存/导出待验 |
| `POST /api/ai/teacher-agent` | 教师各workflow；communication是真正教师反馈润色；不能用家长入口替代 | AI-LOCAL仅communication通过；其他workflow待验 |
| `POST /api/ai/admin-agent` | daily-priority、question-follow-up、weekly-ops-report三可见流程 | extra脚本`admin-daily/admin-follow-up/admin-weekly`定义；实际待验 |
| `POST /api/ai/parent-trend-query` | 数字为确定性聚合、逐日与已保存饮食对照；文字解释另要求真实模型轨迹 | extra脚本`trend`定义；实际待验 |
| `POST /api/ai/vision-meal` | 真实合成食品识别，签名结果存餐食且家长读回；不能只验证返回食物数组 | EXTRA-LOCAL上游失败；当前模型切换后待验 |
| `POST /api/ai/diet-evaluation` | 年龄对应评估、0–100分、真实来源及建议，存aiEvaluation读回 | EXTRA-LOCAL被前置阻断，待验 |
| `POST /api/ai/health-file-bridge` | 真实私有材料OCR读到合成36.5；OCR与保守规则分析分开，不把规则说成AI诊断 | extra脚本`health`定义；材料parse写回/家长读回/Brain重启待验 |
| `POST /api/ai/teacher-voice-upload` | 真ASR、无fallbackText，draftContent与transcript一致，存成长记录且家长读回 | VOICE-LOCAL通过；浏览器录音和正式环境待验 |
| `POST /api/ai/voice-asr` | 家长通用ASR，仅转写API，不假称已保存原音频 | VOICE-LOCAL通过；正式环境待验 |
| `POST /api/ai/teacher-voice-understand` | 教师语音弹层：ASR＋受控理解和draft；与teacher-voice-upload不同入口 | 有源码/测试，**未纳入现有extra脚本**；需新增真实入口验收 |
| `POST /api/voice-assistant/commands` | 三角色受控命令plan/confirm/execute/replay；确定性解析无需强求live模型，确认后写入需正常权限/幂等 | 有源码/测试，**本轮普通API未执行** |
| `POST /api/ai/intent-router` | 三角色规则路由、ruleId、目标workflow和安全deeplink；不要求模型、不执行后续workflow | EXTRA-LOCAL三角色规则通过 |
| `POST /api/ai/admin-quality-metrics` | 园长质量指标规则引擎；不是收费LLM，需核实机构范围与数字 | 有源码/测试，本轮未执行；前端优先GET analytics后此POST兜底 |
| `GET /api/ai/provider-status` | 按能力区分configured/真实观测/失败，安全模型身份和状态 | 状态页/权限/断开状态待验 |
| `POST /api/ai/high-risk-consultation/stream` | SSE状态、正文、done，真实provider；进度不冒充完成 | AI-LOCAL通过；断线/取消/正式环境待验 |
| `POST /api/ai/high-risk-consultation` | 非流式JSON会诊是独立路由 | 不能由SSE通过推导；实际待验 |
| `GET /api/ai/high-risk-consultation/feed` | 普通账号scope会诊feed、刷新与过滤 | 实际待验 |
| `POST /api/ai/parent-storybook` | 真实文字先返回，恰当页数、实际模型逐字匹配核验价格文件 | BOOK-LOCAL失败；脚本允许精确GLM或qwen3.8-flash，待新批次 |
| `POST /api/ai/parent-storybook/media-status` | 单调至多一图一音、当前页优先、retryFailed=false、未知即停 | 未获完整真实业务成功证据 |
| `GET /api/ai/parent-storybook/media/[mediaKey]` | 4WebP解码/4WAV有效采样、private_blob/授权、其他家长/匿名拒绝 | 待绘本生成后实际验证 |
| `POST /api/parent/course-recommendations`、`GET .../[jobId]` | ≤20候选选1–3，5/10/20分钟硬预算，真实向量身份/维度、组合复核、持久任务、私人缓存 | SQL-LOCAL租约/幂等已验；真实向量＋全部普通业务流程仍待验 |
| `POST /api/ai/react-agent`、`POST /api/ai/stream` | 当前源代码限定`normalAccountAccess:demo-only`；普通账号应安全拒绝，不得演示调用冒充普通业务 | 单独验证拒绝；演示巡检另列，不能要求开放权限来追求绿灯 |
| `GET/POST /api/storybooks/lin-xiaoyu/tts` | 历史固定演示儿童TTS入口，保留兼容边界 | 不替代普通儿童绘本音频，单列旧入口检查 |

当前额外脚本的stage为intent、vision、diet、health、teacher-voice、asr、follow-up、trend、admin-daily、admin-follow-up、admin-weekly。脚本默认只plan；有源码的其他入口不能被这11个stage名称笼统覆盖。每轮报告应同时记录真实model、live/fallback、有效内容、正常API持久化读回，以及是否本轮实际开始请求。

## 普通业务与发布剩余检查

1. 三角色消息、回复、已读、会话状态；提醒、任务派发/状态、园长通知；教师CRUD/归档；儿童编辑/归档；各类记录归档和反馈PATCH。现有核心矩阵只覆盖其子集，不属于完整CRUD验收。
2. 周报/绘本保存、列表、详情、改动、归档（适用时）、五种导出、分享文本及各自越权；不得用AI生成成功代替保存成功。
3. 课程详情、真实BV外链打开、不自动完成、全部9课适龄边界、5/10/20分钟预算、推荐反馈改变下次组合、向量模型变化后失效、刷新/更换设备、worker重启后继续。
4. 全页面按普通角色桌面/390px/768px逐个按钮检查，录音授权、真实图片/音频阅读播放、SSE、断网恢复、控制台和资源404。记录页面LCP/CLS；APIp95不冒称LCP。
5. 候选部署后复用PERF-BEFORE同一已填充合成儿童做after，普通10并发业务无丢写、意外5xx或OOM；收费模型不压测。
6. 重启本次容器后读回MySQL、Brain SQLite、课程任务、学习进度和私有Blob；DNS、两个域名TLS/HTTP跳转、Cookie、发布SHA、紧急开关及恢复说明分别留证。

既有 `tests/production-real/three-role.spec.ts`、`tests/product-completion/*`、`tests/feature-completion/*` 和 `tests/bug-bash/*` 是可复用测试定义。需检查账号来源、旧Vivo假设和目标版本；本清单不据其存在认定已运行，更不把demo通过升级为普通账号通过。最终报告应列通过/失败/阻塞/未执行及证据路径，关键缺口关闭前不声明全量通过。

## 全部API方法清单

下表由源码路由生成，列出全部110个方法操作；证据的细分范围以上文为准。同一路由含多个方法时，某一方法通过不能推导其余方法通过。

| 路由 | HTTP方法 | 源码同目录单元测试 |
|---|---|---|
| `/api/account/member-invitations/accept` | POST | 存在；执行结果另查报告 |
| `/api/admin/member-invitations` | POST | 存在；执行结果另查报告 |
| `/api/admin/notification-events` | GET / POST / PATCH | 存在；执行结果另查报告 |
| `/api/ai/admin-agent` | POST | 存在；执行结果另查报告 |
| `/api/ai/admin-quality-metrics` | POST | 存在；执行结果另查报告 |
| `/api/ai/diet-evaluation` | POST | 存在；执行结果另查报告 |
| `/api/ai/follow-up` | POST | 存在；执行结果另查报告 |
| `/api/ai/health-file-bridge` | POST | 存在；执行结果另查报告 |
| `/api/ai/high-risk-consultation/feed` | GET | 存在；执行结果另查报告 |
| `/api/ai/high-risk-consultation` | POST | 存在；执行结果另查报告 |
| `/api/ai/high-risk-consultation/stream` | POST | 存在；执行结果另查报告 |
| `/api/ai/intent-router` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/ai/parent-message-reflexion` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/ai/parent-storybook/media-status` | POST | 存在；执行结果另查报告 |
| `/api/ai/parent-storybook/media/[mediaKey]` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/ai/parent-storybook` | POST | 存在；执行结果另查报告 |
| `/api/ai/parent-trend-query` | POST | 存在；执行结果另查报告 |
| `/api/ai/provider-status` | GET | 存在；执行结果另查报告 |
| `/api/ai/react-agent` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/ai/stream` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/ai/suggestions` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/ai/teacher-agent` | POST | 存在；执行结果另查报告 |
| `/api/ai/teacher-voice-understand` | POST | 存在；执行结果另查报告 |
| `/api/ai/teacher-voice-upload` | POST | 存在；执行结果另查报告 |
| `/api/ai/vision-meal` | POST | 存在；执行结果另查报告 |
| `/api/ai/voice-asr` | POST | 存在；执行结果另查报告 |
| `/api/ai/weekly-report` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/analytics/admin/quality-metrics` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/analytics/admin/summary` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/analytics/director-dashboard` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/analytics/parent-home` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/analytics/teacher-workbench` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/analytics/trends` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/assignments/[assignmentId]` | PATCH | 无同目录测试；可能有集中集成测试 |
| `/api/assignments` | GET / POST | 无同目录测试；可能有集中集成测试 |
| `/api/attachments/[attachmentId]/content` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/attachments/[attachmentId]` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/attachments` | GET / POST | 无同目录测试；可能有集中集成测试 |
| `/api/attachments/upload` | POST | 存在；执行结果另查报告 |
| `/api/auth/demo-login` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/auth/login` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/auth/logout` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/auth/register` | POST | 存在；执行结果另查报告 |
| `/api/auth/session` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/children/[childId]/archive` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/children/[childId]` | GET / PATCH | 无同目录测试；可能有集中集成测试 |
| `/api/children/[childId]/trend` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/children` | GET / POST | 无同目录测试；可能有集中集成测试 |
| `/api/consultations/[consultationId]/notes` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/consultations/[consultationId]/status` | PATCH | 无同目录测试；可能有集中集成测试 |
| `/api/consultations` | GET / POST | 无同目录测试；可能有集中集成测试 |
| `/api/conversations/[conversationId]/status` | PATCH | 无同目录测试；可能有集中集成测试 |
| `/api/demo/reset` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/demo/session` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/demo/session/switch` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/feedback/[feedbackId]` | GET / PATCH | 无同目录测试；可能有集中集成测试 |
| `/api/feedback` | GET / POST | 无同目录测试；可能有集中集成测试 |
| `/api/health-materials/[materialId]/parse` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/health-materials/[materialId]` | PATCH | 无同目录测试；可能有集中集成测试 |
| `/api/health-materials` | GET / POST | 无同目录测试；可能有集中集成测试 |
| `/api/health` | GET | 存在；执行结果另查报告 |
| `/api/messages/[messageId]/read` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/messages/[messageId]/reply` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/messages` | GET / POST | 无同目录测试；可能有集中集成测试 |
| `/api/parent/children` | POST | 存在；执行结果另查报告 |
| `/api/parent/course-recommendations/[jobId]` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/parent/course-recommendations` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/parent/courses/[courseId]/events` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/parent/courses/[courseId]` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/parent/courses` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/records/[recordId]/archive` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/records/[recordId]` | PATCH | 无同目录测试；可能有集中集成测试 |
| `/api/records` | GET / POST | 无同目录测试；可能有集中集成测试 |
| `/api/reminders/[reminderId]` | PATCH | 无同目录测试；可能有集中集成测试 |
| `/api/reminders` | GET / POST | 无同目录测试；可能有集中集成测试 |
| `/api/state` | GET / PUT | 存在；执行结果另查报告 |
| `/api/storybooks/[storybookId]/export` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/storybooks/[storybookId]` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/storybooks/[storybookId]/share` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/storybooks/lin-xiaoyu/tts` | GET / POST | 无同目录测试；可能有集中集成测试 |
| `/api/storybooks` | GET / POST | 无同目录测试；可能有集中集成测试 |
| `/api/teachers/[teacherId]/archive` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/teachers/[teacherId]` | GET / PATCH | 无同目录测试；可能有集中集成测试 |
| `/api/teachers` | GET / POST | 无同目录测试；可能有集中集成测试 |
| `/api/voice-assistant/commands` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/weekly-reports/[reportId]/archive` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/weekly-reports/[reportId]/export` | GET | 无同目录测试；可能有集中集成测试 |
| `/api/weekly-reports/[reportId]` | GET / PATCH | 无同目录测试；可能有集中集成测试 |
| `/api/weekly-reports/[reportId]/share` | POST | 无同目录测试；可能有集中集成测试 |
| `/api/weekly-reports` | GET / POST | 无同目录测试；可能有集中集成测试 |

