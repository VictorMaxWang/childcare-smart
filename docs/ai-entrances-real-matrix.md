# 其余AI入口普通账号验收

`scripts/ai-entrances-real-matrix.mjs` 使用已有普通账号manifest中的教师A1、家长A1和园长A，默认只输出计划，不读凭据、不联网，不启动浏览器。脚本的9项离线辅助测试与ESLint已通过。根代理随后在本地普通账号执行教师语音上传、通用ASR，两项真实调用及适用持久化通过；intent规则通过；识图失败后停止、膳食评估被阻断，其余入口仍须按实际报告确认。完整边界见 `docs/acceptance-coverage-inventory.md`，不能把脚本或离线测试通过冒充网站通过。

```powershell
node scripts/ai-entrances-real-matrix.mjs
```

## 先核验计费，再由根代理分批执行

执行必须同时提供 `--execute --ai --ai-budget-plan=<核验后的费用预留JSON>`。结构示例为 `scripts/ai-entrances-budget.example.json`，其时间和计费依据是无效占位，必须经根代理核实并另存到artifacts。全部已启动意图累计预留≤3元，各业务请求上限0.2或0.3元，包含内部调用与每次6000输入/输出token的保守上界；示例全选总预留为2.3元。实际账单仍需根代理核对，并计入整轮30元总额。

当前源码的收费调用数上界：vision、diet、health OCR、教师语音上传、通用ASR、家长追问、趋势解释及园长三工作流各最多1次；intent规则、健康文本规则解析和本地向量记忆不收费。若实现或模型协议变化，必须重新核对上界和预留，不能机械复用此说明。上界是估计边界，不冒称网关实际调用量。

```powershell
node scripts/ai-entrances-real-matrix.mjs --execute --ai --stage=intent --ai-budget-plan=artifacts/implementation-20261031/entrances-budget.json
node scripts/ai-entrances-real-matrix.mjs --execute --ai --stage=vision,diet --ai-budget-plan=artifacts/implementation-20261031/entrances-budget.json
node scripts/ai-entrances-real-matrix.mjs --execute --ai --stage=health --ai-budget-plan=artifacts/implementation-20261031/entrances-budget.json
node scripts/ai-entrances-real-matrix.mjs --execute --ai --stage=teacher-voice,asr --ai-budget-plan=artifacts/implementation-20261031/entrances-budget.json
node scripts/ai-entrances-real-matrix.mjs --execute --ai --stage=follow-up,trend --ai-budget-plan=artifacts/implementation-20261031/entrances-budget.json
node scripts/ai-entrances-real-matrix.mjs --execute --ai --stage=admin-daily,admin-follow-up,admin-weekly --ai-budget-plan=artifacts/implementation-20261031/entrances-budget.json
```

可用 `--manifest/--journal/--report` 指定本地候选的私有manifest、独立journal和分轮报告；默认均在 `artifacts/implementation-20261031`。本地验收必须传入 `local-matrix.private.json`，不依靠继承环境猜目标。分轮报告默认会覆盖同一路径，应显式指定不同报告文件留存每一轮。与此前核心闭环共享方案时通过 `--core-journal` 指定相同站点和儿童的已完成真实方案body；缺少既有方案会阻断follow-up，不能自动付费补造前置方案。

## 各入口实际验证内容

| stage | 真实用途及断言 |
|---|---|
| intent | 三角色确定性路由：校验ruleId、roleHint、targetWorkflow及角色安全deeplink；不要求live模型，不自动执行被推荐工作流。 |
| vision | 真实合成食物WebP识别；返回MaaS实际model/live与食物名称，再保存带服务端回执的饮食记录，由家长读回。 |
| diet | 真实膳食文字评估及0–100分、建议；按当前儿童月龄传参，保存aiEvaluation并由家长验证模型来源与分数。 |
| health | 已有合成OCR图片经私有附件授权读取，真实OCR必须读到36.5；校验OCR文件级live及model，区分后续保守规则分析；按健康页面rawResponse包装保存签名回执并由家长读回。 |
| teacher-voice | 实际音频上传、真实ASR、draftContent与transcript一致，不发送fallbackText；将转写存成合成成长记录，由家长核对。 |
| asr | 家长通用ASR入口：真实provider/model/live和非空transcript，不提供任何文字兜底；该API本身仅返回转写，不能假称已保存音频。 |
| follow-up | 读取此前真实方案body，服务端重建儿童快照，返回真实追问答案、家庭步骤及48小时回看。 |
| trend | 数字为服务端确定性聚合，逐天hydration_ml与已保存饮食记录独立对照；文字解释另行要求真实MaaS轨迹，不把数字聚合说成LLM。 |
| admin-* | 园长daily-priority/question-follow-up/weekly-ops-report三个可见核心流程：真实provider/model/live、有效行动项、机构可见儿童数量及风险儿童范围；不自动创建派发任务。 |

健康桥接的当前设计是“真实OCR＋保守规则分析”，overall fallback不能被拿来掩盖OCR未调用，OCR live也不能伪装成模型健康诊断。Brain写回公开响应仅有拟写入bridgeWriteback与失败warning，不能独立证明SQLite耐久性；脚本报告这一缺口，根代理需另查内部数据和重启读回。

园长结果需要真实provider轨迹，不能只凭 `source:ai` 或HTTP200推断live。若包装器遗失原模型provider/live字段，脚本会失败并保留原始body，交由实现修复，不能通过放宽验证解决。

## 合成媒体与恢复边界

OCR默认 `artifacts/implementation-20261031/synthetic-ocr.png`，内容为合成测试标题、体温36.5及rice/carrot，无真实儿童资料。食物识别默认仓库既有 `public/demo-media/gpt-image2/meals/demo-meal-auto-001.webp`，可用 `--vision-image-file` 指定其他合法WebP。

语音默认 `artifacts/implementation-20261031/synthetic-speech-normalized.wav`，可用 `--audio-file` 覆盖。脚本校验RIFF/data真实长度、PCM16单声道、实际采样率与≤3秒时长，不接受流式占位头。当前原始fixture为24kHz、16bit、单声道，实际数据111360字节=2.32秒；根代理只修复头部长度，不截音频、不谎报2秒。即使网关按usage.duration=2计费，HTTP表单仍填写实际约2320ms，费用按≤3秒预留。

模型意图先落盘，再发请求；未知状态禁止重发，任一入口失败会阻断后续收费。成功body保存在私有journal，公开报告仅含合成内容摘要、模型、哈希和持久化证据。已完成入口可复用原body重验业务持久化且明确标注“saved-result/no-new-call”，不会再调用模型。若收到body但断言失败，保存为“needs-validation”，修正真实契约后可重验原body；如果输入文件或语义变了，同一意图会拒绝复用旧结果。输入指纹只保存哈希，不把音频/图片二进制或账号凭据写进报告。

请求计数使用独立的 `actualRequestStarted`：本轮已发出请求为true，读取私有journal中的已保存结果重验为false。`mode:live` 只说明返回内容的真实来源，不参与请求次数计算；结果未知的已启动请求仍计数并保留费用预留。旧语音轮次曾因来源字段覆盖而误报stdout为0，原始报告保留不改，独立统计说明记录实际2个请求、本轮预留0.4元及journal累计预留0.7元。

所有数据库写入均走正常API并指向本次合成空间，使用稳定草稿/上传编号。私有manifest、journal、cookie和完整响应不得提交Git。脚本不持有云服务凭据或生产签名密钥，不发送站外Cookie，也不运行浏览器。
