# R04 AI 助手复刻报告

生成时间：2026-05-11T11:18:06+08:00

## 范围

- 园长、教师、家长三端新增统一 AI 助手工作台，覆盖快捷问题、消息/结果区、输入框、发送入口、语音入口、provider 状态、source badge、loading、错误状态和移动端安全布局。
- AI suggestion、follow-up、weekly report 及三端 agent route 的本地执行路径统一改为服务端 vivo Chat provider；缺少环境变量或 provider 失败时返回 `503/provider_unavailable`，不再静默返回本地成功。
- provider status 扩展到 `chat/ocr/asr/tts`，只暴露 readiness 和 required env 名称，不暴露 key、Bearer、签名或 `NEXT_PUBLIC_VIVO_*`。
- 语音助手保留原语音球，修正 mobile 底部避让、ASR 空转写文本 fallback、provider badge 判定，并为写入/风险类命令加入确认 token。
- 权限继续在服务端校验：家长 child scope、教师 class/child scope、园长全园 scope；写入执行缺 token、token 过期或参数不匹配均拒绝。

## 三端 UI

- 园长端：接入周报生成、风险儿童分析、派单建议、数据问答、运营报表、对话历史入口和推荐操作卡片；结果 source 不再硬编码为“真实 AI 结果”。
- 教师端：补齐晨检建议、饮食建议、成长记录润色、回复家长建议、健康材料解析入口、高风险会诊建议、班级待办总结，并新增可输入的对话 composer。
- 家长端：补齐今日状态问答、老师消息总结、成长绘本朗读/解释、饮食建议、健康提醒解释、家园沟通草稿，回复区显示 provider/source 或明确不可用状态。
- 语音球：保留 existing VoiceOrb，新增助手工作台内一键打开；移动端固定位置加入 safe-area bottom 预留，避免遮挡底部导航和输入区。

## vivo 能力

- Chat：服务端调用 `requestVivoChat`，结构化 JSON 解析失败时返回 provider unavailable，不 fake success；测试环境 force fallback 只能返回显式 `source: "fallback"`。
- OCR：保持健康材料解析 live-pass 路径，provider status 继续脱敏暴露。
- ASR：保持语音助手转写 live-pass 路径，空 transcript 显式提示文本 fallback。
- TTS：保留固定绘本静态音频优先；runtime TTS 继续走服务端 endpoint。当前本地环境未配置完整 `STORYBOOK_TTS_*`，因此 readiness 可显示 missing-env，不伪造可用。

## 验证

| 项目 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm run build` | 通过 |
| `npm run product:ai` | 通过，Chat/OCR/ASR live-pass |
| `npm run product:voice` | 通过，13 parser + 20 browser tests |
| `npm run product:journey` | 通过 |
| `npm run feature:smoke` | 通过，19 passed |
| `npm run bugbash:smoke` | 通过 |
| `npx tsc --noEmit` | 通过 |
| R04 Playwright | 9 passed，1 skipped（本地 Chat ready，missing-env 分支跳过） |

补充：尝试使用 Codex in-app Browser 插件打开本地 dev server 时浏览器连接两次超时；最终前端渲染验证以通过的 Playwright Chromium 专项测试和产品回归为准。

## 产物

- 新增 `components/ai/RoleAssistantWorkspace.tsx`
- 新增 `tests/frontend-replica/ai-assistant-ui.spec.ts`
- 新增 `tests/frontend-replica/vivo-ai-assistant.spec.ts`
- 新增 `docs/frontend-replica/results/R04-result.md`
- 新增 `docs/frontend-replica/results/R04-result.json`
