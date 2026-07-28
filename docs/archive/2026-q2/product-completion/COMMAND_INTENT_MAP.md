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

## E06 Core Intent Schema

E06 的统一 `AssistantCommand` schema 位于 `lib/voice-assistant/types.ts`，包含：

- `intent`：`navigate`、`send_message`、`reply_message`、`create_morning_check`、`create_diet_record`、`create_growth_record`、`create_feedback`、`mark_reminder_read`、`generate_weekly_report`、`export_weekly_report`、`share_weekly_report`、`create_consultation`、`add_consultation_note`、`update_consultation_status`、`assign_task`、`view_feedback_detail`、`open_child_profile`、`query_dashboard`、`query_child_status`、`query_today_tasks`、`unknown`。
- `safetyLevel`：`safe | write | risky`。
- `requiredConfirmation`：写入和危险命令为 `true`。
- `previewText`：所有写入/危险命令执行前必须展示。
- `execute`：服务端 executor id，不允许前端直连 vivo 或绕过 E01 API/service。

## E06 Executable Core Map

| Intent | Safety | Executor | E06 behavior |
| --- | --- | --- | --- |
| `navigate` | safe | `navigate` | 直接跳转，先按 `canRoleAccessPath` 校验 |
| `unknown` | safe | `unknown` | 展示示例，不执行 |
| `send_message` | write | `message.send` | 确认后调用 `AppDataService.sendMessage` |
| `reply_message` | write | `message.reply` | 确认后回复当前/最近会话 |
| `create_morning_check` | write | `record.create.health` | 确认后写入健康记录 |
| `create_diet_record` | write | `record.create.meal` | 确认后写入饮食记录 |
| `create_growth_record` | write | `record.create.growth` | 确认后写入成长记录 |
| `create_feedback` | write | `feedback.create` | 确认后提交反馈 |
| `mark_reminder_read` | write | `reminder.mark_read` | 确认后更新提醒状态 |
| `generate_weekly_report` | write | `weekly_report.generate` | 确认后创建周报草稿 |
| `export_weekly_report` | risky | `weekly_report.export` | 强确认后导出最近/指定周报 |
| `share_weekly_report` | risky | `weekly_report.share` | 强确认后生成分享文案 |
| `create_consultation` | write | `consultation.create` | 确认后创建会诊 |
| `add_consultation_note` | write | `consultation.add_note` | 确认后补充会诊备注 |
| `update_consultation_status` | write | `consultation.update_status` | 确认后更新会诊状态 |
| `view_feedback_detail` | safe | `feedback.view` | 读取授权反馈详情 |
| `open_child_profile` | safe | `child.open_profile` | 读取授权儿童档案 |
| `query_dashboard` | safe | `query.dashboard` | 查询当前角色看板摘要 |
| `query_child_status` | safe | `query.child_status` | 查询授权儿童状态 |
| `query_today_tasks` | safe | `query.today_tasks` | 查询授权提醒/待办 |
| `assign_task` | risky | `assignment.create` | E07 起确认后写入 E01 assignment/task/reminder，目标教师可见 |

## E07 Director Voice Skill Map

E07 extends the E06 command bus for director workflows. All director commands are planned and executed only through `POST /api/voice-assistant/commands`; executors call E01 `AppDataService` and scope helpers.

| Intent | Safety | Executor | Director command examples |
| --- | --- | --- | --- |
| `navigate` | safe | `navigate` | `打开园长首页`; `打开教师管理` |
| `query_director_risk` | safe | `query.director_risk` | `查看高风险儿童`; `今天有多少异常晨检` |
| `query_director_feedback` | safe | `query.director_feedback` | `查看未处理反馈` |
| `view_feedback_detail` | safe | `feedback.view` | `打开某某的反馈详情` |
| `mark_feedback_resolved` | write | `feedback.mark_resolved` | `把这条反馈标记为已处理` |
| `generate_weekly_report` | write | `weekly_report.generate` | `生成本周周报` |
| `export_weekly_report` | risky | `weekly_report.export` | `导出本周周报` |
| `share_weekly_report` | risky | `weekly_report.share` | `分享本周周报` |
| `assign_task` | risky | `assignment.create` | `给李老师派单，跟进小明晨检异常` |
| `update_assignment_status` | write | `assignment.update_status` | `把这个派单标记为已完成`; `派单闭环` |
| `open_child_profile` | safe | `child.open_profile` | `查看小明的儿童档案` |
| `query_director_trend` | safe | `query.director_trend` | `本周饮食记录趋势怎么样` |
| `query_consultation_status` | safe | `query.consultation_status` | `查看高风险会诊` |
| `query_dashboard` | safe | `query.dashboard` | `查看本周运营报表` |

Confirmation rules:

- `assign_task`, `update_assignment_status`, `mark_feedback_resolved`, `generate_weekly_report`, `export_weekly_report`, and `share_weekly_report` must return `needs_confirmation` before execution.
- Read-only queries and navigation execute without confirmation and return real empty states when E01 data is empty.

Scope rules:

- Director-only intents are forbidden for teacher/parent roles at the command bus permission layer.
- Assignment writes use `/api/assignments` and `AppDataService.createAssignment/updateAssignmentStatus`; they persist to E01 `tasks` plus target-teacher `reminders`.
- Weekly report export returns real downloadable content; share returns persisted share metadata and local share text.

## E09 Parent Voice Skill Map

E09 extends the E06 executable schema for the parent role without bypassing the command bus:

| Intent | Safety | Executor | Parent command examples |
| --- | --- | --- | --- |
| `send_message` | write | `message.send` | `给老师留言，今天晚上孩子有点咳嗽`; `问老师今天午睡怎么样` |
| `create_feedback` | write | `feedback.create` | `我要反馈，孩子最近睡眠不太好` |
| `query_child_status` | safe | `query.child_status` | `查询孩子今日状态`; `查看今天吃了什么`; `查看健康记录` |
| `query_today_tasks` | safe | `query.today_tasks` | `查看今天的提醒` |
| `query_teacher_replies` | safe | `query.teacher_replies` | `查看老师回复` |
| `mark_reminder_read` | write | `reminder.mark_read` | `标记这个提醒已读` |
| `share_storybook` | risky | `storybook.share` | `分享成长绘本` |
| `export_storybook` | risky | `storybook.export` | `导出成长绘本` |
| `navigate` | safe | `navigate` | `打开成长绘本`; `打开成长档案`; `打开营养餐谱`; `打开日常提醒` |

Confirmation rules:

- `send_message`, `create_feedback`, and `mark_reminder_read` must show `previewText` and return `needs_confirmation` before execution.
- `share_storybook` and `export_storybook` are risky commands and require confirmation. If no external share service exists, the executor returns local share text or HTML/Markdown/JSON download content with an explicit note.
- Parent read-only queries and navigation execute without confirmation.

Scope rules:

- Parent command `childId` comes from current route/session context or parser child mention, then the server revalidates it through `AppDataService` and `lib/server/scope.ts`.
- Navigation permission also parses `child` and `childId` from deeplinks and rejects unauthorized child ids before routing.
- Object commands (`reminderId`, `storybookId`, `feedbackId`, `messageId`) are checked again against the real resource child scope by E01 service methods.

## E08 Teacher Voice Skill Map

E08 extends the E06 command bus for teacher workflows. All write commands return `needs_confirmation` before execution and are executed only by `/api/voice-assistant/commands` through `AppDataService`.

| Intent | Safety | Executor | Teacher command examples |
| --- | --- | --- | --- |
| `create_morning_check` | write | `record.create.health` | `给小明记录晨检，体温三十六点八，状态正常`; `小明今天晨检咳嗽，提醒家长关注` |
| `create_diet_record` | write | `record.create.meal` | `记录小明午餐吃完了`; `记录晨曦班午餐大部分孩子吃完` |
| `create_growth_record` | write | `record.create.growth` | `给小明新增成长记录，今天会自己穿鞋` |
| `reply_message` | write | `message.reply` | `回复林妈妈，今天小明午睡很好` |
| `navigate` | safe | `navigate` | `打开家园沟通`; `打开健康材料解析` |
| `create_health_material_task` | write | `health_material.create_task` | `给小明创建健康材料解析任务` |
| `create_consultation` | write | `consultation.create` | `给小明创建高风险会诊` |
| `query_today_tasks` | safe | `query.today_tasks` | `查看今天的任务` |
| `update_dispatch_status` | write | `dispatch.update_status` | `把园长派单标记为跟进中`; `把这个派单标记为已完成` |
| `open_child_profile` | safe | `child.open_profile` | `打开小明档案` |
| `query_child_status` | safe | `query.child_status` | `查询班级儿童状态`; `查看小明状态` |
| `query_parent_messages` | safe | `query.parent_messages` | `查看未回复家长消息` |

Scope rules:

- Child name and nickname matches are preferred before guardian-name matches, so `回复林妈妈，今天小明...` resolves to 小明 when the child name is present.
- The parser may resolve a child from institution context, but `validateAssistantCommandPermission()` and E01 service methods re-check `context.children`/`lib/server/scope.ts` before plan or execute succeeds.
- Class-level diet records require `className === session.className` for teachers. A teacher cannot bulk-write another class.
- Dispatch status is mapped to E01 consultations: `跟进中/接收` -> `in-progress`, `已完成` -> `resolved`.
