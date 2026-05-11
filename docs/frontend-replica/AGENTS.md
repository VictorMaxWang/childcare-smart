# FRONTEND-REPLICA Agents

## Mission
严格以 `C:\Users\12804\Desktop\childcare-smart源代码\前端重构` 中的设计图为唯一视觉目标，逐图、逐路由、逐模块复刻真实可交互 UI。

## Scope
- R00 只维护 `docs/frontend-replica/` 文档和状态文件。
- 后续实现只能在对应任务授权范围内改动业务 UI。
- 当前 canonical 园长端路由为 `/admin`；不要新增 `/director`。
- `mobile` 和 `tablet` 是 viewport 状态，不是路由命名空间。

## Red Lines
- 不重新设计，不凭审美改，不只做大概相似。
- 不把设计图整张作为页面背景假冒 UI。
- 可以裁切装饰性资源或图标，但核心页面必须是真实 DOM、真实组件、真实交互。
- 所有图表必须接真实 demo 数据或已有 API，不写静态假数蒙混。
- 所有 AI 能力必须走现有 vivo 蓝心大模型 provider 或明确失败，不允许 fake success。
- 不输出、复制、提交任何 vivo key、token、secret、signature。
- 不修改 `.env.local`、`.env.release`，不新增 `NEXT_PUBLIC_VIVO_*`。
- 不破坏登录、权限、scope、M06 演示能力、demo media、固定绘本、语音球、vivo provider。
- 不提交 `node_modules`、trace、video、Playwright artifacts、大图片包。

## Required Evidence
每个后续任务必须记录：设计图 ID、目标路由、截图证据、差异项、修复项、剩余缺口、功能回归结果。
