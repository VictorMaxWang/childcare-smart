# Freeze Checklists

本清单用于 T13B 最终 freeze 前收尾整合，只覆盖：

- 浏览器级 walkthrough
- 录屏前 checklist
- 答辩前 checklist

不覆盖 deployment / TLS / Caddy / SSH / vivo 上游最终验收。

## 1. 浏览器级 Walkthrough Checklist

### 固定顺序

1. `/teacher`
2. `/teacher/high-risk-consultation`
3. `/admin`
4. `/parent`
5. `/parent/storybook?child=c-1`
6. `/parent/agent?child=c-1`

### Teacher 语音主线

- 先确认 demo teacher 账号可见数据正常
- 真走一次录音授权
- 结果弹层里保留 transcript、warnings、草稿源
- 至少完成一次草稿保存或跳转到 `/teacher/agent`
- 若出现 fallback badge，保留在画面里，不要遮掉

### 高风险会诊主线

- 选择儿童并输入教师补充说明
- 让镜头完整看到 3 个 stage 顺序
- 保留 summary card、follow-up card、intervention card
- 在答辩准备版至少看一眼 `providerTrace` 与 `memoryMeta`
- 区分 `fastapi-brain` 与 `next-stream-fallback`

### Admin 决策区主线

- 首页 hero stats 可见
- `RiskPriorityBoard` 可见
- source badge 可见
- 至少读 1 到 2 个优先级条目
- 必要时进入 `/admin/agent` 验证承接正常

### Parent 微绘本主线

- `/parent` 首页“今日成长小故事”入口可见
- `/parent/storybook?child=c-1` 正常打开
- 至少切换 3 幕中的 2 幕
- image 状态、audio 状态、provider / fallback 标识可见

### Parent 趋势线主线

- `/parent/agent?child=c-1` 正常打开
- 至少点 1 条趋势快捷问题
- 保留 `trendLabel`
- 保留 `source`
- 保留 `dataQuality`
- 保留 `warnings`
- `TrendLineChart` 或对应状态可见
- 最终反馈入口可见

## 2. 录屏前 Checklist

### 环境

- 前端已启动：`npm run dev`
- 后端已启动：`py -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000`
- `BRAIN_API_BASE_URL` 已指向正确 backend
- 只使用 demo 账号
- 不在画面里暴露真实 `VIVO_APP_ID` / `VIVO_APP_KEY`

### 画面必须出现的字段

- Teacher：transcript、warnings、草稿源
- Consultation：stage、summary、follow-up、intervention、必要时 `providerTrace` / `memoryMeta`
- Admin：source badge、优先级条目
- Storybook：scene、image/audio 状态、provider / fallback 标识
- Trend：`trendLabel`、`source`、`dataQuality`、`warnings`、图表或状态消息

### fallback 出现时的话术

- Teacher：只说“结构化草稿链路可演示”，不说 ASR fully live
- Consultation：只说“页面级 fallback”，不说远端 brain 已验收
- Admin：只说“展示层复用 consultation 结果”，不说远端聚合已打通
- Storybook：只说“wow factor 可展示”，不说图像 / 配音上游 fully live
- Trend：若出现 `demo_snapshot`，必须明确是 backend 数据降级

### 录屏前最好再人工确认一遍

- 浏览器录音权限
- consultation trace 面板是否正常展开
- Admin source badge 是否符合预期
- storybook image/audio 状态是否没有空白
- trend 卡里的 `source` / `dataQuality` / `warnings` 是否都在镜头里

## 3. 答辩前 Checklist

### 统一叙事顺序

1. Teacher 语音主线
2. 高风险会诊主线
3. Admin 决策区主线
4. Parent 微绘本主线
5. Parent 趋势线主线

### 必须统一的保守口径

- staging 不能写成 `fully healthy` / `fully switched`
- vivo 相关只能写“代码层接入 + smoke/test/演示基础”
- Parent trend 必须依赖 FastAPI brain
- Parent storybook 的图像 / 配音允许 fallback
- Admin 第二展示位不等于 `T9D` / `T9C` 已完成

### 如果评委追问 live 状态

- “当前可确认的是代码层接入、测试和演示链路已具备，真实上游与 staging 仍在 freeze 前收口。”

### 如果评委追问 fallback

- “我们把 fallback 明确保留在画面里，是为了诚实表达当前质量边界，而不是把演示态包装成 fully live。”

### 如果评委追问为什么保留微绘本

- “微绘本负责让家长愿意看，趋势线和反馈负责让家长做下去，这两条一起才构成家长侧闭环。”

## 4. 相关细分清单

- `docs/teacher-voice-smoke.md`
- `docs/teacher-consultation-qa.md`
- `docs/parent-trend-smoke.md`
