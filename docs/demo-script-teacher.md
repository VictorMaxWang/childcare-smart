# Teacher Demo Script

本稿服从 `docs/demo-script.md`，只保留 Teacher 相关 drill-down。

## 目标

- 展示教师如何低成本记录
- 展示高风险会诊如何成为当前最强 Agent workflow

## 路线 A：Teacher 语音主线

### 起点

- `/teacher`

### 操作顺序

1. 停留在首页 3 到 5 秒
2. 指出异常儿童、未完成晨检、待复查和待沟通家长
3. 打开右下角全局语音入口
4. 录入一段 3 到 5 秒的观察语句
5. 展示 transcript、understanding、warnings
6. 进入 `/teacher/agent` 看草稿确认

### 建议话术

- “老师在现场最缺的不是判断，而是时间，所以第一步不能要求她先写完整记录。”
- “这里我们让老师像用手机语音助手一样先说出来，系统再把它转成结构化草稿。”
- “下一步不是继续堆文本，而是直接进入教师 Agent 页做确认和流转。”

### 镜头必须保留

- 语音层状态
- transcript
- 结构化草稿
- warnings
- 草稿源

### fallback 讲法

- “语音入口已经能稳定支持草稿链路演示；如果走到 fallback，我们只说明这条结构化草稿链路已跑通，不把它讲成 ASR live fully verified。”

## 路线 B：高风险会诊主线

### 起点

- `/teacher/high-risk-consultation`

### 操作顺序

1. 选择儿童
2. 输入一段教师补充说明
3. 可选填图片 / 语音占位
4. 点击“一键生成会诊”
5. 让镜头完整走过 3 个 stage
6. 停留在 summary、48 小时复查和 intervention card
7. 如需答辩补充，再加 `?trace=debug`

### 建议话术

- “这里不是单一问答，而是系统先合并长期画像、最近上下文和当前风险信号，再组织多 Agent 推理。”
- “结果不是一段长文本，而是教师动作、家长今夜任务和园长决策卡。”
- “这条链路是当前最强的 Agent workflow，也是整套作品的第一展示位。”

### 镜头必须保留

- stage 推进
- summary card
- follow-up card
- intervention card
- `providerTrace`
- `memoryMeta`

### fallback 讲法

- “如果这里是 `next-stream-fallback` 或 demo trace，它只代表页面级 fallback，不代表远端 brain 全链路验收。”

## Teacher 段收尾

- “教师端负责把问题低成本地捕捉出来，再把真正高风险的情况升级成结构化会诊，这样后面的园长决策和家长执行才有依据。”
