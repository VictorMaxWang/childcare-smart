# Command Intent Map

## Common Intents

| Intent | Confirmation | Behavior |
| --- | --- | --- |
| `navigate` | none | 跳转授权页面 |
| `query` | none | 查询授权范围内数据 |
| `draft` | light | 生成草稿，不发送 |
| `write` | strong | 写正式记录 |
| `dispatch` | strong | 创建/派发任务 |
| `generate` | light/strong | 生成草稿轻确认，归档强确认 |
| `confirm` | none | 执行待确认命令 |
| `cancel` | none | 取消待确认命令 |

## Director Skills

| Skill | Example | Executor |
| --- | --- | --- |
| `director.weekly_report.generate` | 生成本周运营周报 | `/api/ai/weekly-report` then `/api/weekly-reports` |
| `director.risk.query` | 今天优先关注哪些孩子 | `/api/analytics/admin/summary` |
| `director.task.dispatch` | 把复查任务派给李老师 | `/api/voice-assistant/commands` or task API |
| `director.feedback.open` | 查看这条反馈详情 | `/api/feedback/[feedbackId]` |
| `director.metrics.view` | 查看健康异常趋势 | `/api/analytics/admin/quality-metrics` |

## Teacher Skills

| Skill | Example | Executor |
| --- | --- | --- |
| `teacher.health.record` | 给小雨记录体温 37.8 | health records API |
| `teacher.meal.record` | 午餐吃得少，喝水 100 毫升 | meal records API |
| `teacher.growth.record` | 记录午睡前哭闹十分钟 | growth records API |
| `teacher.parent.reply` | 回复家长今晚继续观察 | message API |
| `teacher.material.parse` | 解析这张健康材料 | OCR/provider + health material API |
| `teacher.consultation.create` | 发起高风险会诊 | consultation API |

## Parent Skills

| Skill | Example | Executor |
| --- | --- | --- |
| `parent.message.send` | 给老师留言 | message API |
| `parent.today.query` | 今天在园状态怎么样 | scoped child summary |
| `parent.reminder.read` | 标记提醒已读 | reminder API |
| `parent.feedback.submit` | 反馈今晚任务完成情况 | feedback API |
| `parent.storybook.generate` | 用本周成长记录生成绘本 | storybook API |
| `parent.storybook.export` | 导出绘本 | HTML/Markdown export |

