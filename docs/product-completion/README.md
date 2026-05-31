# Product Completion Control

生成日期：2026-05-01

本目录是 E00「慧育童行 / SmartChildcare Agent 功能补齐实施总控」的交付物。它只负责总控、分派、规格固化和后续提示词生成；业务源码的大规模修改由 E01-E11、E90、E99 后续任务执行。

## 已读取依据

- `docs/feature-implementation/FINAL_FUNCTIONAL_COMPLETION_REPORT.md`
- `docs/feature-implementation/IMPLEMENTATION_STATUS.md`
- `docs/feature-implementation/IMPLEMENTATION_SUMMARY.md`
- `docs/feature-audit/INCOMPLETE_FEATURES.updated.md`
- `docs/feature-audit/INCOMPLETE_FEATURES.updated.json`
- `docs/feature-implementation/DATA_MODEL_SPEC.md`
- `docs/feature-implementation/DEMO_PERSISTENCE_SPEC.md`
- `docs/feature-implementation/API_OR_LOCAL_STORE_DECISIONS.md`
- `docs/bug-bash/FINAL_BUG_BASH_REPORT.md`
- `docs/refactor/ROUTE_PAGE_MAP.md`
- `package.json`
- 当前 `app/api`、`lib/demo-data`、`lib/persistence`、`lib/ai/providers`、`components`、`backend/app`、`tests` 结构

## 本阶段硬规则

- 不读取、不引用、不依赖任何设计图目录。
- 不接受 `fake-success`、`ui-only`、`mock-only` 作为完成状态。
- 所有写入、发送、归档、删除、导出、分享、派单必须二次确认。
- 删除默认软归档，不做不可恢复硬删除。
- 服务端必须从 session 推导 scope，不能信任客户端传入的 `role`、`childIds`、`className`。
- 没有真实 OCR/ASR provider key 时，必须显示 provider fallback 状态。

## 执行入口

- 总计划：`COMPLETION_PLAN.md`
- API 与 scope：`BACKEND_API_SPEC.md`、`SERVER_SCOPE_SPEC.md`
- CRUD 与归档：`CRUD_ARCHIVE_SPEC.md`
- 聚合、趋势、周报：`AGGREGATION_TREND_SPEC.md`、`WEEKLY_REPORT_SPEC.md`
- 附件、OCR/ASR、语音球：`ATTACHMENT_VOICE_IMAGE_SPEC.md`、`OCR_ASR_PROVIDER_SPEC.md`、`VOICE_ASSISTANT_SPEC.md`
- 任务矩阵与归属：`TASK_MATRIX.md`、`FILE_OWNERSHIP.md`
- 后续任务提示词：`prompts/`
- 后续任务结果：`results/`
