# AI Assistant Targets

## Official Provider Reference
- vivo 蓝心大模型文档入口：https://aigc.vivo.com.cn/#/document/index?id=1746
- 后续 R06 必须对照官方文档复核 Chat/OCR/ASR/TTS 请求、鉴权、错误处理。

## Existing Provider Inventory
- Next vivo adapters: `lib/providers/vivo/*`，包含 chat、OCR、ASR、TTS、auth、status、errors、types。
- Next provider wrappers: `lib/ai/providers/*`。
- Backend providers: `backend/app/providers/*` 和 resolver。
- Browser UI 不直接调用 vivo；只调用本地 Next API 或 backend proxy。

## Server/Client Boundary
- 所有 vivo key、签名、token 只允许服务端使用。
- 禁止新增 `NEXT_PUBLIC_VIVO_*`。
- Provider status 只暴露 readiness/provenance，不暴露密钥材料。
- AI route 必须保留 session、role、child、class scope 检查。

## Capability Matrix
| Capability | Current Target | R06 Requirement |
| --- | --- | --- |
| Chat | 高风险会诊、园长/教师/家长 AI 助手、周报/建议 | 真实 provider 可用时必须走 vivo；不可 fake success。 |
| OCR | 健康材料、图片识别、会诊材料 | 支持格式、失败状态、fallback provenance 必须清楚。 |
| ASR | 语音助手、教师语音上传/理解 | 音频格式、转写 loading/error、权限确认必须可见。 |
| TTS | 固定绘本、小雨故事音频、语音播放 | 服务端生成/受控播放，不在前端暴露签名。 |
| VoiceOrb | 全局语音球 | 不能破坏现有悬浮入口、命令确认和历史。 |

## Role Surfaces
- 园长端：运营洞察、风险优先级、周报、派单、问答。
- 教师端：班级总结、重点儿童、沟通建议、任务派发、语音理解。
- 家长端：今晚怎么做、做完反馈、明天老师看什么、趋势问答。

## Failure Rules
- 未配置 vivo 时显示明确不可用/降级，不写“生成成功”。
- 上游失败时保留错误状态和 retry，不吞错。
- 任何写入/派单/归档类意图必须通过 command bus 权限和确认。
