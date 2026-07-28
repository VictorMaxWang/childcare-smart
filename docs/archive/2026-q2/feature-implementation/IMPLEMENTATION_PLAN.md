# 功能补齐实施计划

## 基线

- 审计来源：`docs/feature-audit/findings/*.json`、`*.md`、feature audit 汇总文件、bug bash 汇总、路由与设计映射。
- findings JSON：10 个。
- findings Markdown：10 个。
- 原始 findings：92 条。
- 去重后功能缺口：33 个。
- 当前检查：`npm run lint` 通过；`npm run build` 通过；`npm run bugbash:smoke` 当前被 `.next/dev/lock` 和不可达的 `127.0.0.1:3330` 阻塞。

## 实施阶段

1. D01 核心数据层：固化 `AppStateSnapshot`、demo persistence、seed、role/child/class mapping、迁移和事件 helper。
2. D02-D06 功能闭环并行：家园沟通、教师记录、家长功能、健康材料/会诊、园长端。
3. D07 共享操作清理：fake-success、ui-only button、visual-only action、表单、弹窗/抽屉。
4. D08 测试：Playwright 优先，Browser Use 可在 Node 版本满足后复核。
5. D90/D99：合并结果和最终功能回归。

## 不做事项

- D00 不修改业务源码。
- D00 不新增数据库迁移。
- D02-D08 不直接并行修改 `IMPLEMENTATION_STATUS.md`。
- D02-D08 不直接并行修改全局数据层文件，除非 D01 已完成且只调用公共 API。

