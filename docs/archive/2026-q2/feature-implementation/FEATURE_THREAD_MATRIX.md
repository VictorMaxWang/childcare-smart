# Feature Thread Matrix

## 串行任务

- D00：功能补齐总控。
- D01：核心数据层。
- D90：结果合并和状态汇总。
- D99：最终功能回归。

## D01 后可并行

- D02：家园沟通 / 聊天闭环。
- D03：教师记录闭环。
- D04：家长端功能补齐。
- D05：健康材料解析 / 高风险会诊。
- D06：园长端。

## 建议后置

- D07：共享操作和 visual-only 清理，建议在 D02-D06 完成后执行。
- D08：可先创建测试框架，D02-D06 完成后补齐断言。

## 并行线程不要直接同时修改

- `docs/feature-audit/INCOMPLETE_FEATURES.json`
- `docs/feature-implementation/IMPLEMENTATION_STATUS.md`
- 全局数据层文件，除非 D01 已完成且线程只调用公共 API。
- `package.json`，除非 D08 或工具链线程确实需要。

## 热点文件

- `lib/store.tsx`
- `lib/persistence/snapshot.ts`
- `lib/persistence/state-scope.ts`
- `app/api/state/route.ts`
- `components/ui/*`
- `components/Navbar.tsx`
- `components/MobileNav.tsx`
- `lib/navigation/primary-nav.ts`
- `app/children/page.tsx`
- `app/health/page.tsx`
- `app/growth/page.tsx`
- `app/diet/page.tsx`
- `components/consultation/*`

## 结果写入

并行线程只写自己的结果文件：

- `docs/feature-implementation/results/Dxx-result.json`
- `docs/feature-implementation/results/Dxx-result.md`

D90 统一读取结果并更新汇总状态。

