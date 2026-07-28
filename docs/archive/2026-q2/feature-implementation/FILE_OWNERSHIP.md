# File Ownership

## D01 核心数据层

- `lib/store.tsx`
- `lib/persistence/snapshot.ts`
- `lib/persistence/state-scope.ts`
- `app/api/state/route.ts`
- 可新增 `lib/demo-persistence/*` 或 `lib/feature-data/*`

## D02 家园沟通

- `app/parent/agent/page.tsx`
- `components/parent/ParentStructuredFeedbackComposer.tsx`
- `app/teacher/agent/page.tsx`
- `app/admin/page.tsx`
- 可新增沟通 helper：`lib/communication/*`

## D03 教师记录

- `app/health/page.tsx`
- `app/diet/page.tsx`
- `app/growth/page.tsx`
- `components/teacher/*`

## D04 家长功能

- `app/parent/page.tsx`
- `app/parent/agent/page.tsx`
- `app/parent/storybook/page.tsx`
- `app/children/page.tsx`
- `app/health/page.tsx`
- `app/diet/page.tsx`
- `app/growth/page.tsx`
- `components/parent/*`

## D05 健康材料与会诊

- `app/teacher/health-file-bridge/page.tsx`
- `app/teacher/high-risk-consultation/page.tsx`
- `app/api/ai/health-file-bridge/route.ts`
- `app/api/ai/high-risk-consultation/*`
- `components/consultation/*`
- `lib/agent/high-risk-consultation.ts`

## D06 园长端

- `app/admin/page.tsx`
- `app/admin/agent/page.tsx`
- `components/admin/*`
- `components/weekly-report/*`
- `components/consultation/*`

## D07 共享操作

- `components/ui/*`
- `components/EmptyState.tsx`
- `components/admin/pixel-replica/*`
- `components/teacher/*`
- `components/parent/*`

## D08 测试

- `tests/e2e/*`
- `tests/bug-bash/*`
- `playwright.bugbash.config.ts`
- 必要时 `package.json` 增加测试脚本。

