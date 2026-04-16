# 饮水量字段全链路审计与决策

## 1. 字段定义与事实结论

### 1.1 审计范围

本次 T5 只做事实审计、方案评估和明确推荐，不做字段删除，不改主流程，不触碰 parent storybook 主线文件。

本次重点审计文件：

- `lib/store.tsx`
- `app/diet/page.tsx`
- `app/api/ai/diet-evaluation/route.ts`
- `app/api/ai/suggestions/route.ts`
- `app/api/ai/follow-up/route.ts`
- `app/api/ai/parent-trend-query/route.ts`
- `lib/agent/consultation/input.ts`
- `lib/agent/consultation/trigger.ts`
- `lib/agent/consultation/diet-agent.ts`
- `lib/agent/parent-agent.ts`
- `lib/agent/priority-engine.ts`
- `lib/ai/dashscope.ts`
- `lib/ai/fallback.ts`
- `lib/ai/mock.ts`
- `lib/ai/types.ts`
- `lib/agent/admin-types.ts`
- `lib/view-models/role-home.ts`
- `components/parent/TrendLineChart.tsx`
- `components/teacher/TeacherAgentResultCard.tsx`
- `components/consultation/TraceStepCard.tsx`
- `components/admin/ConsultationTraceCard.tsx`
- `backend/app/db/childcare_repository.py`
- `backend/app/services/parent_trend_service.py`
- `backend/app/api/v1/endpoints/agents.py`
- `backend/app/schemas/parent_trend.py`

### 1.2 字段矩阵

| 概念 | 当前是否为真实字段 | 主要定义/出口 | 当前实际含义 | 关键风险 |
| --- | --- | --- | --- | --- |
| `waterMl` | 是 | `MealRecord.waterMl`、`DietEvaluationInput.todayMeals/recentMeals`、`ChildSuggestionSnapshot.recentDetails.meals`、`AdminAgentMealSnapshot.waterMl` | 单条餐次记录里的饮水量输入值 | 人工录入，且前台有默认值，容易形成伪精确 |
| `hydrationAvg` | 是派生字段 | `WeeklyDietTrend.hydrationAvg`、`ChildSuggestionSnapshot.summary.meals.hydrationAvg`、`WeeklyReportSnapshot.diet.hydrationAvg` | 周期聚合值，不是底层原始事实 | 不同模块的计算口径并不一致 |
| `lowHydrationChildren` | 是派生聚合列表 | `AdminBoardData.lowHydrationChildren`、`AdminAgentBoardSnapshot.lowHydrationChildren` | 机构侧排序/筛选结果，不是底层字段 | 名称像“低饮水名单”，但底层实现并不总是阈值判断 |
| `lowHydration` | 否 | 未发现独立 schema/type/store 字段 | 仅作为任务语义上的“低饮水”概念存在 | 容易误以为当前系统已有统一状态字段 |

### 1.3 核心事实结论

- `waterMl` 是底层餐次原始字段，真实存于 meal 记录。
- `hydrationAvg` 是派生周聚合，不是底层事实字段。
- `lowHydrationChildren` 是机构侧派生名单，不是底层事实字段。
- 当前代码里没有独立的 `lowHydration` 字段。
- 当前用户侧展示的是精确 `ml`，但底层来源是人工录入，不是设备采集。
- 前台录入存在默认值：
  - `app/diet/page.tsx` bulk 录入默认值是 `150`
  - `app/diet/page.tsx` 单餐保存兜底默认值是 `120`
- 多条规则直接把饮水量写成硬阈值：
  - `< 120`
  - `< 140`
  - `>= 120`
  - `>= 150`
  - `>= 180`
- `hydrationAvg` 实际容易被误读成“儿童全天真实饮水”，但当前更接近“已录入餐次在一个时间窗里的聚合结果”。

### 1.4 现状中的高风险结论

- `lib/agent/teacher-agent.ts` 的 teacher 侧 `ChildSuggestionSnapshot` 和 `WeeklyReportSnapshot` 目前把 meal/hydration 相关值直接置为 `0`。
- `lib/agent/consultation/trigger.ts` 仍以 `hydrationAvg < 140` 作为 diet risk 条件之一。
- 这意味着 teacher 侧“无数据/占位值”会被误判成“低饮水事实”，是当前最需要在文档里标红的风险。
- `lib/store.tsx` 里的 `lowHydrationChildren` 只是按 `hydrationAvg` 升序排序后取前 5，并没有在生成列表时先做阈值判断。这个名字会让人误以为它是明确的“低饮水名单”，但实现更接近“最低 5 名名单”。
- `lib/store.tsx` 的 `WeeklyDietTrend.hydrationAvg` 是按“有 meal 记录的天数”求均值；`lib/agent/priority-engine.ts` 的 `hydrationAvg` 则是按“meal record 条数”求均值。相同字段名在不同模块里语义不一致。

## 2. 数据层依赖

### 2.1 主链路

当前数据层主链路是：

`MealRecord.waterMl -> calcNutritionScore(...) -> summarizeWeeklyDietRecords(...) -> WeeklyDietTrend.hydrationAvg -> AdminBoardData.lowHydrationChildren / ParentFeed.weeklyTrend / AI snapshots`

### 2.2 关键文件与事实

#### `lib/store.tsx`

- `MealRecord` 明确定义了 `waterMl: number`。
- `WeeklyDietTrend` 明确定义了 `hydrationAvg: number`。
- `AdminBoardData` 明确定义了 `lowHydrationChildren: Array<{ childId; childName; hydrationAvg }>`。
- `calcNutritionScore(foods, waterMl, preference)` 把 `waterMl` 直接纳入 nutrition score。
- `summarizeWeeklyDietRecords(records)` 会把一个 child 在周期内的 meal records 先按天聚合，再用 `waterTotal / byDay.size` 得到 `hydrationAvg`。
- `getAdminBoardData()` 里 `lowHydrationChildren` 的实现是：
  - 为每个 child 取 `hydrationAvg`
  - 升序排序
  - 截前 5
  - 这里没有先按阈值过滤
- `parentFeedData` 会把 `weeklyTrend` 直接挂到 parent feed 上，后续 parent home 和 parent agent 都继续消费它。

#### `backend/app/db/childcare_repository.py`

- 当前 repository 侧只看到 meal 数据里保存 `waterMl`。
- repo 没有独立保存 `hydrationAvg`。
- repo 也没有独立保存 `lowHydrationChildren`。
- 这说明 `hydrationAvg` 和 `lowHydrationChildren` 目前都是前台/服务层派生，不是持久化事实。

#### `lib/ai/types.ts`

- `ChildSuggestionSnapshot.summary.meals.hydrationAvg`
- `ChildSuggestionSnapshot.recentDetails.meals[].waterMl`
- `WeeklyReportSnapshot.diet.hydrationAvg`
- `WeeklyReportSnapshot.topAttentionChildren[].hydrationAvg`

这些类型把 hydration 概念向 suggestion、follow-up、consultation、weekly report、trend response 继续外送。

#### `lib/agent/admin-types.ts`

- `AdminAgentMealSnapshot.waterMl`
- `AdminAgentBoardSnapshot.lowHydrationChildren`
- `AdminAgentWeeklyTrendSnapshot.hydrationAvg`

这意味着 admin AI 路由输入层也已经把 hydration 概念结构化地接住了。

### 2.3 数据层结论

- 底层事实只有 `waterMl`。
- `hydrationAvg` 是 store/AI/snapshot 层派生。
- `lowHydrationChildren` 是 admin 聚合层派生。
- 如果未来要删字段，真正高成本的不在 repo，而在前端派生逻辑、AI snapshot、consultation 文案和 trend service。

## 3. AI 推理层依赖

### 3.1 AI 推理主链路

当前 hydration 概念至少进入了 4 条 AI 推理链路：

1. `app/diet/page.tsx -> app/api/ai/diet-evaluation/route.ts -> lib/ai/dashscope.ts`
2. `lib/agent/parent-agent.ts -> app/api/ai/suggestions/route.ts -> app/api/ai/follow-up/route.ts -> consultation`
3. `lib/agent/consultation/input.ts -> trigger.ts -> diet-agent.ts`
4. `lib/agent/parent-trend.ts -> app/api/ai/parent-trend-query/route.ts -> backend/app/services/parent_trend_service.py`

### 3.2 关键文件与规则

#### `app/api/ai/diet-evaluation/route.ts`

- fallback 评分函数 `calcSimpleScore` 直接把 `waterMl` 转成 `hydrationScore`。
- 规则是 `Math.min(Math.round(waterMl / 20), 10)`。
- 这里的 hydration 权重上限是 `10`。
- 同文件还会：
  - 读取当前 meal 的 `waterMl`
  - 读取今日所有 meals 的 `waterMl`
  - 读取最近 meals 并按 date 汇总 `waterMl`
- 这意味着 `waterMl` 已经是 diet evaluation 的显式输入，不只是 UI 附属字段。

#### `lib/store.tsx`

- `calcNutritionScore` 的 hydration 部分是 `Math.min(Math.round(waterMl / 20), 15)`。
- 同样是把 `waterMl / 20` 转成分数，但这里上限是 `15`，和 `diet-evaluation` route 的 `10` 不一致。
- 这会让“同样的水量”在不同评分链路里产生不同权重。

#### `lib/ai/dashscope.ts`

- `DietEvaluationInput` 明确要求：
  - `todayMeals[].waterMl`
  - `recentMeals[].waterMl`
- prompt 说明也把“饮水”列为优先结合的信息之一。
- institution weekly report prompt 也直接要求优先分析“饮水”。

#### `lib/agent/parent-agent.ts`

- `buildFocusReasons` 会在 `weeklyTrend.hydrationAvg < 140` 时生成：
  - `近 7 天平均饮水 xx ml，偏低`
- `buildObservationDefaults` 会在 `hydrationAvg < 140` 时追问“今晚是否比前几天更愿意主动喝水”。
- `buildRecommendedQuestions` 会在 `hydrationAvg < 140` 时继续追问“如果今晚还是不愿意喝水，下一步怎么做？”
- `buildParentChildSuggestionSnapshot` 把：
  - `summary.meals.hydrationAvg`
  - `recentDetails.meals[].waterMl`
  一起送进 snapshot。

#### `app/api/ai/suggestions/route.ts` 和 `app/api/ai/follow-up/route.ts`

- 两条 route 都会把 `ChildSuggestionSnapshot` 送入 AI suggestion/follow-up。
- suggestion/follow-up 结束后，又会用同一份 snapshot 构造 `ConsultationInput`，再跑高风险 consultation。
- 所以 hydration 不只是 suggestion 的输入，也是 consultation 的上游输入。

#### `lib/agent/consultation/input.ts`

- `ConsultationInput.summary` 直接复用 `ChildSuggestionSnapshot.summary`。
- `ConsultationInput.recentDetails` 直接复用 `ChildSuggestionSnapshot.recentDetails`。
- 这让 `hydrationAvg` 和 `waterMl` 不经转换直接进入 consultation 体系。

#### `lib/agent/consultation/trigger.ts`

- `dietRisk = hydrationAvg < 140 || monotonyDays >= 3`
- 触发证据里也会直接写出：
  - `近 7 天平均饮水 xx ml`

#### `lib/agent/consultation/diet-agent.ts`

- `recentMeals.filter((item) => item.waterMl < 120)` 会把 `< 120` 认定为低饮水记录。
- `hydrationAvg < 140` 会进入 riskExplanation。
- signals 里直接写：
  - `近 7 天平均饮水 xx ml`
  - `低饮水记录 n 条`
- evidence 里直接写：
  - `某日某餐 饮水 xx ml`

#### `lib/agent/priority-engine.ts`

- 会先基于近 7 天 meal records 计算 `hydrationAvg`。
- 这里的算法是：
  - 直接用 `sum(waterMl) / records.length`
  - 分母是 meal record 条数，不是有记录的天数
- 后续阈值：
  - `< 120` 视为“饮水持续偏低”
  - `< 140` 视为“饮水偏低”
- 证据 value 会直接写成 `xx ml`。

#### `lib/ai/fallback.ts` 和 `lib/ai/mock.ts`

- fallback 与 mock 都会直接把 `hydrationAvg` 写进中文文案。
- 典型表达包括：
  - `平均饮水量约 xx ml`
  - `当前饮水偏低`
  - `建议围绕饮水继续跟进`

#### `backend/app/services/parent_trend_service.py`

- parent trend 服务固定把 `hydration_ml` 作为饮食趋势序列之一。
- label 固定是“喝水量”，unit 固定是 `ml`。
- 同时它不只是展示 hydration，还把 hydration 反过来影响 diet_quality_score：
  - `hydration >= 180 -> bonus 4.0`
  - `hydration >= 120 -> bonus 2.0`
  - 否则 bonus `0.0`

### 3.3 AI 层的关键不一致与风险

#### 风险一：teacher 侧无数据被判成低饮水

- `lib/agent/teacher-agent.ts` 当前 teacher child snapshot 把 meals summary 全部写死成 `0`，recentDetails.meals 也是空数组。
- `lib/agent/consultation/trigger.ts` 又把 `hydrationAvg < 140` 当成 diet risk。
- 结果是“没有 meal 数据”也可能被判成“低饮水”。

#### 风险二：同名 `hydrationAvg` 在不同模块语义不一致

- `lib/store.tsx`：按“有记录的天数”求均值
- `lib/agent/priority-engine.ts`：按“meal record 条数”求均值
- `backend/app/services/parent_trend_service.py`：按“每日 hydration 总和”输出 trend series

同样叫 `hydrationAvg` 或 hydration 指标，但并不是同一个统计口径。

#### 风险三：精确 ml 已深度嵌入 AI 输出文本

- hydration 不只是内部特征。
- 它已经进入：
  - suggestion
  - follow-up
  - consultation trigger
  - consultation evidence
  - priority reason
  - trend explanation
  - fallback/mock 文案

这意味着它已经是深嵌依赖，不能把“前台别显示 ml”误判成“删两个卡片就结束”。

## 4. UI 展示层依赖

### 4.1 直接录入

#### `app/diet/page.tsx`

- bulk 录入状态 `bulkWaterMl` 默认值是 `150`
- 单餐保存兜底 `waterMl` 默认值是 `120`
- 页面有两个直接输入提示：
  - `饮水量 ml`
  - `placeholder="饮水量 ml"`

这意味着从录入端开始，系统就要求老师输入精确 ml。

### 4.2 直接展示精确 ml

#### `app/diet/page.tsx`

- 周趋势卡片直接展示：
  - `平均饮水量`
  - `${weeklyTrend.hydrationAvg}ml`

#### `lib/view-models/role-home.ts`

- parent home view model 直接生成：
  - `近 7 天饮水均值`
  - `${feed.weeklyTrend.hydrationAvg} ml`

#### `app/parent/page.tsx`

- 该页面不自己写 hydration 逻辑，但直接渲染 `buildParentHomeViewModel(feed)` 产出的 `weeklyTrend`。
- 所以 parent 首页是通过 view model 间接把精确 ml 展示给用户。

#### `app/parent/agent/page.tsx`

- 页面直接展示：
  - `平均饮水`
  - `{selectedFeed.weeklyTrend.hydrationAvg} ml`

### 4.3 间接展示精确 ml

#### `components/parent/TrendLineChart.tsx`

- 只要 series unit 是 `ml`，tooltip 和 support metric summary 就会格式化成 `xx ml`。
- 这使得 parent trend 响应里的 `hydration_ml` 一旦透出到 chart，就会稳定泄漏精确 ml。

#### `components/teacher/TeacherAgentResultCard.tsx`

- 组件本身没有硬编码 hydration 文案。
- 但它会直接渲染 `result.consultation.agentFindings[].signals` 和 summary。
- 上游 `diet-agent.ts` 已经会生成：
  - `近 7 天平均饮水 xx ml`
  - `某日某餐 饮水 xx ml`
- 所以 teacher 结果卡会间接显示精确 ml。

#### `components/consultation/TraceStepCard.tsx`

- 组件本身不写 hydration 规则。
- 但会把 `stage.evidence` 原样渲染成 badge：
  - `{item.label}: {item.detail}`
- 如果上游 evidence/detail 已经带 `xx ml`，这里会原样透出。

#### `components/admin/ConsultationTraceCard.tsx`

- 组件本身不写 hydration 规则。
- 但会原样渲染：
  - `trace.explainability`
  - `trace.evidenceHighlights`
- 上游 consultation/priority 输出一旦出现 `xx ml`，园长 Explainability 就会把它展示出来。

### 4.4 admin / teacher 页面中的直接与间接情况

- `app/admin/page.tsx` 与 `app/admin/agent/page.tsx` 没有直接写出 hydration 文案或 `xx ml`。
- 但它们会把 `weeklyTrend`、`adminBoardData`、`smartInsights` 送入 admin context/view model/AI route。
- 园长侧真正的精确 ml 泄漏更主要发生在：
  - consultation trace
  - explainability
  - evidence highlights

### 4.5 storybook 相关依赖

本线程不修改 storybook 主线文件，但需要记录现有依赖：

- `lib/agent/parent-storybook.ts` 仍会把 `trend.hydrationAvg` 总结成 `饮水约 xx ml`
- 这属于已存在的用户侧精确 ml 表达
- 因当前约束，本轮只记录，不处理

### 4.6 UI 层结论

当前精确 ml 泄漏分为三类：

- 直接录入：
  - `饮水量 ml` 输入框
  - bulk 默认值 `150`
  - 单餐兜底值 `120`
- 直接展示：
  - `平均饮水量`
  - `近 7 天饮水均值`
  - parent agent 卡片里的 `xx ml`
- 间接展示：
  - trend chart 的 `unit=ml`
  - consultation signals/evidence
  - admin explainability / evidence highlights

## 5. 三种方案评估

### 方案一：彻底删除

**结论：不推荐**

优点：

- 语义最彻底
- 不再有“伪精确 ml”问题

缺点和风险：

- 要同时改动 store schema、页面录入、weekly trend、admin board、diet evaluation、suggestion/follow-up snapshot、consultation trigger、diet-agent、priority-engine、parent trend backend、trend chart、mock/fallback 文案和多处测试
- 会把 T6 从“去前台精确展示”放大成“跨层删字段重构”
- 当前 hydration 已深嵌到 AI 文案和 explainability，不适合在一轮答辩前置任务里直接全拆

适用判断：

- 只适合后续做统一数据模型重构
- 不适合 T6 作为首选方案

### 方案二：保留底层字段，但不在用户侧展示精确 ml

**结论：推荐**

优点：

- 可以最快切断评委最敏感的伪精确感
- 保留现有 store、AI、trend、repo 链路，风险最可控
- 不会把 T6 变成删字段工程
- 允许后续逐步把 AI 文案和趋势展示改成更可信的状态表达

缺点和风险：

- 底层仍然保留 `waterMl` 与 `hydrationAvg`
- 如果只改 UI，不改 AI 文案，consultation/trace 仍会继续泄漏 `xx ml`
- 需要同步处理 teacher snapshot 的 `0` 占位误判

适用判断：

- 最适合作为 T6 落地方案

### 方案三：改成“饮水状态 / 补水主动性 / 近 7 天补水趋势”

**结论：作为方案二的展示语言落地，不作为当前底层迁移方案**

优点：

- 更符合老师真实观察口径
- 更适合家长和评委理解
- 更容易避免伪精确感

缺点和风险：

- `近 7 天补水趋势` 可以从现有字段派生
- 但“补水主动性”目前没有稳定结构化字段
- 当前系统里更接近“补水主动性”的信息，主要存在于：
  - consultation 文案
  - follow-up 问句
  - teacher voice understand
  - 观察描述文本
- 如果直接把“补水主动性”当成已落地数据字段，会夸大现状

适用判断：

- 适合作为 T6 的产品表达层
- 不适合在 T6 里冒充成底层真实模型

## 6. 明确推荐方案与 T6 优先级

### 6.1 推荐方案

**正式推荐：方案二**

推荐理由：

- 先保留底层 `waterMl / hydrationAvg / lowHydrationChildren`
- 先去掉用户侧精确 `ml`
- 前台表达改成方案三的语义：
  - 饮水状态
  - 补水主动性
  - 近 7 天补水趋势

不建议在 T6 直接删除底层字段。

### 6.2 评委视角与产品可信度判断

- 托育场景下，跨多名幼儿持续记录精确 `ml` 的可信度天然偏弱。
- 当前实现又叠加了人工输入、默认值、硬阈值、partial-day 聚合和 AI 二次转述，会进一步放大“像规则拼出来的数据”的感觉。
- 精确 `ml` 一旦进入家长页、园长 explainability、会诊 evidence，评委更容易质疑：
  - 数据是否真的可采
  - 统计口径是否稳定
  - 为什么不同页面说的是同一个“平均饮水”，但底层计算口径并不完全一致
- 相比之下，“偏低 / 一般 / 更主动 / 近 7 天改善中”更贴近老师真实观察，也更符合产品可信度。

### 6.3 T6 第一优先

优先改页面：

- `app/diet/page.tsx`
- `app/parent/page.tsx`
- `lib/view-models/role-home.ts`
- `app/parent/agent/page.tsx`
- `components/parent/TrendLineChart.tsx`

目标：

- 去掉家长和评委可见的精确 `ml`
- 把首页/Agent/趋势卡片改成“饮水状态 / 补水趋势 / 是否更主动”
- 停止把 `hydration_ml` 和 `xx ml` 直接暴露给 parent 侧

### 6.4 T6 第二优先

优先改 AI 文案与会诊链路：

- `lib/agent/consultation/diet-agent.ts`
- `lib/agent/consultation/trigger.ts`
- `lib/agent/parent-agent.ts`
- `lib/agent/priority-engine.ts`
- `lib/ai/mock.ts`
- `lib/ai/fallback.ts`

目标：

- 停止生成“近 7 天平均饮水 xxx ml”这类面向用户的文本
- 把 consultation、follow-up、priority、fallback 统一改成状态化和趋势化表达

### 6.5 T6 隐藏前置项

在改 UI 之前，建议先处理：

- teacher snapshot 的 hydration `0` / no-data 逻辑
- consultation trigger 对无数据与低饮水的区分

否则即使 UI 降级，teacher/admin consultation 仍会继续产出“低饮水”误判。

### 6.6 T6 影响面与测试

后续若执行 T6，预计首先会影响这些测试或断言：

- `backend/tests/test_parent_trend_service.py`
- `backend/tests/test_childcare_repository.py`
- `backend/tests/test_agents_mock.py`
- `backend/tests/test_react_runner.py`
- `lib/agent/parent-storybook.test.ts`
- 任何断言 `hydration_ml`、`waterMl`、`hydrationAvg`、`平均饮水量约 xx ml` 的前后端 smoke/test

### 6.7 本轮边界

- 本轮只新增审计文档，不改 schema，不迁移字段。
- 本轮不修改 parent storybook 主线文件，只记录其依赖。
- 本轮明确推荐方案二，不保持模糊。
