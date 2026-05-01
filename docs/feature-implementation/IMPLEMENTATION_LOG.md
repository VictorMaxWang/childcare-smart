# Implementation Log

## D00

- 创建 `docs/feature-implementation` 总控目录。
- 根据 C10-C23 findings、feature audit 汇总、bug bash、路由映射和设计映射建立任务分派。
- 记录基线检查：
  - `npm run lint`: passed
  - `npm run build`: passed
  - `npm run bugbash:smoke`: blocked by `.next/dev/lock` and unreachable `http://127.0.0.1:3330/login`
- 未修改业务源码。

## D01

- 新增 `lib/demo-data` 公共数据层，提供 messages、daily records、health materials、consultations、reminders、nutrition menus、storybooks 和 dashboard/workbench/home selectors/actions。
- `AppStateSnapshot` 增加 `demoPersistenceSchemaVersion` 与 D01 新 bucket，并让 normalizer 对缺失 bucket 补空数组。
- demo 账号改为机构级共享 localStorage namespace：`demo:v5-d01-shared-demo:institution:{institutionId}`；读取/写入时继续使用 session scope 做 child/class/role 隔离。
- `lib/store.tsx` 保留现有 `useApp()` API，同时维护新 bucket，demo 写入会 merge 回共享机构 snapshot，normal 账号继续走 `/api/state`。
- 增加 D01 Node 单测和 Playwright 最小回归。
- 检查结果：
  - `node --import ./scripts/register-test-path-loader.mjs --test ./lib/demo-data/*.test.ts`: passed
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `BUGBASH_BASE_URL=http://127.0.0.1:3000 npm run bugbash:smoke`: passed
  - `BUGBASH_BASE_URL=http://127.0.0.1:3000 npx playwright test tests/bug-bash/d01-regression.spec.ts --config=playwright.bugbash.config.ts --project=chromium --reporter=line`: passed
