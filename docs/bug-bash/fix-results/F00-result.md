# F00 修复结果

## 处理 bugId

- `BUG-011`
- `BUG-012`
- `BUG-013`
- `BUG-B23-001`
- `BUG-B23-002`

`BUG-001`、`BUG-002`、`BUG-003` 已复核为 P2，未并入 F00；本轮 `bugbash:smoke` 仍可复现其中的既有 API/环境类问题。

## 修复摘要

- 新增统一路由权限工具，集中校验角色专属路由、共享受保护路由和登录 `next` 参数。
- session token 增加 `role`，登录、注册、示例账号登录均写入角色；旧 token 缺少角色时访问角色专属页会清 cookie 并回登录页。
- `proxy.ts` 在服务端拦截未登录、角色越权、非法角色 token；越权访问安全回到当前角色首页并携带权限提示标记。
- 登录页普通登录、注册、示例账号登录和已登录自动跳转均改用统一 `next` 白名单与角色授权校验。
- AppShell 增加客户端路由边界，刷新和后退/前进时避免越权内容渲染或白屏。
- 导航移除跨角色专属入口；教师不再看到 `/` 数据总览入口。
- 教师数据快照与园长看板数据源改为基于当前可见儿童范围，避免教师读取全园数据聚合。

## 复测结果

- F00 Playwright 专项：通过，23/23。
- 未登录访问：`/admin`、`/teacher`、`/parent`、`/children`、`/health`、`/growth`、`/diet` 均回 `/login?next=...`，页面非空。
- `next` 越权访问：陈园长 -> `/teacher`、李老师 -> `/admin`、周老师 -> `/parent`、林妈妈 -> `/admin` 均回到对应角色首页，并观察到 `accessDenied=1` 权限提示标记。
- 示例账号正常登录：陈园长 `/admin`，李老师 `/teacher`，周老师 `/teacher`，林妈妈 `/parent` 均通过。
- 路由刷新：`/admin`、`/teacher`、`/parent?child=c-1` 均保持非空且角色正确。
- 后退/前进：家长账号访问 `/admin` 后无法停留在越权页面。
- 证据文件：`artifacts/bug-bash/fixes/F00/permission-route-retest.json`。

## 检查结果

- `npm run lint`：通过。
- `npm run build`：通过。
- `$env:BUGBASH_BASE_URL='http://127.0.0.1:3330'; npm run bugbash:smoke`：未通过，39 个问题均为 P2；包含既有 `BUG-001`、`BUG-003` 以及 `_vercel/insights/script.js`/404 控制台噪声，不属于 F00 P0/P1 权限阻塞项。

## 状态更新

- 已将 `BUG-011`、`BUG-012`、`BUG-013`、`BUG-B23-001`、`BUG-B23-002` 标记为 `fixed`。
- `BUG-001`、`BUG-002`、`BUG-003` 保持原状态，作为非 F00 的 P2 残留。

## 风险说明

- 3000 端口已有旧 dev server lock，F00 专项复测和 smoke 使用 `next start` 的 `http://127.0.0.1:3330`。
- F00 之后缺少 `role` 的旧 session token 访问角色专属路由会被清理并要求重新登录，这是预期的安全行为。
