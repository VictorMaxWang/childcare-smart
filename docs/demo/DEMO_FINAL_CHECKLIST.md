# 答辩 Demo 最终验收清单

验收日期：2026-05-19  
工作目录：`C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart`

## 六步主链

| 步骤 | 路径 / 命令 | 验收点 | 状态 |
| --- | --- | --- | --- |
| 1 | `/teacher/agent?action=weekly-summary` | 教师 AI 助手展示非空周总结、目标和行动项 | 通过 |
| 2 | `/teacher/high-risk-consultation` | 高风险会诊结果完整，`c-1` 有 `evidenceItems` | 通过 |
| 3 | `/admin` | 管理端展示风险优先级和治理数据 | 通过 |
| 4 | `/parent/storybook?child=c-1` | 林小雨基础绘本可读，固定绘本 fallback 可用 | 通过 |
| 5 | `/parent/agent?child=c-1` | 家长能提交结构化反馈，并在反馈列表看到写回结果 | 通过 |
| 6 | `npm run demo:preflight` | 主链、fixture、provider 状态和 fallback 全部自动验收 | 通过 |

`artifacts/demo-preflight-report.json` 最近一次记录为 `10/10` 通过；关键计数包括教师行动项 `4` 条、`c-1` 会诊 evidenceItems `4` 条、管理端优先级会诊 `9` 条、家长反馈写回命中 `1` 条。

## 命令清单

从项目根目录执行：

```powershell
cd "C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart"
npm run lint
npm run build
npm run demo:preflight
npm run product:smoke
```

AI smoke 需要先有 `localhost:3000` 前端服务：

```powershell
cd "C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart"
npm run dev -- --hostname 127.0.0.1 --port 3000
```

另开一个 PowerShell 窗口执行：

```powershell
cd "C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart"
npm run ai:smoke
npm run ai:smoke:storybook
npm run storybook:xiaoyu:test
```

| 命令 | 状态 | 备注 |
| --- | --- | --- |
| `npm run lint` | 通过 | 修复后不应再出现 `normalizeParentStructuredFeedback` 未使用 warning |
| `npm run build` | 通过 | Next 生产构建包含目标页面和 API |
| `npm run demo:preflight` | 通过 | 自动启动 `127.0.0.1:3330`，输出 `DEMO READY` |
| `npm run product:smoke` | 通过 | 核心权限和用户旅程回归 |
| `npm run ai:smoke` | 通过 | 需 `localhost:3000`；使用 `u-parent` + `c-1` 授权 fixture |
| `npm run ai:smoke:storybook` | 通过 | 需 `localhost:3000`；远端 real/mixed 或本地 demo-seed fallback 均可验收 |
| `npm run storybook:xiaoyu:test` | 通过 | 固定林小雨 6 页绘本、图片 fallback、音频入口、scope 隔离 |

## 答辩当天启动步骤

1. 启动前端：

```powershell
cd "C:\Users\12804\Desktop\childcare-smart源代码\childcare-smart"
npm run dev -- --hostname 127.0.0.1 --port 3000
```

2. 打开登录页：

```text
http://127.0.0.1:3000/login
```

3. 推荐演示账号：

| 角色 | 账号入口 | 重点页面 |
| --- | --- | --- |
| 管理端 | `demo-admin` | `/admin` |
| 教师端 | `demo-teacher-zhou` | `/teacher/agent?action=weekly-summary`、`/teacher/high-risk-consultation` |
| 家长端 | `demo-parent-lin` | `/parent/storybook?child=c-1`、`/parent/agent?child=c-1` |

4. 快速总验收：

```powershell
npm run demo:preflight
```

看到 `DEMO READY` 后再进入答辩演示。

## 紧急兜底方案

- 如果远端 brain 服务不可用：继续演示本地 fallback；教师周总结、高风险会诊、周报、家长建议和绘本 demo-seed 都有非空本地结果。
- 如果 `3000` 端口被占用：改用 `3330`，并在浏览器打开 `http://127.0.0.1:3330/login`：

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3330
```

- 如果 AI smoke 连接失败：先确认前端服务是否运行；脚本默认访问 `http://localhost:3000`。
- 如果绘本图片资源失败：固定绘本和动态绘本都保留 SVG / dynamic fallback，文字阅读不受影响。
- 如果反馈写回慢：在 `/parent/agent?child=c-1#feedback` 提交后刷新页面或重新打开同一路径，最近反馈会从 API 再读取。
- 如果临场只剩最短路线：依次打开 `/teacher/agent?action=weekly-summary`、`/teacher/high-risk-consultation?childId=c-1`、`/admin`、`/parent/storybook?child=c-1`、`/parent/agent?child=c-1#feedback`。
