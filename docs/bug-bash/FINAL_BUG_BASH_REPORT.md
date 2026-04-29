# F99 Final Bug Bash Report

检查日期：2026-04-29

## 总体结论

- 总 bug 数：49
- fixed：42
- open：0
- duplicate：7
- needs-info：0
- P0：0
- P1：8 fixed，0 open
- P2：23 fixed，5 duplicate，0 open
- P3：11 fixed，2 duplicate，0 open
- P4：0
- 发布建议：建议发布

F99 发现并完成 3 个小范围安全修补：家长建议 API 请求体 clone 顺序、教师工作台重复 key、显式 `demoSeed` 本地隔离。修补后 lint、build、tsc、parent-message-mapper、bugbash smoke、深度浏览器回归均通过。

## 重点 Bug 状态

- B20：`BUG-B20-001` fixed；`BUG-B20-002` fixed。
- B21：`BUG-B21-001` fixed；`BUG-B21-002` fixed；`BUG-B21-003` fixed；`BUG-B21-004` fixed；`BUG-B21-005` fixed。
- B22：`BUG-B22-001` fixed；`BUG-B22-002` fixed；`BUG-B22-003` fixed；`BUG-B22-004` duplicate of `BUG-B21-004`；`BUG-B22-005` fixed；`BUG-B22-006` fixed；`BUG-B22-007` fixed。
- B23：`BUG-B23-001` fixed；`BUG-B23-002` fixed；`BUG-B23-003` fixed。
- B24：`BUG-B24-001` fixed；`BUG-B24-002` fixed；`BUG-B24-003` fixed。
- B25：`BUG-B25-001` fixed；`BUG-B25-002` fixed；`BUG-B25-003` fixed。
- B26：`BUG-B26-001` duplicate of `BUG-001`；`BUG-B26-002` duplicate of `BUG-002`；`BUG-B26-003` duplicate of `BUG-003`。对应 canonical bug 在 F99 最终 smoke 中通过。

## 命令检查结果

- `npm run lint`：passed
- `npm run build`：passed
- `npx tsc --noEmit`：passed
- `npm run test:parent-message-mapper`：passed，4 tests passed
- `BUGBASH_BASE_URL=http://127.0.0.1:3000 npm run bugbash:smoke`：passed，1 test passed，0 issues
- `docs/bug-bash/BUGS.json`：parseable

## Browser 回归结果

- Browser Use：已尝试，受本机 Node `v22.20.0` 限制无法启动；Browser Use node_repl 要求 `>= v22.22.0`。
- fallback：Playwright Chromium 真实浏览器自动化通过。
- 深度回归证据：`artifacts/bug-bash/F99/f99-browser-regression.json`
- 深度回归结果：136 checks passed，0 failures，0 same-origin 5xx/image 404，0 browser console error。
- B26 smoke 证据：`artifacts/bug-bash/B26/b26-smoke-results.json`

覆盖范围：

- 登录页：普通账号输入、密码显隐、注册弹窗、四个示例账号入口均通过。
- 陈园长：园长首页、AI 助手、周报分析路由、刷新非白屏均通过。
- 李老师：教师工作台、AI/沟通、健康材料解析、高风险会诊、mock draft 不触发真实持久化 5xx 均通过。
- 周老师：教师工作台和与李老师相同核心路径通过，班级数据状态未崩。
- 林妈妈：家长首页、家长反馈、`child=c-1`、`#feedback`、成长绘本均通过。
- `demoSeed`：显式 `demoSeed=recording-c1-bedtime` 返回 `x-smartchildcare-storybook-demo-seed: isolated`，不进入真实 API。

## 权限与越权结果

- 未登录访问保护路由：`/admin`、`/teacher`、`/parent?child=c-1` 均重定向到登录页。
- `/login?next=...` 越权：不同角色登录后均落回其授权首页，未进入越权目标。
- 跨角色访问：园长访问教师/家长、教师访问园长/家长、家长访问园长/教师均被拦截并回到授权首页。
- `child` 参数：林妈妈访问 `/parent?child=c-1` 保留 child 参数并正常渲染。

## Mobile 与资源

- mobile 登录页：390x844 非白屏，无严重横向溢出，注册弹窗可见且不溢出。
- mobile 家长首页：390x844 非白屏，无严重横向溢出，无 broken image。
- mobile 教师工作台：390x844 非白屏，无严重横向溢出，无 broken image。
- 图片路径：深度回归与 smoke 均未发现 image 404 或 broken image。
- 本地绝对路径泄露：生产代码和 public 资源未发现 `C:\Users\12804\Desktop\childcare-smart源代码\前端重构` 绝对路径。
- `docs/pixel-replica/FINAL_PIXEL_REPLICA_REPORT.md`：不存在，记录为未提供输入文件。

## 仍未修复问题

- 无发布阻塞 open bug。
- Browser Use 插件运行环境需要 Node `>=22.22.0`；本轮已用 Playwright Chromium fallback 完成真实浏览器回归。
- 本地 brain 服务缺席时 dev server 会打印 `[BRAIN_PROXY] Falling back...` 服务端日志；浏览器侧和 API 状态已通过 fallback 保持 200，不阻塞发布。

## 发布前必须修复项

- 无。

## 可以延后修复

- 升级本机 Node 以恢复 Browser Use 插件直接运行。
- 如需更安静的开发日志，可后续降低本地 brain fallback warning 的噪声级别。
