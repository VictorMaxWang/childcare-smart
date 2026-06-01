# DEMO_MATERIALS_V2

生成时间：2026-06-01T00:19:33.218Z
Base URL：http://127.0.0.1:3330
缺失必备场景：0

## 状态

- `npm run demo:materials`：生成 V2 素材包、manifest、截图清单、storyboard 和本状态文档。
- `npm run demo:materials:capture`：在本地 base URL 上重跑截图、系统导览和 preflight 后再打包。
- `npm run demo:video-storyboard`：只刷新 `artifacts/demo-materials/video-storyboard.md`。

## 必备场景

| Scene | Title | Output | Suggested use |
| --- | --- | --- | --- |
| 01-login | 登录页：示例账号入口 | `screenshots/01-login.png` | PPT 开场页、现场演示入口、视频片头 |
| 02-teacher-home | 教师端首页：教师工作台 | `screenshots/02-teacher-home.png` | 教师端能力介绍、低成本记录入口、三端闭环起点 |
| 03-consultation-setup | 高风险会诊 setup：发起与证据锁定 | `screenshots/03-consultation-setup.png` | 展示会诊入口、阶段流程、会诊对象与前置信息 |
| 04-consultation-result | 高风险会诊 result：证据链与干预建议 | `screenshots/04-consultation-result.png` | 展示会诊输出、trace timeline、长期策略与本周建议 |
| 05-admin-risk-priority | 管理端风险优先级：园长工作台 | `screenshots/05-admin-risk-priority.png` | 管理端风险优先级、会诊承接、机构治理说明 |
| 06-parent-home | 家长首页：今晚行动与反馈入口 | `screenshots/06-parent-home.png` | 家长端首页、今晚行动、趋势追问和反馈闭环入口 |
| 07-storybook-cover | 个性化绘本封面：成长绘本总览 | `screenshots/07-storybook-cover.png` | 绘本能力总览、封面/故事入口、情感化表达展示 |
| 08-storybook-page | 个性化绘本内页：故事页面与家庭任务 | `screenshots/08-storybook-page.png` | 绘本内页、个性化生成、家庭共读任务说明 |
| 09-feedback-submit | 反馈提交页：结构化家庭反馈 | `screenshots/09-feedback-submit.png` | 展示家长执行结果回流、结构化反馈提交与闭环 |
| 10-system-ai-status | 系统完成度 / AI Provider Status | `screenshots/10-system-ai-status.png` | 工程证明、答辩附录、现场说明 AI provider 与系统完成度 |

## 本地/远程安全规则

- 默认 base URL 是 `http://127.0.0.1:3330`。
- 可通过 `DEMO_MATERIALS_BASE_URL` 覆盖。
- preflight 属于可能写入演示状态的验收流程；非 localhost/127.0.0.1 目标默认拒绝运行。
- 需要远程 preflight 时，必须显式设置 `DEMO_MATERIALS_ALLOW_NONLOCAL_PREFLIGHT=1`。

## 验收

- manifest JSON 可解析。
- `missingRequiredSceneCount` 为 `0`。
- PPT-ready 截图集中在 `artifacts/demo-materials/screenshots/`。
- AI provider status 已从 `artifacts/demo-preflight-report.json` 打包为状态卡片和工程证明。
