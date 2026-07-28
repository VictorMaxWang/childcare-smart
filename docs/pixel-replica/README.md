# Pixel Replica 工作说明

本目录只保留仍在维护的视觉复刻事实源和验收规则。旧任务提示词、并行分工表、实施日志与阶段状态已经退出当前文件树；需要追溯时使用 Git 历史。

## 事实源

- [`DESIGN_SOURCE_INDEX.md`](DESIGN_SOURCE_INDEX.md)：原始设计图索引。
- [`DESIGN_TO_ROUTE_MAP.md`](DESIGN_TO_ROUTE_MAP.md)：现有路由与主、次设计参考的映射。
- [`VISUAL_ONLY_RULES.md`](VISUAL_ONLY_RULES.md)：仅展示模块和 mock 数据的安全边界。
- [`PIXEL_ACCEPTANCE_CRITERIA.md`](PIXEL_ACCEPTANCE_CRITERIA.md)：视觉评分、页面优先级与验收阈值。

## 固定设计源

原始 GPT Image 2 设计图位于仓库外的 `<design-source-root>`。它通常解析为仓库同级的 `../前端重构`，不应复制进仓库或从仓库内猜测来源。

当设计源位于其他位置时：

- 资产提取脚本使用 `PIXEL_DESIGN_SOURCE_DIR`。
- 审计与截图差异脚本使用对应的 `FRONTEND_REPLICA_DESIGN_*` 环境变量。

`public/pixel-replica/` 只保存运行时资产，不是原始设计事实源。

## 工作流程

1. 先阅读本页、设计图索引、路由映射、仅展示规则和验收标准。
2. 根据目标路由选择明确的设计图与 viewport，并在修改前保存页面截图。
3. 优先匹配布局、色彩、卡片、导航、表格、按钮、弹窗、插图、空状态、图表和响应式行为。
4. 修改后重新截图并按验收标准评分；未达到对应阈值时继续修正。
5. 同步验证登录、角色路由、权限、演示账号、业务入口和相关交互没有回归。
6. 截图、差异报告、评分和测试结果写入已忽略的 `artifacts/pixel-replica/<timestamp>/`，不得新增到活动文档目录。

可使用 `npm run pixel:extract-assets`、`npm run pixel:capture` 和 `npm run pixel:compare`。Critical、High、Medium 页面目标分数分别为 95、90、85。

`pixel:compare` 会以 center/cover 把参考图归一化到截图尺寸，而且同一路由的桌面与移动截图共用一个 reference 字段。参考图比例或端型不一致时，自动分数只作辅助，必须同时人工核对原图并记录偏差。

## 视觉与功能边界

- 视觉匹配优先，但登录、路由、角色权限、API 协议和真实业务入口必须保持可用。
- 路由映射中记录的查询参数、锚点、工作流和交互行为必须保留。
- 核心交互区域应尽量使用真实 HTML/CSS 和现有组件，不得用整页静态截图冒充页面。
- 设计中暂无业务支持的模块可以使用明确的 visual-only 数据，但不得伪造真实写入、发送、删除、上传或 AI 成功。
- 不得在视觉素材、截图或文档中加入真实儿童信息、凭据、内部令牌或其他敏感信息。
- 不提交 `node_modules`、Playwright trace、视频、浏览器数据或大型临时文件。

## 裁图规则

允许裁取背景装饰、插图、图标、空状态、绘本图片、装饰卡片和不承担真实交互的预览区域。禁止使用整页截图、裁切表单、裁切数据表或伪按钮替代真实交互界面。

运行时裁图统一放在 `public/pixel-replica/`，并由 `public/pixel-replica/manifest.json` 管理。新增裁图至少记录设计图 ID 或源内相对路径、裁切矩形、输出路径、目标路由、用途、运行时安全性和人工复核状态。

## 文档与生成物约定

- 长期规则只更新本页或上面的四个事实源，不再创建按任务编号拆分的提示词和状态账本。
- 并行修改遵循根目录 `AGENTS.md` 和当前任务登记；共享 shell、导航、`components/ui`、视觉文档及截图/差异脚本发生重叠时应串行协调。
- 可复用的页面规格保留在 [`../../tests/fixtures/frontend-replica/page-specs/`](../../tests/fixtures/frontend-replica/page-specs/)。
- 可复用的审计输入保留在 [`../../tests/fixtures/frontend-replica/audit-inputs/`](../../tests/fixtures/frontend-replica/audit-inputs/)。
- 所有可再生成报告统一写入 `artifacts/`；该目录不会进入 GitHub 当前文件树。
