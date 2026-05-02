# Server Scope Spec

## Session Source Of Truth

服务端权限只从 `getCurrentSessionUser()` 和服务端数据关系推导。客户端传入的 `role`、`institutionId`、`className`、`childIds` 只能作为显示或过滤请求参数，不能作为授权依据。

## E01 Implementation Notes - 2026-05-02

- Implemented `resolveRequestSession(request)`, `requireSession(request)`, and `requireDemoSession(request)` in `lib/server/session.ts`.
- Session resolution order is cookie session first, then `x-demo-account-id` fallback. The fallback maps only to known demo accounts and does not accept client-supplied role, institution, class, child, or teacher scope.
- Implemented scope helpers in `lib/server/scope.ts`:
  - `canAccessChild` / `requireChildAccess`
  - `canAccessClass` / `requireClassAccess`
  - `canAccessTeacher` / `requireTeacherAccess`
  - `canManageDirectorResource` / `requireDirector`
  - `canModifyRecord` / `requireRecordModifyAccess`
  - `canViewFeedback` / `requireFeedbackViewAccess`
  - `canReplyConversation` / `requireConversationReplyAccess`
- Director access is limited to matching `institutionId`.
- Teacher access is limited to matching `institutionId` and the teacher's own `className` for child/class resources.
- Parent access is limited to owned children via `childIds[]` or `parentUserId === session.id`; parent child ownership does not grant class-level scope.
- Target object checks load the existing resource first, then validate the real `childId`, class, teacher, or report scope relationship.
- New E01 API routes return 401 for missing session and 403 for denied scope using the shared error envelope.

## Required Guards

| Guard | Allowed | Deny |
| --- | --- | --- |
| `requireSession()` | 登录用户 | 未登录返回 401 |
| `requireAdmin()` | `role === 机构管理员` 且同机构 | 非园长返回 403 |
| `requireTeacherClassAccess(childId)` | 教师同机构、同班级 child | 非本班或不存在返回 403/404 |
| `requireParentChildAccess(childId)` | 家长授权 childId 或 parentUserId 命中 | 非绑定 child 返回 403 |
| `requireChildAccess(childId, operation)` | 园长同机构、教师同班、家长本人孩子 | 越权返回 403 |
| `requireReportAccess(reportId)` | 按 `scopeType/scopeId` 校验 | 越权返回 403 |

## Scope Rules

- 园长：只能访问同 `institutionId` 全园数据。
- 教师：只能访问同 `institutionId` 且同 `className` 或后续 `classId` 的孩子和记录。
- 家长：优先按 `childIds[]`，否则按 `parentUserId === user.id`，且必须同机构。
- 所有 child-scoped 写入必须带 `childId`，并由服务端验证。
- 写回时不得覆盖未授权范围；必须用 read-modify-write 或细粒度 repository。

## Audit Fields

写入、归档、恢复、导出、分享、派单必须记录：

- `actorUserId`
- `actorRole`
- `institutionId`
- `targetType`
- `targetId`
- `action`
- `result`
- `createdAt`
