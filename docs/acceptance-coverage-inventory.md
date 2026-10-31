# 页面、接口与真实验收覆盖清单

本清单记录2026-10-31工作树的源码入口和当时已落盘的验收证据。静态扫描得到 **28个页面、90条API路由、110个HTTP方法操作**；25条路由有同目录单元测试。这些数量不代表全量验收通过。发布前应重新运行 `node scripts/acceptance-inventory.mjs`，生成的 `artifacts/implementation-20261031/acceptance-source-inventory.json` 保留每个入口的源码、方法和测试文件。

最终交付以 [最终验收报告](release/tencent-final-acceptance-20261031.md) 为准。正式完整业务报告锁定0639，晚期修复、只读复验及四容器重启锁定ac5；最后公共页面补丁通过最终Node **858**、Python **286**、lint和types，保留不同报告原SHA。下表说明每一份证据实际能证明什么；它不能单独代表全部页面、按钮、设备或错误组合均通过。
## 正式发布证据及边界

报告均位于忽略的 `artifacts/implementation-20261031/`，完整凭据、Cookie、模型body及儿童ID只保留在私有manifest/journal。下表不包含私人内容。

| 代号 | 正式证据 | 实际完成 | 尚未由该证据证明 |
|---|---|---|---|
| F-STATIC | [ac5 Node](../artifacts/implementation-20261031/node-final-public-routes.log)、[Python](../artifacts/implementation-20261031/python-ac5b8d5.log)、[lint](../artifacts/implementation-20261031/lint-final-public-routes.log)、[types](../artifacts/implementation-20261031/types-final-public-routes.log)、[web](../artifacts/implementation-20261031/web-ac5b8d5.log)、[backend](../artifacts/implementation-20261031/backend-ac5b8d5.log) | 最终Node858/858、Python286/286，0跳过；lint/types/Linux构建通过，1条依赖弃用警告 | 不代替ac5生产复测、浏览器或重启；0639的825/281属于前一轮次 |
| F-CORE | [正式核心20项](../artifacts/implementation-20261031/prod-core-0639de1-report.json) | 教师三类记录/私有照片/家长读回/执行反馈教师读回、四类隔离、匿名、并发防丢写/防重、退出和过期会话 | 全部CRUD、录音/播放/布局；退出只清客户端Cookie，不代表服务端撤销所有历史令牌 |
| F-AI | [正式核心AI8项](../artifacts/implementation-20261031/prod-core-0639de1-ai-report.json) | 实际Qwen初次/更新方案及各自缓存、教师沟通、周报、SSE、家长反馈润色 | SSE取消/断网、所有workflow、所有页面按钮 |
| F-PERSIST | [正式AI结果持久化7项](../artifacts/implementation-20261031/prod-core-0639de1-ai-persistence-report.json) | 复用已收到结果，按现有业务保存/读取验证，新增模型请求0 | 生产容器重启后的耐久性 |
| F-COURSE | [正式课程24项](../artifacts/implementation-20261031/prod-courses-0639de1-report.json) | 2机构8普通账号4合成儿童的目录/详情/互动/实践反馈、幂等冲突、换会话读回及隔离 | 9课全按钮/全部月龄、BV实际点击、跨设备/重启UI |
| F-EXTRA | [正式既有入口10项](../artifacts/implementation-20261031/prod-entrances-0639de1-report.json)、[锁版](../artifacts/implementation-20261031/prod-entrances-0639de1-context.json) | vision/diet/health/teacher-voice/asr/follow-up/trend/admin三workflow全部通过，10新业务请求、预留2.3元；适用记录/签名回执保存并由家长读回 | 真实麦克风/声音；健康OCR后分析是保守规则，Brain重启尚未证明 |
| F-REMAIN | [正式补充2项](../artifacts/implementation-20261031/prod-remaining-0639de1-report.json) | 语音理解弹层、JSON会诊及适用保存/读回/feed/越权通过，预留0.7元 | 不以通用ASR替代语音理解；实际麦克风/会诊UI仍另验 |
| F-BOOK | [正式绘本48项](../artifacts/implementation-20261031/prod-storybook-0639de1-report.json)、[分镜4页对应](../artifacts/implementation-20261031/prod-storybook-0639de1-alignment-report.json) | 0639 HTTP的4页文字/4图4音、保存重开、导出分享；8.701s/21.372s/65.592s。后来真实浏览器发现跨角色重开失败；ac5后已恢复原canonical并完成4图4音/全书播放/分享后重开，见追加证据 | 原48项不覆盖浏览器自动回写；追加15项和真实UI及重启证据分别归档 |
| F-RECOMM | [正式5/20分钟](../artifacts/implementation-20261031/prod-recommendations-0639de1-report.json)、[5分钟](../artifacts/implementation-20261031/prod-recommendations-0639de1-5m-report.json)、[20分钟](../artifacts/implementation-20261031/prod-recommendations-0639de1-20m-report.json) | 实际Qwen+1024维向量身份、预算/组合得分和跨家长拒绝通过 | 10分钟普通浏览器及负反馈后组合已经观察，详见实际交互清单；本份5/20报告不覆盖全部组合 |
| F-READ | [正式只读r2](../artifacts/implementation-20261031/prod-readonly-0639de1-r2-report.json)、[受控跳转](../artifacts/implementation-20261031/prod-readonly-0639de1-redirect-controlled-denial.json) | 匿名按契约拒绝92、另计3受控307、普通读取43、明示排除15；其中AI24方法严格401，模型调用0 | 3个307不算严格401；完整CRUD、排除项及UI不由读取通过推导 |
| F-PERF | [固定数据before](../artifacts/implementation-20261031/performance-before-filled.json)、[after](../artifacts/implementation-20261031/performance-after-filled-0639de1.json) | 相同5并发90GET，state/children/growth p95为780.64→526.354、314.31→207.7783、398.59→200.3129ms；意外状态0 | 页面LCP/CLS、长期负载、无OOM不能由API短测推导 |

正式核心75次普通读写p95=898.87ms，10个不同并发写入均保存，10个相同提交只有1条；并发写入子集p95=1471.71ms，不能以整体p95宣称每类操作都≤1秒。上述正式业务报告锁定0639de1，F-STATIC为ac5候选回归，二者不能混为最终生产通过。分类预留总上界26.5元，整轮实际账单仍未知，继承预留不当实付。


| 追加证据 | 已完成范围 | 明确边界 |
| --- | --- | --- |
| [ac5普通复核](../artifacts/implementation-20261031/prod-smoke-ac5b8d5-summary.json) | 92匿名拒绝、3受控跳转、43普通读取及6课程进度/既有推荐检查 | 不创建模型请求或业务新写 |
| [绘本15项](../artifacts/implementation-20261031/prod-storybook-provenance-ac5b8d5-after-share-report.json) | 原canonical、8媒体逐字节解码、跨角色免费接续、越权拒绝、既有导出 | 恢复只保存原教师结果一次；201断言误报/合法再次分享导致的旧断言失败保留 |
| [重启比较v2](../artifacts/implementation-20261031/persistence-ac5-comparison-v2.json) | 58关键业务、28Brain记录、22表、4卷，既有独立表资料保持 | 非全库逐行恢复演练；首比较仅mount数组顺序误报原样保留 |
| [结构补充13项](../artifacts/implementation-20261031/prod-schema-0639de1-supplement-validation.json) | 旧132必需列/11索引规则、新52列/14索引和SHOW CREATE | 不冒充旧Vercel formal gate |
| [浏览器原始观察](../artifacts/implementation-20261031/production-browser-evidence.json) | Chrome桌面、内置浏览器390/768；稳定正文与加载中历史分列，另记真实操作 | 观察不等于全按钮；根路径为既有角色首页跳转契约 |
| [最终用量](../artifacts/implementation-20261031/usage-final-estimate.json) | 62次可识别调用约0.928789025元；26.5元预留上界 | 月账单0.03元仍出账中，完整实付未知 |

## 晚期真实浏览器缺陷与最终候选修复

[实际浏览器证据](../artifacts/implementation-20261031/production-browser-evidence.json) 保留交互和失败。下列四项均在 `ac5b8d5` 实施并回归，**生产复测、重启读回和推送仍待完成**；详细根因及边界见[发布报告](release/tencent-restoration-20261031.md)。

| 浏览器实际发现 | ac5候选修复 | 最终待复测 |
|---|---|---|
| 家长播放教师生成书、下载/复制后离开重开，真实媒体降为unverified并清空 | 删除只读恢复自动保存；签名正文原样保留；服务端以授权规范原版继续，事务拒绝未验来源/倒退版本覆盖已付费媒体，跨用户验签不放宽 | 跨角色重新打开→播放/导出/分享→离开再开→重启后读取；[原失败](../artifacts/implementation-20261031/prod-storybook-ui-provenance-failure.txt)不改写 |
| “主动参与/情绪稳定”等固定正向标签显示为主要阻碍 | 区分观察/支持需求/真正障碍；新输入、历史受控文案与AI可信投影修正，原始历史内容不批量修改 | 家长正向反馈提交→教师读回、旧记录与后续输入语义 |
| 同日记录显示4/7天、57%，依据展开直接泄露历史模型JSON | UTC+8近7业务日去重，feedbackBusinessDate处理反馈；派生视图过滤JSON/internal/role参数，历史建议不标成新事实；后端只取完整typed摘要并要求历史证据待确认 | 正式唯一业务日、清洁依据、原签名body不变；[原DOM](../artifacts/implementation-20261031/prod-ui-parent-agent-390.txt)保留 |
| 仅有成长照片、无餐食的儿童显示低蔬果/补水并退回旧任务 | 无对应餐食显示缺记录/不评估，真实记录零值阈值保留；首页复用0–36月龄规则，不再随机学前任务 | 第二儿童只有成长/照片时缺数据提示、24–36月龄规则、有餐食后的原阈值 |

附带修正无出勤记录显示为缺勤的标签；明确缺勤原因/操作保持。静态通过不替代上述真实浏览器复验，不重新生成已付费Blob来掩盖来源恢复问题。

## 历史证据（保留原失败与未知状态）

下表仅用于追溯。旧失败未删除；本次正式新意图成功不改变旧unknown，也不意味着旧请求免费。

| 代号 | 报告 | 已实际完成 | 不能据此声称 |
|---|---|---|---|
| C-PROD | `prod-core-before-report.json` | 旧正式HTTPS网站20项零AI普通账号检查通过：记录、私有照片、家长反馈、四类越权、10并发无丢写、防重、退出及合法签名过期会话 | 候选发布、课程、AI、完整页面和重启通过 |
| C-LOCAL | `local-core-final-report.json` | 本地隔离候选相同20项零AI检查通过 | 生产性能或浏览器通过 |
| AI-LOCAL | `local-core-final-ai-report.json` | GLM真实建议初次/更新、两次缓存、教师沟通润色、周报、会诊SSE共7项通过；**家长反馈润色1项失败** | 所有工作流、JSON会诊、反馈润色或Qwen配置通过 |
| AI-QWEN | `local-core-qwen-ai-report.json`、`local-core-qwen-ai-completion-report.json` | 初轮真实初次方案/缓存2项通过，更新缓存断言失败后停止；后续completion更新/缓存、教师沟通、周报、SSE、家长反馈润色6项通过、0失败，实际model均为qwen3.8-flash | 删除初轮失败、把两轮合成单轮全绿、最终周报范围/反馈版本/页面无自动收费已验，或正式网站通过 |
| COURSE-LOCAL | `local-courses-real-report.json` | 本地24项通过：8账号儿童隔离、家长目录/互动/实践反馈、防重与冲突、换会话读回、非家长及跨儿童拒绝 | 真实向量推荐全流程、正式网站课程页面、B站点击交互通过 |
| SQL-LOCAL | `parent-courses-sql-integration.json` | 真MySQL隔离库21项：学习事件、任务幂等、租约并发、未知状态不重发、身份/维度缓存边界、权限撤销和连接重建 | 普通登录会话、真实模型推荐或生产重启通过 |
| VOICE-LOCAL | `local-entrances-voice-report.json` | 教师语音上传及家长通用ASR2项真实MaaS通过；教师转写存合成成长记录，由家长读回 | 教师语音理解弹层、命令执行、浏览器麦克风/播放、全部语音入口通过 |
| EXTRA-LOCAL | `local-entrances-vision-diet-report.json` | 三角色确定性intent通过；识图请求失败后停止，diet被阻断 | 识图或膳食AI业务通过 |
| EXTRA-QWEN | `local-entrances-qwen-media-report.json`、`local-entrances-qwen-health-revalidated-report.json` | 新Qwen识图/膳食评价及适用保存读回通过；健康真实OCR原签名body已保存，修正QA枚举后复用原body完成completed及家长读回，重验0新模型请求 | 旧failed报告被删除或改写；Brain SQLite重启耐久性通过 |
| REMAINING-FREE | `local-remaining-anonymous-report.json`、`local-remaining-commands-report.json`、`local-remaining-quality-report.json`、`local-remaining-feed-report.json` | 31路由32方法匿名401；三角色命令、两次确认写入/读回/防重放、四类越权；两机构质量规则与防伪snapshot；非空普通feed与隔离，全部0模型 | 新教师语音理解真实调用、JSON会诊真实生成或生产浏览器通过 |
| REMAINING-QWEN | `local-remaining-paid-qwen-report.json`及同名`context.json` | 候选5bb5e4e两项通过：真实ASR语音理解与Qwen JSON会诊，正常API保存、家长读回、feed关联及越权；2个新业务请求、预留0.7元，无未知/重发，执行前后SHA一致 | 浏览器麦克风/逐页UI、生产重启或网关实际账单已核清 |
| BOOK-LOCAL | `local-storybook-report.json`、`local-storybook-r2-report.json` | 独立普通账号登录通过；绘本文字请求失败后停止 | 绘本文字、四图四音、保存、分享、导出或重启恢复通过 |
| BOOK-QWEN | `local-storybook-5bb5e4e-report.json` | 后续四页真实文字先返回、实际来源及保存前媒体为空检查通过，文字响应约11.48秒；首轮媒体失败后保留received-needs-validation，未自动重发 | 四图/四音完成、受保护媒体HTTP读取、实际播放、整册保存重开、分享/导出或重启通过 |
| BOOK-REGRESSION | `storybook-critical-fix-node.log`、`media-cold-read-regression.log`、`storybook-receipts-sql-integration.json` | 追加Node集合41/41、冷读集合21/21；真实MySQL收据9/9，增量迁移重复执行、身份隔离、租约恢复/连接重建，无模型调用 | 修复已进入正式镜像、旧失败被消除或全册真实媒体已通过；各集合有交集不能累加 |
| PERF-BEFORE | `performance-before-filled.json`及`performance-before-filled-context.json` | 旧生产同一已填充家长/儿童，5并发90次读取均200；state/children/growth p95分别780.64/314.31/398.59ms | 候选after、页面LCP/CLS、10并发写性能或OOM通过 |

`local-entrances-voice-counter-summary.json` 是原语音报告的独立统计勘误：本轮实际开始2个业务请求，预留0.4元；原report的0.7元是同一journal累计预留，包含此前识图0.3元。原始报告不改写。脚本现以 `actualRequestStarted` 统计请求，以 `mode:live` 保留来源证据；已保存body重验不计新调用。所有预留都不是实际账单。

早期Linux Node753/Python252、5bb以及0639的825/281回归保留为历史；当前F-STATIC为ac5的854/286。正式0639报告保持原版本边界，不能替代ac5生产复测；完整Chrome矩阵、重启/结构、网络最终复核、总账与GitHub main对照仍待补录，不能宣称全量交付结束。

## 全部页面与待验可见操作

下表“已有证据”只指对应业务片段；所有行均需正式候选的真实Chrome交互、控制台/404检查、加载/空/失败态和适用角色拒绝。共享页面的写权限需按教师/园长和家长实际角色分别检查。

| 页面 | 受众/用途 | 必测可见操作与关联业务 | 已有片段证据 |
|---|---|---|---|
| `/` | 园长总览 | 儿童切换/筛选、风险卡、周报主动生成、周报保存/重开/导出/分享、导航 | F-AI周报生成、F-PERSIST保存读取；页面按钮/导出UI待验 |
| `/admin` | 园长管理 | 汇总、通知、派发、会话状态、跨机构拒绝 | 待验 |
| `/admin/agent` | 园长AI工作台 | daily-priority、question-follow-up、weekly-ops-report，结果保存/派发 | F-EXTRA三workflow真实模型/有效动作通过；页面/实际派发待验 |
| `/admin/ai-provider-status` | 园长能力状态 | 已配置/真实通过/失败区分、模型身份、紧急停用展示 | 待验；不能用configured当live |
| `/admin/teachers` | 园长教师管理 | 教师新增/编辑/归档、邀请码创建/接受、异机构拒绝 | 矩阵setup用过注册邀请码；完整管理待验 |
| `/auth/login` | 兼容入口 | 重定向至`/login`并保留正确导航行为 | 待验 |
| `/auth/register` | 兼容入口 | 重定向至`/register` | 待验 |
| `/children` | 授权角色儿童管理 | 列表、详情、切换、编辑、归档、异班/跨儿童范围 | C-PROD/C-LOCAL仅列表与作用域 |
| `/diet` | 饮食记录 | 普通记录、防重、照片重传、食物识别、膳食评价、历史AI来源 | F-CORE普通记录、F-EXTRA真实识图/评价及保存读回；UI待验 |
| `/growth` | 成长档案 | 健康/饮食/成长一日视图、日期/记录者/更新时间、照片只重传、筛选 | F-CORE记录/照片/家长另一会话、F-EXTRA转写成长记录；完整UI待验 |
| `/health` | 健康管理 | 晨检、记录更新、材料入口、私有附件、健康分析来源 | F-CORE晨检、F-EXTRA真实OCR/规则分析及签名保存读回；完整UI待验 |
| `/login` | 公共登录 | 普通三角色登录、错误口令、退出后重进、过期引导 | C-*API登录/会话；UI待验 |
| `/register` | 公共注册 | 园长注册、邀请教师/家长、重复信息、错误邀请码、角色落点 | 矩阵setup实际普通注册；UI/错误态待验 |
| `/parent` | 家长首页 | 授权儿童切换、一日记录同步、已有方案展示、主动更新、依据和回看 | F-CORE/F-AI/F-PERSIST完成闭环与缓存；实际主卡/年龄/日期/主动生成UI待完整矩阵 |
| `/parent/agent` | 家园沟通与家长AI | 反馈、附件、消息/回复/已读、反馈润色、追问、趋势、提醒状态 | F-CORE反馈、F-AI润色、F-EXTRA追问/趋势正式通过；消息完整CRUD与按钮交互另验 |
| `/parent/courses` | 家长三元课程 | 9课目录、月龄/模块、详情、知识卡、自检、家庭实践、B站BV外链、打开≠完成、5/10/20分钟推荐、反馈和换设备续学 | F-COURSE/F-RECOMM正式5/20业务通过；10分钟UI/反馈由主任务进行，BV与完整尺寸矩阵待补 |
| `/parent/onboarding/child` | 家长建档 | 姓名/出生/性别、三项同意、重复点击、错误回显、成功跳转、多儿童 | setup实际建档与同意；完整UI待验 |
| `/parent/reminders` | 家长提醒 | 创建/编辑、执行/完成、儿童切换、刷新持久化、越权 | 待验 |
| `/parent/storybook` | 家长绘本 | 个性化/主题/混合、4/5/6/8页、预设/自定义风格、文字先返、当前页优先、单页失败、保存/重开/朗读/分享/导出、断线恢复 | F-BOOK正式四页4图4音/保存重开/分享/导出/权限通过；实际播放、其他参数与完整UI待验 |
| `/privacy` | 公共隐私条款 | 内容、监护同意链接可读和返回 | 待验 |
| `/teacher` | 教师工作台 | 班级范围、一日反馈、记录/照片、家长反馈、任务和语音弹层 | F-CORE闭环、F-REMAIN真实语音理解；其余按钮/麦克风UI待验 |
| `/teacher/home` | 兼容教师页面 | 与教师工作台相同组件的导航和状态；本页不是重定向 | 待验 |
| `/teacher/agent` | 教师AI工作台 | 各workflow、沟通润色、成长建议、家长反馈读取、消息/派发、语音 | F-AI正式communication、F-CORE家长反馈读回；其他workflow/按钮另验 |
| `/teacher/health-file-bridge` | 教师健康材料 | 私有上传、OCR、签名结果写回、刷新/另一会话读回、Brain耐久性 | F-EXTRA真实OCR/签名保存/家长读回；UI和Brain重启待验 |
| `/teacher/high-risk-consultation` | 教师会诊 | 儿童scope、SSE逐步状态/正文/done、取消/断线、会诊feed、记录/备注/状态 | F-AI正式SSE、F-REMAIN JSON保存/feed/家长读回；取消/断网及完整交互待验 |
| `/teacher/storybook` | 教师绘本 | 与家长相同真实媒体链路，教师班级scope、家长另一会话读取、侧栏课程入口角色落点 | F-BOOK共享媒体链路4图4音通过；教师页独立班级/按钮UI待验 |
| `/terms` | 公共服务条款 | 内容、注册/建档同意链接、返回 | 待验 |
| `/visual-parity/states` | 内部视觉夹具 | 单独记录夹具用途及普通访问边界，不当作真实账号业务页面证明 | 待验，单列演示/视觉报告 |

## AI与新增能力逐入口清单

收费入口使用已核实计费和独立journal，未知原意图不自动重发。核心业务分类≤10元、单入口journal≤3元、绘本分类≤5元；现行分类总上界26.50元，其他媒体/既有入口分类7元，整轮用户上限30元。当前分类分别为探针0.5/核心10/绘本5/浏览器1.5/推荐2.5/其他7，见[分类文件](../artifacts/implementation-20261031/qa-budget-allocations.json)。旧usage估算只覆盖对应时间截面，正式及浏览器之后的完整账单仍未知；分类、继承预留、估算不能相加冒充实付。

| API/能力 | 真实用途、来源断言及已定义验证 | 当前证据/剩余 |
|---|---|---|
| `POST /api/ai/suggestions` | 授权儿童服务端快照；真实provider/model、行动/依据/回看；初次/更新/两次cache-only | F-AI/F-PERSIST正式生成、两次缓存与保存读回通过；主卡/年龄/日期/无自动收费UI待完整矩阵 |
| `POST /api/ai/follow-up` | 基于已生成方案和当前儿童记录追问；家庭步骤与48小时回看 | F-EXTRA正式实际Qwen、3nextSteps/家庭动作/48h通过；页面另验 |
| `POST /api/ai/parent-message-reflexion` | 家长反馈润色/反思；教师403是正确隔离，教师润色另走teacher-agent | F-AI正式真实结果通过，模型与规则混合如实标注；旧失败保留，UI另验 |
| `POST /api/ai/weekly-report` | 真实周报生成；与`/api/weekly-reports`持久化/分享/导出分别验收 | F-AI生成/F-PERSIST保存读取通过；全部导出和页面另验 |
| `POST /api/ai/teacher-agent` | 教师各workflow；communication是真正教师反馈润色；不能用家长入口替代 | F-AI正式communication通过；其他workflow另验 |
| `POST /api/ai/admin-agent` | daily-priority、question-follow-up、weekly-ops-report三可见流程 | F-EXTRA正式三workflow各3实际行动，live/realProvider/requestId与机构范围通过；不自动派发 |
| `POST /api/ai/parent-trend-query` | 数字为确定性聚合、逐日与已保存饮食对照；文字解释另要求真实模型轨迹 | F-EXTRA正式hydration逐日核对与Qwen解释通过，两种来源分别记录 |
| `POST /api/ai/vision-meal` | 真实合成食品识别，签名结果存餐食且家长读回；不能只验证返回食物数组 | F-EXTRA正式真实识图/保存/家长读回通过；浏览器另验 |
| `POST /api/ai/diet-evaluation` | 年龄对应评估、0–100分、真实来源及建议，存aiEvaluation读回 | F-EXTRA正式实际模型/分数/保存/家长读回通过；浏览器另验 |
| `POST /api/ai/health-file-bridge` | 真实私有材料OCR读到合成36.5；OCR与保守规则分析分开，不把规则说成AI诊断 | F-EXTRA正式OCR/签名completed写回/家长读回通过；Brain重启待验 |
| `POST /api/ai/teacher-voice-upload` | 真ASR、无fallbackText，draftContent与transcript一致，存成长记录且家长读回 | F-EXTRA正式实际ASR/成长记录/家长读回通过；麦克风UI另验 |
| `POST /api/ai/voice-asr` | 家长通用ASR，仅转写API，不假称已保存原音频 | F-EXTRA正式qwen-audio-3.0-asr-flash转写通过；麦克风UI另验 |
| `POST /api/ai/teacher-voice-understand` | 教师语音弹层：真实ASR＋规则router/chaining与draft；与teacher-voice-upload不同入口 | F-REMAIN正式真实模型/草稿/适用保存读回及越权通过；麦克风UI另验 |
| `POST /api/voice-assistant/commands` | 三角色受控命令plan/confirm/execute/replay；确定性解析无需强求live模型，确认后写入需正常权限/幂等 | REMAINING-FREE三角色navigate、成长/反馈两次确认写入、篡改/未确认/重放/越权拒绝及对方读回通过；其余命令需分别验收 |
| `POST /api/ai/intent-router` | 三角色规则路由、ruleId、目标workflow和安全deeplink；不要求模型、不执行后续workflow | EXTRA-LOCAL三角色规则通过 |
| `POST /api/ai/admin-quality-metrics` | 园长质量指标规则引擎；不是收费LLM，需核实机构范围与数字 | REMAINING-FREE两机构儿童计数、8类数值、伪造snapshot/institution被忽略、非admin拒绝通过；前端优先GET analytics后此POST兜底 |
| `GET /api/ai/provider-status` | 按能力区分configured/真实观测/失败，安全模型身份和状态 | 状态页/权限/断开状态待验 |
| `POST /api/ai/high-risk-consultation/stream` | SSE状态、正文、done，真实provider；进度不冒充完成 | F-AI正式SSE通过；取消/断线UI另验 |
| `POST /api/ai/high-risk-consultation` | 非流式JSON会诊是独立路由 | F-REMAIN正式actualQwen、正文/动作、保存/家长读回/feed/越权通过 |
| `GET /api/ai/high-risk-consultation/feed` | 普通账号scope会诊feed、刷新与过滤 | F-REMAIN真实JSON会诊关联、F-READ普通读取/匿名拒绝；全部过滤/界面另验 |
| `POST /api/ai/parent-storybook` | 真实文字先返回，恰当页数、实际模型逐字匹配核验价格文件 | F-BOOK正式4页Qwen文字、持久化与后续媒体通过；其他参数另验，旧失败保留 |
| `POST /api/ai/parent-storybook/media-status` | 单调至多一图一音、当前页优先、retryFailed=false、未知即停 | F-BOOK正式4图4音、原结果读取和完整保存重开通过；重启/断网另验 |
| `GET /api/ai/parent-storybook/media/[mediaKey]` | 4WebP解码/4WAV有效采样、private_blob/授权、其他家长/匿名拒绝 | F-BOOK正式全部8媒体HTTP字节/解码/越权通过；浏览器实际播放另验 |
| `POST /api/parent/course-recommendations`、`GET .../[jobId]` | ≤20候选选1–3，5/10/20分钟硬预算，真实向量身份/维度、组合复核、持久任务、私人缓存 | F-RECOMM正式5/20分钟通过；10分钟UI和反馈后组合由主任务进行，SQL-LOCAL仅补充租约边界 |
| `POST /api/ai/react-agent`、`POST /api/ai/stream` | 当前源代码限定`normalAccountAccess:demo-only`；普通账号应安全拒绝，不得演示调用冒充普通业务 | 单独验证拒绝；演示巡检另列，不能要求开放权限来追求绿灯 |
| `GET/POST /api/storybooks/lin-xiaoyu/tts` | 历史固定演示儿童TTS入口，保留兼容边界 | 不替代普通儿童绘本音频，单列旧入口检查 |

当前额外脚本的stage为intent、vision、diet、health、teacher-voice、asr、follow-up、trend、admin-daily、admin-follow-up、admin-weekly。脚本默认只plan；有源码的其他入口不能被这11个stage名称笼统覆盖。每轮报告应同时记录真实model、live/fallback、有效内容、正常API持久化读回，以及是否本轮实际开始请求。

## 普通业务与发布剩余检查

1. 三角色消息、回复、已读、会话状态；提醒、任务派发/状态、园长通知；教师CRUD/归档；儿童编辑/归档；各类记录归档和反馈PATCH。现有核心矩阵只覆盖其子集，不属于完整CRUD验收。
2. F-PERSIST已验证相应AI结果保存读回；F-BOOK已验证绘本保存重开、五种导出、分享及越权。其余改动/归档、周报全部导出和实际浏览器行为仍逐项记录，不据生成成功推导。
3. F-COURSE的目录/互动进度与F-RECOMM的5/20分钟预算已过；10分钟UI/反馈后组合正在执行。继续核验真实BV点击且不自动完成、全部9课适龄边界、模型变化后失效、跨设备与worker重启恢复。
4. 全页面按普通角色桌面/390px/768px逐个按钮检查，录音授权、真实图片/音频阅读播放、SSE、断网恢复、控制台和资源404。记录页面LCP/CLS；APIp95不冒称LCP。
5. F-PERF已完成同数据5并发90GET前后对比；F-CORE已完成10并发无丢写/重复有界。长期负载、内存/无OOM和页面LCP/CLS仍待证据，收费模型不压测。
6. 生产容器重启后读回MySQL、Brain SQLite、课程任务、学习进度/缓存和私有Blob，归档完整SQL结构；权威DNS、两个域名TLS/HTTP跳转、Cookie、最终镜像/健康SHA/GitHub main、总费用、紧急开关与恢复说明仍由主任务补录。
7. ac5四项晚期缺陷需逐项正式复验并锁定新SHA；不得用旧0639通过结果或候选854/286绿灯直接代替生产通过，最终重启和正常推送仍待完成。

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

