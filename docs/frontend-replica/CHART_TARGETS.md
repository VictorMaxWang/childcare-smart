# Chart Targets

## Target Types
- KPI cards：在园儿童、出勤率、沟通条数、健康异常、活动参与率等。
- Line chart：出勤率趋势、健康/成长/家园沟通趋势。
- Bar chart：班级对比、活动参与、记录数量。
- Donut/Pie chart：异常类型分布、风险分布。
- Combo chart：柱状 + 折线的沟通活跃度、运营指标。
- Ranking/Table：班级运营对比、儿童风险清单、待办任务。
- Export controls：日期范围、今日/本周/本月/自定义、导出报表。

## Data Rules
- 图表必须接真实 demo 数据或已有 API/view-model。
- 不允许用设计图中的静态数字硬编码成假成功。
- 空数据、loading、error 必须有真实状态。
- 视觉上对齐设计图的网格线、legend、tooltip、axis、颜色、柱宽、线宽、圆角。

## Priority Routes
| Route | Chart Targets | Task |
| --- | --- | --- |
| /admin | KPI、趋势、环图、风险/待办摘要 | R20/R05 |
| /admin/agent?action=weekly-report | 运营报表、折线、柱状、环图、班级对比表 | R20/R05 |
| /teacher | 班级概览、任务、近期动态、状态摘要 | R30/R05 |
| /teacher/agent | AI 总结、问题分类、班级概览、执行动态 | R30/R05/R06 |
| /parent?child=c-1 | 今日状态、成长时刻、里程碑、趋势入口 | R40/R05 |
| /parent/agent?child=c-1 | 7 天趋势、AI 干预闭环、反馈状态 | R40/R05/R06 |
| /health | 体温/情绪趋势、异常分布 | R50/R05 |
| /growth | 成长分类趋势、复盘图表 | R50/R05 |
| /diet | 饮食记录、营养趋势、AI 评分 | R50/R05/R06 |
