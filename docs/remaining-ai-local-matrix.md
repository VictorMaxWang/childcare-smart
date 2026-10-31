# 补充可见AI入口与匿名权限验收

`scripts/remaining-ai-local-matrix.mjs` 仅接受 `http://localhost:18080` 的本次隔离候选和已创建的8普通账号、4合成儿童，默认只plan，不启动浏览器、不读SSH、不直接访问模型网关。正式环境测试需由主任务另行安排，不能把本地结果当作生产通过。

## 源码审查与调用上界

| stage | 接口与作用域 | 内部收费调用上界 | 明确预留 |
|---|---|---|---|
| teacher-understand | 教师/园长staff＋授权儿童；multipart真实音频 | 1次ASR，实际≤3秒；后续router/chaining纯规则，不调用LLM/向量 | 0.2元 |
| consultation-json | staff＋授权儿童；服务端重建记录，签名scope转Brain | `run_high_risk_consultation`仅一次`_generate_narrative → summarize`；MaaS单次POST、最大6000输出token，无重试；记忆使用本地SimpleVectorStore，不调用收费embedding；Next在MaaS+Brain下拒绝自动跨服务重发 | 0.5元，含20000输入token预留 |
| commands | 三角色，正常session构建可见儿童与命令权限；本脚本仅navigate/create_growth_record/create_feedback | 0，确定性解析/DB；不执行语音命令中的生成周报等收费意图 | 0 |
| quality | 仅园长；Next覆盖institution和snapshot，Brain再次校验签名scope | 0，质量指标规则引擎 | 0 |
| feed | staff，可选child_id必须可见；普通账号直接读取Web session-scope | 0；手工合成会诊夹具明确不是AI生成 | 0 |
| anonymous | 无Cookie、无demo头，GET无body/POST空JSON | 源码guard先于模型，预期全部401 | 0 |

两项收费累计保守预留0.7元，已由主任务批准并计入整轮媒体/30元总预算。`--ai --budget-file=<artifacts中的核验JSON>` 是执行门禁；模型精确固定为实测 `qwen3.8-flash` 与 `qwen-audio-3.0-asr-flash`。文件必须包含最近24小时confirmedAt、真实pricingEvidence及两项包含全部子调用的预留。费用字段不是网关账单。

JSON会诊默认Brain转发上限8000ms，部署配置可用 `HIGH_RISK_CONSULTATION_BRAIN_TIMEOUT_MS` 设置与实测模型相符的时限。超时仍记未知并停止，不能自动重新请求来掩盖超时。

## 实际免费结果

2026-10-31旧本地候选上四个独立批次均通过，0新模型请求、0费用预留，报告保留在 `artifacts/implementation-20261031/local-remaining-{anonymous,commands,quality,feed}-report.json`：

- 匿名：**31路由32方法全部401**。范围是24条`/api/ai`路由、5条课程/推荐路由、commands与旧绘本TTS两个方法。不是猜测“33条AI”。每个源码入口的guard、行号、先于潜在模型调用的检查见报告anonymousAudit。bounded上传路由仅长度限制在guard前；空JSON不触发模型。新增/移位guard会阻断静态审查，不能盲测。
- commands：三角色规则导航；教师成长记录与家长反馈先签确认token，未确认和改参均拒绝，确认执行后另一角色读回；原token重放被拒且只有一条记录；同机构异班/异家长及跨机构角色均不能执行越权命令。
- quality：两机构分别按真实儿童数量返回8类规则指标；伪造对方institution和客户端snapshot不能改变范围，教师/家长均403。不要求或伪造“live LLM”。
- feed：两机构手工合成会诊通过普通API持久化，三名staff只能读自身scope；父母、异班和跨机构child filter均拒绝。没有用空feed当作可读数据的完整证明。

## 收费正文与恢复边界

`teacher-voice-understand` 必须返回实际ASR模型、真实providerTrace、非fallback转写；router/chaining分别标rule，不能冒充LLM。转写经普通成长记录API保存后由家长读回。route/helper已修复此前把provider名称当模型以及只识别legacy real而漏掉MaaS live的缺陷，新web构建后方可调用验收。

非流式会诊独立验证JSON真实模型、园内/家庭/48小时动作，随后普通API保存、家长另一会话读取、普通feed可见，并验证父母/异班/跨机构拒绝；SSE曾通过不能代替该入口。

2026-10-31在候选 `5bb5e4e890654f74e291e089b53fab665197000e` 上两项真实业务均通过，执行前后`/api/health`确认SHA一致。`teacher-understand`实际模型为 `qwen-audio-3.0-asr-flash`，12字转写、1条规则draft、正常记录保存和家长另一会话读回及越权拒绝通过，整阶段3269ms；JSON会诊实际模型为 `qwen3.8-flash`，真实正文、MySQL保存、家长读回、feed关联及越权拒绝通过，整阶段2619ms。独立报告 `local-remaining-paid-qwen-report.json` 为2通过、0失败、0阻塞，实际开始2个业务请求、累计预留0.7元；`local-remaining-paid-qwen-context.json` 补充发布SHA关联，不改写原报告。没有未知结果或自动重发，实际费用仍待主任务统一核账。

每个收费意图先私有落盘再请求；收到正文先保存为received-needs-validation，再严格断言。已保存正文只重验，不重发；网络未知保持started-result-unknown并停止。每轮报告使用新文件名，现有报告不覆盖。完整正文和确认token只在忽略的私有journal，公开报告仅保留必要模型/状态/计数及合成摘要哈希。

```powershell
node scripts/remaining-ai-local-matrix.mjs
node scripts/remaining-ai-local-matrix.mjs --execute --stage=anonymous,commands,quality,feed --report=artifacts/implementation-20261031/another-free-report.json
node scripts/remaining-ai-local-matrix.mjs --execute --ai --stage=teacher-understand,consultation-json --budget-file=artifacts/implementation-20261031/remaining-budget.json --report=artifacts/implementation-20261031/remaining-paid-report.json
```

多次执行沿用同一journal。手工写入若处于未知状态，不会重新执行命令；需先核对原记录。5项离线辅助测试、相关route/helper的9项Node回归、ESLint与TypeScript检查已通过；这些检查不替代上述真实HTTP与后续收费实际结果。
