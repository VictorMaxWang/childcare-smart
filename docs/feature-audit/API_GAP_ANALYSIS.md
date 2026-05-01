# API 缺口分析

本文件由 C99 汇总线程维护。C20 和 Browser Use 线程提供证据。

## 已知需要重点核验的接口族

| 接口族 | 相关功能 | 初始关注点 |
| --- | --- | --- |
| `/api/ai/suggestions` | 家长建议、反馈建议 | Brain proxy fallback 后是否只是降级 mock；是否保存家长反馈。 |
| `/api/ai/parent-message-reflexion` | 家园沟通回复 | 是否生成回复但不发送、不存储。 |
| `/api/ai/parent-storybook` | 成长绘本 | 是否依赖 mock/preset；生成结果是否缓存并按 childId 隔离。 |
| `/api/ai/health-file-bridge` | 教师健康材料解析 | 上传、OCR、结构化结果、入库是否完整。 |
| `/api/ai/high-risk-consultation*` | 高风险会诊 | feed、stream、follow-up、转办是否真实后端。 |
| `/api/ai/weekly-report` | 园长周报 | 周报生成是否真实、刷新后是否存在。 |
| `/api/admin/notification-events` | 园长通知事件 | 事件来源、权限和失败降级。 |
| `/api/state` | 本地/快照状态 | 是否承担真实持久化；范围是否按 role/child/class 隔离。 |

## 记录模板

| findingId | route | endpoint | expected API | actual behavior | gap | owner |
| --- | --- | --- | --- | --- | --- | --- |
| 待 C99 汇总 |  |  |  |  |  |  |

