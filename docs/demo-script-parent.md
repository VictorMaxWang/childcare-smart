# Parent Demo Script

本稿服从 `docs/demo-script.md`，只保留 Parent 微绘本与趋势线的 drill-down。

## 目标

- 用微绘本制造 wow factor
- 用趋势线和反馈入口把“好看”落到“今晚怎么做”

## 路线 A：Parent 微绘本

### 起点

- `/parent`

### 操作顺序

1. 先在首页停留，说明这不是报表页，而是家长的今夜行动首页
2. 展示“今日成长小故事”
3. 点击“打开今日微绘本”
4. 在 `/parent/storybook?child=c-1` 里翻 3 幕故事
5. 点一次播放 / 预览按钮

### 建议话术

- “家长真正需要的不是更多图表，而是一个能在手机上立刻看懂、愿意继续看下去的入口。”
- “所以我们把成长亮点、最近会诊和今夜任务压缩成 3 幕微绘本。”
- “它不只是好看，而是把情绪价值和行动入口放在一起。”

### 镜头必须保留

- `StoryBookViewer`
- 3 幕场景
- image / audio 状态
- provider / fallback 标识

### fallback 讲法

- “微绘本当前允许规则 / 资产 / media fallback，所以这里我们讲成可展示 wow factor，不把它讲成图像 / 配音上游 fully live。”

## 路线 B：Parent 趋势线与反馈闭环

### 起点

- `/parent/agent?child=c-1`

### 操作顺序

1. 从微绘本页面返回 Parent Agent
2. 点一条趋势快捷问题
3. 等待结果卡出现
4. 展示 `trendLabel`、`source`、`dataQuality`、`warnings`
5. 把镜头给到 `TrendLineChart`
6. 最后停在反馈入口

### 建议话术

- “家长看完故事后，接下来最自然的问题就是：最近到底是在变好，还是只是今天偶然好一点。”
- “这里趋势线不是为了做分析平台，而是为了让家长更安心地执行今晚那一件事。”
- “做完之后，家长可以马上反馈，这样老师明天不是重新开始，而是接着这一轮上下文继续看。”

### 镜头必须保留

- `trendLabel`
- `source`
- fallback badge
- `dataQuality`
- `warnings`
- `TrendLineChart`
- 反馈入口

### fallback 讲法

- “如果结果来自 `demo_snapshot`，我们会把 `fallback`、`dataQuality.fallbackUsed=true` 和 `warnings` 保留在画面里，不把它装成真实机构数据。”
- “Parent trend 当前必须走 FastAPI brain，不是本地就能完整跑的链路。”

## Parent 段收尾

- “家长端这一段负责把作品从‘会分析’变成‘愿意看、看得懂、做得下去、还能反馈回来’，这是我们在比赛里保留微绘本和趋势线并存的原因。”
