# 答辩 Demo 最终修复报告

报告日期：2026-05-19  
修复范围：最后总验收；不新增大功能，只修明显 bug、整理 smoke 合约和答辩报告。

## 修复内容

- 修复家长 AI 建议 smoke：`scripts/ai-suggestions-smoke.mjs` 改为默认使用 `u-parent` 和授权儿童 `c-1`，保留正常 AI 路径和强制 fallback 路径两次请求；没有放宽 `/api/ai/suggestions` 的权限校验。
- 修复绘本 AI smoke：`scripts/parent-storybook-smoke.mjs` 仍优先认可 `remote-brain-proxy` + `mixed/real` 媒体，但同时接受明确的本地 demo-seed fallback：`next-json-fallback`、`demo-seed-isolated`、非空 `scenes`、有效图片/音频交付元数据。
- 清理 lint warning：移除 `lib/store.tsx` 中未使用的 `normalizeParentStructuredFeedback` 导入。
- 新增最终答辩文档：`docs/demo/DEMO_FINAL_CHECKLIST.md` 和本报告。

## Demo Fixture 状态

- `createDemoSeedSnapshot()` 已包含 `36` 名儿童、`6` 个答辩画像、`9` 条会诊、`136` 条提醒、`10` 条反馈、`36` 本 storybook。
- `c-1/c-2/c-3` 均在答辩班级和风险样本中；`c-1` 有完整高风险会诊和 `4` 条 `evidenceItems`。
- 林小雨固定绘本已可通过 `/parent/storybook?child=c-1` 展示基础内容，并通过 `storybook:xiaoyu:test` 覆盖 6 页固定绘本、图片 fallback、音频入口和 scope 隔离。
- 家长端今晚行动、结构化反馈、教师端周总结、管理端风险优先级均由 demo fixture 支撑。

## 六步主链验收

最近一次 `artifacts/demo-preflight-report.json` 结果：`10/10` 通过，失败 `0`。

| 主链 | 验收结果 |
| --- | --- |
| `/teacher/agent?action=weekly-summary` | 通过；教师助手结果非空，行动项 `4` 条，fallback 元数据可见 |
| `/teacher/high-risk-consultation` | 通过；`c-1` 会诊存在，`evidenceItems` 为 `4` 条 |
| `/admin` | 通过；风险优先级 compact 项 `4` 条，优先级会诊 `9` 条 |
| `/parent/storybook?child=c-1` | 通过；固定绘本根节点和 API storybook 数据可用 |
| `/parent/agent?child=c-1` | 通过；结构化反馈提交后 API 命中写回 marker |
| `npm run demo:preflight` | 通过；输出 `DEMO READY` |

## Fallback 覆盖

- 教师 AI 助手：`/api/ai/teacher-agent` 在 brain 不可达时返回 `local-rule-fallback`，页面显示 provider、transport、fallbackReason。
- 高风险会诊：JSON、stream、feed 三条链路均有 `next-json-fallback` / `next-stream-fallback` 兜底；林小雨答辩主案例固定可生成完整会诊和证据。
- 管理端：`/admin` 本地构建林小雨答辩 fallback，并合并风险优先级和治理视图。
- 家长建议：`/api/ai/suggestions` 保留强制 fallback smoke，页面失败时也会使用客户端本地建议兜底。
- 家长绘本：demo-seed 请求隔离到本地 fallback，仍返回非空 storybook scenes、图片 delivery 和音频 delivery 元数据。
- 周报：`/api/ai/weekly-report` 支持 `x-ai-force-fallback`，返回非空 summary、sections 和 providerStatus。
- 健康材料桥接：页面具备本地文本 / 规则解析 fallback；远端 writeback 失败时不阻断 UI 展示。

## 边界和风险

- 本地验收日志显示远端 brain `127.0.0.1:8000/8010` 未启动时会出现 `ECONNREFUSED`，但主链会切换到本地 fallback 并通过 `demo:preflight`。
- `ai:smoke:storybook` 的 real/mixed 远端媒体能力只有在 brain/provider 服务运行时才能证明；无远端服务时以 `demo-seed-isolated` 本地绘本验收。
- `ai:smoke` 默认访问 `http://localhost:3000`，运行前必须先启动前端服务；未启动时会是环境连接失败，不代表业务失败。
- `demo:preflight` 会真实提交一条带 `demo-preflight-<timestamp>` 的家长反馈记录；重复跑会增加 demo 反馈样本。
- 健康材料 bridge 的远端持久化失败可能出现在日志中，当前验收标准只要求演示链路和页面 fallback 可用。

## 答辩当天步骤

```powershell
cd "C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart"
npm run dev -- --hostname 127.0.0.1 --port 3000
```

浏览器打开：

```text
http://127.0.0.1:3000/login
```

演示账号：

- 管理端：`demo-admin`
- 教师端：`demo-teacher-zhou`
- 家长端：`demo-parent-lin`

答辩前快速验收：

```powershell
npm run lint
npm run build
npm run demo:preflight
```

需要复核 AI smoke 时，保持 `3000` 服务运行并执行：

```powershell
npm run ai:smoke
npm run ai:smoke:storybook
npm run storybook:xiaoyu:test
```

## 紧急兜底

- 远端 AI 不通：直接讲解 fallback 标识，展示本地非空结果和证据链；不要现场调试 provider。
- 教师周总结慢：刷新 `/teacher/agent?action=weekly-summary`，观察最新结果区和 provider 状态条。
- 高风险会诊异常：改用 `/teacher/high-risk-consultation?childId=c-1`，该案例有固定 evidenceItems。
- 管理端风险空：刷新 `/admin`，或先跑 `npm run demo:preflight` 让报告确认 fixture 完整。
- 绘本媒体异常：继续展示文字和 SVG/dynamic fallback；`storybook:xiaoyu:test` 已覆盖图片失败兜底。
- 家长反馈提交异常：直接打开 `/parent/agent?child=c-1#feedback`，按三步结构化反馈提交；若按钮状态未刷新，刷新后查看反馈列表。
