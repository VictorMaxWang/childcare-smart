# C11 教师端功能完整性审计

## 审计范围

- 本地服务：`http://localhost:3000`，通过 `npm run dev` 启动。
- 真实用户自动化：优先尝试 Browser Use in-app browser；当前 Browser Use node runtime 版本不满足插件要求，改用 Playwright Chromium 做真实浏览器点击、输入、上传、刷新、切换账号、抓网络请求。
- 教师账号：李老师 `u-teacher / 向阳班`，周老师 `u-teacher2 / 晨曦班`。
- 家长端验证：林妈妈 `u-parent / 林小雨`。
- 原始证据：`artifacts/feature-audit/C11-teacher/c11-raw-results.json`。

## 汇总

- 审计功能数：7
- complete：1
- partial：1
- ui-only：0
- mock-only：1
- visual-only：0
- fake-success：1
- backend-missing：3
- F0：1
- F1：5
- F2：0

## 功能结论

| 功能 | 状态 | 严重度 | finding | 结论 |
| --- | --- | --- | --- | --- |
| 教师工作台 | complete | - | - | 李老师显示向阳班，周老师显示晨曦班；班级儿童和任务数据随账号变化。快捷入口目标路由存在，直接进入目标功能页可用。 |
| 家园沟通 / 教师 AI 助手 | fake-success | F0 | C11-001 | AI 建议调用 `/api/ai/teacher-agent`，但发送家长回复没有真实提交接口，只改页面状态；刷新和家长端均不可见。 |
| 晨检记录 | backend-missing | F1 | C11-002 | 能保存到当前教师 scoped localStorage，刷新教师端可恢复；没有后端写入，家长端不可见。 |
| 饮食记录 | backend-missing | F1 | C11-003 | 餐次记录刷新后在教师端可见，但只在 `u-teacher.meals.v3`，家长端不可见。 |
| 成长记录 | backend-missing | F1 | C11-004 | 文字/标签本地保存；新增入口没有真实图片上传，家长端成长档案/AI 页不可见。 |
| 健康材料解析 | mock-only | F1 | C11-005 | 有文件选择和 `/api/ai/health-file-bridge` 请求，但返回 `fallback/mock/liveReadyButNotVerified`，结果刷新后丢失。 |
| 高风险会诊 | partial | F1 | C11-006 | 能生成结果和流式响应，但走 `next-json-fallback`；结果写入教师本地命名空间，刷新不恢复结果卡，家长端不可见。 |

## 重点不完整功能

- 教师工作台：整体按账号和班级变化，未作为 finding；自动点击快捷入口时命中过隐藏侧栏链接，路由直达验证通过，未单列问题。
- 家园沟通：发送回复是页面内 fake success，没有回复提交 API，没有持久化，也没有同步到林妈妈端。
- 晨检记录：保存只进入 `childcare.demo:v4-demo-recovery-hotfix:u-teacher.health.v3` 或 `u-teacher2.health.v3`；demo `/api/state` 写入不发生，父端不可见。
- 饮食记录：保存只进入教师本地 `meals.v3`；刷新教师端保留，但林妈妈端不可见。
- 成长记录：保存只进入教师本地 `growth.v3`；缺图片/媒体上传链路，父端不可见。
- 健康材料解析：上传 UI 和接口存在，但当前是 fallback/mock 解析，且没有结果持久化。
- 高风险会诊：生成链路部分可用，但 AI transport 为 fallback，写回只在教师本地，刷新后结果视图不恢复，跨端同步缺失。

## 账号差异

- 李老师：向阳班数据正确显示；林小雨相关晨检、饮食、成长、会诊测试写入后只在李老师本地命名空间可追踪；林妈妈端看不到这些教师新增内容。
- 周老师：晨曦班数据正确显示；界面上看不到李老师的林小雨和李老师测试 token；周老师新增晨检和会诊写入 `u-teacher2` 本地命名空间。隔离在 UI 上通过，但证据显示主要依赖 demo localStorage namespace，不是后端权限验证。

## 网络与持久化证据

- `/api/ai/teacher-agent`：200，用于 AI 沟通建议；不是家长回复提交。
- `/api/ai/health-file-bridge`：200，但响应带 `fallback: true`、`mock: true`、`liveReadyButNotVerified: true`。
- `/api/ai/high-risk-consultation/stream`：200 `text/event-stream`，响应内容显示 `transport: next-json-fallback`。
- `/api/state`：demo 账号设计上不支持远端写入；本轮教师保存未观察到写请求，源码路径显示 demo PUT 会 403。
- scoped localStorage：`childcare.demo:v4-demo-recovery-hotfix:<userId>.*.v*` 保存教师记录；父端 UI 不读取李老师本地写入的测试 token。

## 截图索引

- 工作台：`artifacts/feature-audit/C11-teacher/li-workbench.png`，`artifacts/feature-audit/C11-teacher/zhou-workbench.png`
- 家园沟通：`artifacts/feature-audit/C11-teacher/li-communication-before-send.png`，`artifacts/feature-audit/C11-teacher/li-communication-after-send.png`
- 晨检：`artifacts/feature-audit/C11-teacher/li-health-after-save.png`，`artifacts/feature-audit/C11-teacher/li-health-after-refresh.png`，`artifacts/feature-audit/C11-teacher/zhou-health-isolation.png`，`artifacts/feature-audit/C11-teacher/zhou-health-after-save.png`
- 饮食：`artifacts/feature-audit/C11-teacher/li-diet-after-save.png`，`artifacts/feature-audit/C11-teacher/li-diet-after-refresh.png`
- 成长：`artifacts/feature-audit/C11-teacher/li-growth-after-save.png`，`artifacts/feature-audit/C11-teacher/li-growth-after-refresh.png`
- 健康材料解析：`artifacts/feature-audit/C11-teacher/li-health-file-bridge-result.png`，`artifacts/feature-audit/C11-teacher/li-health-file-bridge-after-refresh.png`
- 高风险会诊：`artifacts/feature-audit/C11-teacher/li-high-risk-consultation-result.png`，`artifacts/feature-audit/C11-teacher/li-high-risk-consultation-after-refresh.png`，`artifacts/feature-audit/C11-teacher/zhou-high-risk-consultation-result.png`
- 家长端同步验证：`artifacts/feature-audit/C11-teacher/parent-after-teacher-record.png`，`artifacts/feature-audit/C11-teacher/parent-agent-after-teacher-record.png`

## 产物

- findings JSON：`docs/feature-audit/findings/C11-teacher.json`
- markdown：`docs/feature-audit/findings/C11-teacher.md`
- 截图目录：`artifacts/feature-audit/C11-teacher/`
