# Visual Tokens Target

## Source
目标来自 247 张 PNG 设计图，三种主尺寸：1448x1086、1086x1448、941x1672。

## Palette
- App background: 极浅灰/蓝灰，接近 `#F6F8FC` / `#F7F9FF`。
- Surface: 白色或轻微透明白，边框 `#E5EAF5` 附近。
- Primary: 紫/靛 `#655BFF`、`#7A5CFF`，常用于按钮、激活态、AI 标签。
- Secondary: 天蓝/青蓝用于渐变、插画光效、状态高亮。
- Semantic: 绿色成功、橙色提醒、红色风险、蓝色信息。

## Layout
- 桌面多为左侧 sidebar + 顶部栏 + 主内容网格 + 右侧 AI/建议 rail。
- 移动端多为 941x1672 竖屏，保留顶部身份、底部/抽屉导航、纵向卡片流。
- 平板/竖版为 1086x1448，不能直接等同桌面或手机。

## Components
- 卡片大圆角，约 16-28px；按钮/输入约 10-16px；pill 全圆角。
- 阴影轻，偏蓝紫，卡片边界靠 border + soft shadow。
- 图标为线性/双色图标，AI 机器人和人物头像可裁切装饰性资产，但不能替代真实 UI。
- 表格、筛选、分页、导出按钮要与设计图对齐。

## Typography
- 中文界面优先系统字体；标题加粗，正文紧凑，标签字号小但可读。
- 不使用 viewport width 缩放字体；移动端通过布局换行和尺寸约束适配。

## Responsive Rules
- Desktop: 1440x900 / 1448x1086 截图对齐。
- Mobile: 390x844 截图验收，并参考 941x1672 设计图比例。
- Tablet: 768x1024 截图验收，并参考 1086x1448 设计图比例。
