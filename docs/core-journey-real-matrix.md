# 普通账号核心闭环验收脚本

`scripts/core-journey-real-matrix.mjs` 复用 `parent-courses-real-matrix.mjs` 创建的8普通账号/2目标机构/4合成儿童私有manifest，不创建浏览器，不使用demo身份，不注入数据库状态。默认仅打印计划，不读取凭据、不联网、不写入网站。

```powershell
node scripts/core-journey-real-matrix.mjs
```

## 审查后按阶段执行

以下命令会通过正常HTTP API写入既有的合成验收账号空间。先审查候选代码与目标站点，再由根代理显式执行。所有阶段复用同一个私有journal，固定`sourceDraftId/sourceRecordId/uploadRequestId/feedbackId`，网络失败后显式重跑仍使用原身份；不会自动重发写请求。

```powershell
node scripts/core-journey-real-matrix.mjs --execute --stage=core
node scripts/core-journey-real-matrix.mjs --execute --stage=isolation
node scripts/core-journey-real-matrix.mjs --execute --stage=concurrency
node scripts/core-journey-real-matrix.mjs --execute --stage=session --expired-cookie-file=artifacts/implementation-20261031/expired-cookie.private.txt
```

默认manifest、journal和报告分别为 `artifacts/implementation-20261031/real-matrix.private.json`、`core-journey.private.json` 和 `core-journey-real-report.json`，可用对应 `--manifest/--journal/--report` 参数指定。分阶段报告默认覆盖同一路径，应按需要分别指定 `--report=artifacts/.../core-stage.json` 留存每轮结果。凭据和cookie只从私有文件读取，不打印、写入公开报告或发送到站外地址。

`core` 阶段覆盖教师A1创建健康/饮食/成长记录与幂等重放；上传真实文件到私有Blob、按稳定请求编号重放并关联成长记录照片；家长A1另一个登录会话读回记录与图片原始字节；家长提交执行反馈后教师读回。默认图片是仓库已有的合成验收WebP，可用 `--image-file` 提供其他合法WebP测试文件。

`isolation` 阶段验证同机构异班教师A2、同机构其他家长A2、跨机构教师B1和家长B1的儿童记录读写、原记录修改、私有媒体与反馈访问均被403/404拒绝；家长不能创建教师记录；匿名访问返回401。所有拒绝测试只指向合成儿童和合成记录。

`concurrency` 阶段先发10个不同成长记录，全部请求结束后确认10个ID分别且各存在一次；再发10个相同草稿记录请求，确认只有一个ID和一条持久记录。压力请求不访问AI路由。报告同时记录普通API延迟与p50/p95，不将HTTP测量当作页面LCP。

`session` 阶段按当前契约验证退出清理Cookie及后续401。当前`ccs_session`为12小时HMAC令牌，未提供集中撤销表；仍在有效期的旧token不会因另一个请求logout而失效，报告明确披露这一边界。真正过期测试需要根代理提供属于此次合成账号、签名合法但exp已过期的cookie文本；脚本不读取或生成生产签名密钥。没有此夹具会记为blocked，不能用篡改签名冒充已验证过期行为。

## 可选真实AI阶段

费用核验与预留记录是必要前提。`scripts/core-journey-ai-budget.example.json` 仅为结构示例，时间和计费依据是待替换占位符，不能直接执行。将副本保存到artifacts，填写根代理已核实的价格依据、最近24小时核验时间、批次ID及各请求包含内部全部调用的保守预留；本脚本全部已启动收费意图预留合计不得超过10元。不能把预留估算当成实际账单，最终费用仍由网关用量/账单核对，且计入整轮30元上限。

```powershell
node scripts/core-journey-real-matrix.mjs --execute --stage=ai --ai --ai-budget-plan=artifacts/implementation-20261031/core-ai-budget.json --ai-steps=suggestions-initial,suggestions-cache
node scripts/core-journey-real-matrix.mjs --execute --stage=ai --ai --ai-budget-plan=artifacts/implementation-20261031/core-ai-budget.json --ai-steps=suggestions-update
node scripts/core-journey-real-matrix.mjs --execute --stage=ai --ai --ai-budget-plan=artifacts/implementation-20261031/core-ai-budget.json --ai-steps=suggestions-cache-update
node scripts/core-journey-real-matrix.mjs --execute --stage=ai --ai --ai-budget-plan=artifacts/implementation-20261031/core-ai-budget.json --ai-steps=teacher-communication,weekly-report,consultation-sse
```

建议阶段先请求一次真实方案，再以 `x-ai-cache-only:1` 修改客户端伪造快照噪声后重读，必须命中相同真实结果，用于观察服务端重建档案及缓存行为。家长再写一条明确家庭反馈，缓存必须失效，随后才显式更新一次方案。结果须有真实模型身份、有效动作和回看内容，规则/占位/演示返回不能通过。

缓存比较使用递归规范对象键的 `canonical-json-v1` 内容哈希，保留数组顺序；二进制文件仍按原始字节校验，不受MySQL JSON键重排影响。后续成功业务body只保存在私有 `journal.ai[step].responseBody`，公开报告不包含完整内容。`suggestions-cache` 和 `suggestions-cache-initial` 对比最初方案；`suggestions-cache-update` 只对比已完成的更新方案，不触发重新生成。旧日志若仅有旧序列化SHA，不能从哈希恢复语义基线；可以显式指定原始成功body文件 `--ai-baseline-body-file=artifacts/.../original-response.private.json`，或保留该检查为阻塞。脚本不会修改旧证据、伪造基线或自动付费重试。

教师沟通润色使用 `/api/ai/teacher-agent` 的 `workflow:communication,scope:child`；`/api/ai/parent-message-reflexion` 是家长入口，可单独通过 `--ai-steps=parent-reflexion` 纳入，但必须另有相应预留且总预算仍≤10元。周报使用已授权儿童scope。SSE会诊逐块读取status/text/done事件，拒绝error或缺失done，要求真实provider与有效最终内容，并记录首进度和完成时长；不把进度文字当成模型完成。

所有收费意图先落盘为“已启动、结果未知”，再发请求；已存在的已完成、失败或未知意图均不会自动重发。任一步失败会阻断后续收费步骤。缓存只读阶段不启动模型，不发送`x-ai-confirm-retry`。报告分别列passed/failed/blocked，并保留未知请求费用预留。独立收费业务请求数不等于内部模型调用次数，报告不会伪造模型用量。

运行中的同一journal使用独占lock防止重复执行；若进程中断遗留lock，先核实原进程确已停止及原任务状态，再由根代理处理，不删除日志或盲目重跑。

## 当前证据范围

脚本已完成 `node --check`、plan-only、9项离线辅助函数测试与ESLint。2026-10-31 在 `localhost:18080` 隔离候选完成零AI真实HTTP验收，结果19通过、0失败、1阻塞（尚缺签名合法的过期Cookie夹具）。私有Blob确实上传了合成WebP并由家长另一会话校验原始字节；四种异班/异家长/跨机构拒绝、10并发无丢写及重复防重均通过。普通API共73次，p50为25.49ms、p95为134.63ms，10个不同成长记录并发p95为139.8ms；这些数值仅反映本地候选条件，不能替代生产性能。

首轮发现测试脚本误把反馈创建的 `ApiFeedbackDetail` 当作裸反馈，已按原有 `data.feedback` 与 `data.child` 契约修正，随后复测通过，未降低权限或持久化断言。根代理随后在本地实际生成一次建议，返回 `source:ai`、`maas-llm` 与GLM模型身份，约10.1秒；缓存读取确实hit，但旧脚本用JSON序列化字节比较被MySQL键重排误判，现已修正为语义哈希，未追溯改写原日志或自动重发收费请求。上述原始报告保留在artifacts，后续AI覆盖以实际执行报告为准。

根代理随后授权在旧生产 `https://www.smartchildcare.cn` 的既有合成空间执行零AI四阶段。使用新独立 `prod-core-before.private.json` 后，20项全部通过、0失败、0阻塞、0收费请求；签名合法的过期Cookie在session与记录读取均返回401。未使用浏览器或SSH，也未删除数据。

旧生产填充后基线固定使用同一 `parentA1 / children[0]`：5并发×6批×3个GET，共90次计时读取，另3次预热。`/api/state` p95为780.64ms，`/api/children` p95为314.31ms，成长记录读取p95为398.59ms，90次均为200。报告为 `artifacts/implementation-20261031/performance-before-filled.json`，同目录 `performance-before-filled-context.json` 记录具体合成儿童及记录ID，以便部署后复用同一数据集；测after前不得另起空夹具或重跑写入。该基线属于旧生产，不能当作候选发布性能或正式网站全量验收通过。真实Chrome交互、390px/768px布局、容器重启和实际模型账单由根代理另行验收。
