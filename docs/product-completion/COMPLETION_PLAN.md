# E00 Product Completion Plan

## Summary

D99 后系统已经从纯视觉演示推进到 demo 级功能闭环，但仍缺生产级权限、真实 CRUD、周报归档、真实聚合、趋势查询、附件/媒体、真实 OCR/ASR provider 和三端可执行语音球助手。本阶段按 E01-E11 拆分，先补服务端边界，再并行补数据闭环与语音助手。

## Execution Order

必须串行：

- E00：总控、文档、分派、后续 prompts。
- E01：API 层、服务端 scope 校验、统一数据服务。
- E90：合并 E01-E11 结果、更新状态与审计。
- E99：最终验收。

E01 完成后可并行：

- E02：真实 CRUD、归档删除、教师管理、儿童档案。
- E03：真实聚合、趋势查询、周报归档、导出分享。
- E04：反馈详情、聊天附件、图片、语音消息。
- E05：OCR/ASR provider、健康材料解析真实接入。
- E06：语音球助手核心框架。

E06 完成后可并行：

- E07：园长端语音助手技能。
- E08：教师端语音助手技能。
- E09：家长端语音助手技能。

E02-E09 后执行：

- E10：清理 ui-only/mock-only/fake-success 和产品规格落地。
- E11：自动化测试与 Browser Use/Playwright 回归。

## Completion Definition

- 真实 CRUD 具备创建、读取、更新、归档、恢复，刷新后保留。
- scope 校验在 API route/service 层生效，越权返回 403。
- 聚合和趋势从 store/API 数据派生，不再写死。
- 周报可生成、保存、归档、查看历史、导出、受控分享。
- 附件/语音/图片至少保存真实元数据和读取状态；未接真实二进制存储时必须明确标识。
- 语音球可执行真实命令，并在写入类命令前确认。
- 所有任务写入 `results/E??-result.json` 和 `results/E??-result.md`，由 E90 合并。

