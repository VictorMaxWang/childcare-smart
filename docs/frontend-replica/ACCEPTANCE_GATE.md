# Acceptance Gate

## Visual Acceptance
- 主页面必须用 Playwright 截图，至少 desktop 1440x900、mobile 390x844；关键竖版参考 941x1672，tablet 参考 768x1024 / 1086x1448。
- 与设计图逐页对比，生成 manifest、diff、Markdown/JSON 差异报告。
- 不能只是大概相似；色彩、布局、间距、卡片、图表、AI 助手、移动端都要对齐。
- 严禁用整张截图作为页面背景。
- 现有脚本优先：`npm run pixel:capture`、`npm run pixel:compare`、`npm run capture:visual-parity` 到 round5。

## Function Acceptance
- 示例账号登录正常。
- 园长/教师/家长数据正常，权限和 scope 不被破坏。
- AI 助手可用；vivo provider 不 fake success。
- 图表使用真实 demo 数据或已有 API。
- 语音球 `VoiceOrb` 不被破坏。
- demo media、固定绘本、小雨音频链路不被删除或替换。

## Test Acceptance
必须根据任务影响范围运行并记录：

`npm run lint`
`npm run build`
`npm run typecheck`
`npm run product:smoke`
`npm run product:api`
`npm run product:ai`
`npm run product:voice`
`npm run product:journey`
`npm run feature:smoke`
`npm run bugbash:smoke`
`npm run demo-media:test`
`npm run growth-media:test`
`npm run storybook:xiaoyu:test`（如存在）

## Artifact Policy
- 不提交 `artifacts/` 大目录、trace、video、HTML report、node_modules、.next。
- 最终报告只记录相对路径、分数、失败原因和必要小截图索引。
