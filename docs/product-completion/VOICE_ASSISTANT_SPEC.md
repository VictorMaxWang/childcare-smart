# Voice Assistant Spec

## Architecture

三端共用语音球：

```text
VoiceAssistantLayer
  -> Input Adapter
  -> Intent Router
  -> Command Planner
  -> Permission Gate
  -> Confirmation Controller
  -> Executor
  -> Result Presenter
```

## Input Adapter

- 优先使用浏览器 `SpeechRecognition`。
- 可录音时使用 `MediaRecorder` + ASR provider。
- 没有语音能力时显示文本输入 fallback。
- 输出统一为 `AssistantUtterance`。

## Command Shape

```ts
interface AssistantCommand {
  commandId: string;
  role: "director" | "teacher" | "parent";
  intent: "navigate" | "query" | "draft" | "write" | "dispatch" | "generate" | "confirm" | "cancel";
  skill: string;
  targetPage?: string;
  deeplink?: string;
  entities: Record<string, unknown>;
  riskLevel: "safe" | "confirm" | "restricted";
  requiredPermission: string;
  confirmationCopy?: string;
  executorPayload?: Record<string, unknown>;
}
```

## Confirmation

无需确认：

- 页面跳转
- 只读查询
- TTS 朗读

轻确认：

- 保存草稿
- 生成未发送话术
- 生成周报草稿

强确认：

- 发送消息
- 保存正式晨检/饮食/成长记录
- 创建或派发任务
- 发起会诊
- 更新会诊状态
- 归档/恢复
- 导出/分享

## Execution

执行器必须调用真实 store/API action。无法执行时返回明确失败或暂未开放，不能 toast 成功。

## E06 Implementation

- 全局入口：`components/Navbar.tsx` 在已鉴权 AppShell 内挂载 `components/voice-assistant/VoiceOrb.tsx`，覆盖园长端、教师端、家长端。
- 输入优先级：浏览器 `SpeechRecognition/webkitSpeechRecognition`；不可用时可尝试 `MediaRecorder` + `/api/ai/voice-asr`；文本 fallback 始终可用。
- Provider：`/api/ai/provider-status` 复用 E05 `getVivoProviderStatus()`，`/api/ai/voice-asr` 复用 E05 `resolveAsrProvider()`；前端不暴露 vivo key/secret/token。
- 解析：`lib/voice-assistant/parser.ts` 先使用本地规则，不依赖外部 LLM；vivo chat 仅保留后续增强入口。
- 执行：`POST /api/voice-assistant/commands` 是 plan/execute 统一入口，使用 E01 `requireSession`、`AppDataService`、`lib/server/scope.ts`。
- 确认：写入型和危险命令必须先展示 `previewText` 并确认；未确认执行返回 `needs_confirmation`，未知/缺参数/unsupported 不执行。
- 权限：客户端只做基础提示，服务端 command bus 再做 role/scope 复核；`proxy.ts` 放行 `/api/voice-assistant`，由 route handler 返回统一 JSON 401/403。
- 历史：`lib/voice-assistant/history.ts` 使用 role/user scoped localStorage，只记录指令、结果/错误、时间和 intent。
- 当前本地 provider 状态：vivo chat/asr 为 `missing-env`，UI 显示“当前使用文本/本地规则 fallback”。

## E07 Director Voice Assistant Skills

Director skills are implemented as E06 `AssistantCommand` intents and executed through `POST /api/voice-assistant/commands`. The director VoiceOrb does not call vivo directly, does not write localStorage directly for business mutations, and does not bypass E01 service/scope checks.

Supported director intents:

- `navigate`: opens director home, teacher management, and child profile routes after `canRoleAccessPath` validation.
- `query_director_risk`: reads E01 admin summary, health records, feedback, consultations, and children to summarize high-risk children or today's abnormal morning checks.
- `query_director_feedback`: reads real feedback rows and returns unresolved feedback count plus first actionable refs.
- `view_feedback_detail`: reads scoped feedback detail by current `feedbackId` or named child.
- `mark_feedback_resolved`: confirms first, then calls `AppDataService.updateFeedbackStatus(..., "resolved")`.
- `generate_weekly_report`: confirms first, then creates a persisted E01 weekly report for the institution scope.
- `export_weekly_report`: confirms first, then returns real export content and lets VoiceOrb trigger a Blob download.
- `share_weekly_report`: confirms first, then persists share metadata and displays/copies local share text.
- `assign_task`: confirms first, then creates an E01 assignment backed by `tasks` plus a target-teacher `reminder`.
- `update_assignment_status`: confirms first, then updates the E01 assignment/task/reminder status for dispatch closure.
- `query_director_trend`: reads E01 analytics trends for meal, health abnormal, growth, feedback, consultation, or records.
- `query_consultation_status`: reads real consultations and summarizes active high-risk items.
- `query_dashboard`: reads admin summary, quality metrics, weekly trend, and assignment closure counts.

State and context:

- `VoiceOrb` stores recent `feedbackId`, `weeklyReportId`, `assignmentId`, `childId`, `consultationId`, and `reminderId` refs returned by executors, enabling follow-up commands such as “这条反馈” and “本周周报”.
- Refreshed write results call `reloadAppSnapshotFromApi()` and `router.refresh()` so page reloads keep weekly reports, feedback status, and assignments.
- Teacher assignment closure is exposed in the teacher reminder center for `sourceType: "admin_dispatch"` reminders and updates through `/api/assignments/[assignmentId]`.

Permission rules:

- Director-only intents are in the director permission set only. Teacher/parent attempts are planned as forbidden or rejected by `validateAssistantCommandPermission()`.
- Assignment APIs are allowed through `proxy.ts` but route handlers still resolve session and delegate to `AppDataService`, which uses `requireDirector`, `requireChildAccess`, and `requireTeacherAccess`.
- Parents cannot access director feedback, weekly report, assignment, or high-risk institution data through voice commands.
## E08 Teacher Voice Assistant Skills

Teacher skills are implemented as E06 `AssistantCommand` intents and executed through `POST /api/voice-assistant/commands`. The frontend VoiceOrb never writes localStorage for teacher commands and never calls vivo directly.

Supported teacher intents:

- `create_morning_check`: parses temperature, normal/abnormal symptoms, cough and parent-attention notes; upserts the same child/date health record through `AppDataService.listRecords/createRecord/updateRecord`.
- `create_diet_record`: records one child meal or class bulk meal records; class bulk requires the teacher's own class.
- `create_growth_record`: records teacher growth observations with a parsed category and voice-assistant tag.
- `reply_message`: replies to the latest parent message for the scoped child or explicit `messageId`; AI suggestions are never treated as sent messages.
- `create_health_material_task`: creates a pending health material metadata task and deep-links to `/teacher/health-file-bridge`; OCR/ASR parsing remains owned by E05 provider flows.
- `create_consultation`: creates a scoped high-risk consultation after confirmation.
- `update_dispatch_status`: treats director dispatch as the consultation director decision card, updating `workflowStatus` to `in-progress` or `resolved`.
- `query_today_tasks`, `query_parent_messages`, `query_child_status`, `open_child_profile`, and teacher-safe navigation are read-only and do not require confirmation.

State refresh:

- `/api/state` demo GET now returns the E01 repository scoped snapshot.
- `useApp().reloadAppSnapshotFromApi()` reloads the API snapshot after refreshed voice executions.
- `VoiceOrb` calls `reloadAppSnapshotFromApi()` and `router.refresh()` after successful write commands, so teacher/parent/director pages read the same E01 service state after refresh.

Permission rules:

- The parser can see institution children only to identify spoken names and surface forbidden scope accurately.
- Permission validation checks the resolved `childId`, `className`, and navigation child query against the scoped children for the current user.
- E01 `AppDataService` and `lib/server/scope.ts` still perform the final write/read scope checks; cross-class forged commands return `forbidden_scope`.

## E09 Parent Voice Assistant Skills

Parent skills continue to use the E06 flow: `VoiceOrb -> POST /api/voice-assistant/commands -> parser -> permission -> confirmation -> executor -> AppDataService/scope`. The parent frontend does not call vivo directly, does not create a provider client, and does not write command results straight to `localStorage`.

Supported parent commands:

- `send_message`: supports commands such as `给老师留言，今天晚上孩子有点咳嗽` and `问老师今天午睡怎么样`; the command previews the message and sends through `AppDataService.sendMessage` only after confirmation.
- `create_feedback`: supports `我要反馈，孩子最近睡眠不太好`; the command previews the feedback and creates it through `AppDataService.createFeedback` only after confirmation.
- `query_child_status`: supports current-child summaries for today's status, meals, health records, and growth records, including `查看今天吃了什么` and `查看健康记录`.
- `query_teacher_replies`: reads real teacher replies from scoped parent messages and returns an empty state when no reply exists.
- `query_today_tasks`: reads today's scoped reminders, including `查看今天的提醒`.
- `mark_reminder_read`: supports `标记这个提醒已读`; if no explicit reminder id is in context, the executor selects the latest unread reminder for the current child, previews its title, and confirms before update.
- `share_storybook`: supports `分享成长绘本`; it requires confirmation and returns local share summary/copy text when no external share service exists.
- `export_storybook`: supports `导出成长绘本`; it requires confirmation and returns HTML/Markdown/JSON download content.
- `navigate`: opens parent-safe routes for growth storybook, child profile, nutrition menu, daily reminders, health, diet, and growth pages.

Confirmation and result handling:

- Message, feedback, reminder read, storybook share, and storybook export all return `needs_confirmation` before execution.
- Read-only queries and page navigation execute without confirmation.
- Storybook export results expose a download action in `VoiceOrb`; storybook share results expose copyable local share text and explain that external sharing is unavailable.
- Failed writes surface the real API/service error returned by the command bus rather than showing a success toast.

Scope and data isolation:

- Parent commands bind to the current authorized child from route/session context; the server revalidates through `AppDataService` and `lib/server/scope.ts`.
- `navigate` permission checks parse `child` and `childId` from generated deeplinks and reject unauthorized child ids instead of falling back silently.
- Reminder, storybook, message, and feedback object ids are resolved against real scoped resources before execution.
- Provider unavailable states still use the E05 status/ASR flow and keep text fallback available.

## E10 Command Bus Hardening

- `POST /api/voice-assistant/commands` execute requests must not trust client-supplied `requiredConfirmation`, `status`, or `safetyLevel` for write/risky commands.
- The server recomputes confirmation from `intentNeedsConfirmation(intent)` before permission checks. Forged write commands with `requiredConfirmation:false` return `needs_confirmation` and do not mutate data.
- Navigation commands are normalized with `sanitizeNextPath()` before permission checks. External URLs, `/api/*`, `/_next/*`, login paths, and unknown app paths are rejected.
- E07/E08/E09 VoiceOrb flows must continue to call the E06 command bus. They must not call vivo directly, create separate chat/ASR clients, or write business data straight from the browser.
- Missing child, ambiguous child, forbidden child/class, unsupported intent, or provider-unavailable ASR must surface as an error/clarification state rather than a success toast.
