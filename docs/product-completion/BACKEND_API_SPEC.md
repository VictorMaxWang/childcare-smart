# Backend API Spec

## Principles

- Next.js API routes 是业务 API 的主入口；FastAPI/brain 只能作为 AI 或聚合能力来源，不能替代业务授权。
- `/api/state` 保留为过渡层，不再作为新增生产功能的唯一写入口。
- 新增业务 API 必须调用统一 service，并在 service 内做 server-side scope 校验。
- 返回结构统一为 `{ ok: true, data }` 或 `{ ok: false, error, code }`。

## E01 Implemented Foundation - 2026-05-02

- Implemented shared API contracts and client helpers in `lib/api/*`.
- Implemented server route foundation in `lib/server/api-errors.ts`, `lib/server/session.ts`, `lib/server/scope.ts`, `lib/server/app-data-model.ts`, `lib/server/app-data-repository.ts`, `lib/server/app-data-service.ts`, and `lib/server/api-handlers.ts`.
- New E01 business routes use `{ ok: true, data }` and `{ ok: false, code, error }` envelopes. The legacy `/api/state` route remains a transition compatibility path and now preserves API extension buckets when saving core snapshots.
- Cookie session is preferred. `x-demo-account-id` is accepted only as a known demo-account fallback and all business actions still pass server-side scope checks.
- Implemented route groups:
  - `/api/demo/session`, `/api/demo/session/switch`
  - `/api/children`, `/api/children/[childId]`, `/api/children/[childId]/archive`
  - `/api/teachers`, `/api/teachers/[teacherId]`, `/api/teachers/[teacherId]/archive`
  - `/api/messages`, `/api/messages/[messageId]/reply`, `/api/messages/[messageId]/read`
  - `/api/feedback`, `/api/feedback/[feedbackId]`
  - `/api/records`, `/api/records/[recordId]`, `/api/records/[recordId]/archive` with `type=attendance|health|meal|growth`
  - `/api/health-materials`, `/api/health-materials/[materialId]`, `/api/health-materials/[materialId]/parse`
  - `/api/consultations`, `/api/consultations/[consultationId]/notes`, `/api/consultations/[consultationId]/status`
  - `/api/analytics/director-dashboard`, `/api/analytics/admin/summary`, `/api/analytics/trends`, `/api/analytics/teacher-workbench`, `/api/analytics/parent-home`
  - `/api/weekly-reports`, `/api/weekly-reports/[reportId]`, `/api/weekly-reports/[reportId]/archive`, `/api/weekly-reports/[reportId]/export`
  - `/api/attachments`, `/api/attachments/[attachmentId]`
  - `/api/reminders`, `/api/reminders/[reminderId]`
- The original per-domain record paths remain planned compatibility aliases for later page migration. E01 uses the generic `/api/records` service surface as the authorization boundary.

## Minimum Routes

| Route | Methods | Owner | Purpose |
| --- | --- | --- | --- |
| `/api/children` | `GET`, `POST` | E01/E02 | 按 session scope 列表、新建儿童档案 |
| `/api/children/[childId]` | `GET`, `PATCH` | E01/E02 | 查看、编辑儿童档案 |
| `/api/children/[childId]/archive` | `POST` | E02 | 归档、恢复儿童档案 |
| `/api/teachers` | `GET`, `POST` | E02 | 园长教师管理 |
| `/api/teachers/[teacherId]` | `GET`, `PATCH` | E02 | 教师详情、班级绑定、启停 |
| `/api/teachers/[teacherId]/archive` | `POST` | E02 | 软归档/恢复教师 |
| `/api/attendance` | `GET`, `POST`, `PATCH` | E02 | 出勤和状态变更 |
| `/api/children/[childId]/health-records` | `GET`, `POST`, `PATCH` | E02/E08 | 晨检记录 |
| `/api/children/[childId]/meal-records` | `GET`, `POST`, `PATCH` | E02/E08 | 饮食记录 |
| `/api/children/[childId]/growth-records` | `GET`, `POST`, `PATCH` | E02/E08 | 成长记录 |
| `/api/children/[childId]/trend` | `GET` | E03/E09 | 儿童趋势查询 |
| `/api/analytics/admin/summary` | `GET` | E03/E07 | 园长真实聚合 |
| `/api/analytics/admin/quality-metrics` | `GET` | E03/E07 | 质量指标 |
| `/api/weekly-reports` | `GET`, `POST` | E03/E07 | 周报列表和归档 |
| `/api/weekly-reports/[reportId]` | `GET`, `PATCH` | E03 | 周报详情和状态 |
| `/api/weekly-reports/[reportId]/archive` | `POST` | E03 | 周报归档/恢复 |
| `/api/weekly-reports/[reportId]/export` | `GET` | E03 | JSON/HTML/Markdown 导出 |
| `/api/weekly-reports/[reportId]/share` | `POST` | E03 | 站内分享 |
| `/api/feedback/[feedbackId]` | `GET`, `PATCH` | E04 | 反馈详情和处理 |
| `/api/attachments` | `POST` | E04/E05 | 附件元数据保存 |
| `/api/voice-assistant/commands` | `POST` | E06 | 命令规划、权限预检、服务端执行 |

## Error Contract

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | 参数或 JSON 不合法 |
| 401 | `unauthorized` | 未登录 |
| 403 | `forbidden_scope` | session 无权限访问对象 |
| 404 | `not_found` | 授权范围内找不到对象 |
| 409 | `conflict` | 并发、重复、状态冲突 |
| 422 | `needs_confirmation` | 写入类命令缺少确认 token |
| 503 | `provider_unavailable` | provider 不可用且无可用 fallback |
