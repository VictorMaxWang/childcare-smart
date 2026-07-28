# Design Route Map

## Canonical Rules
- 园长端 canonical route 是 `/admin`，不是 `/director`。
- `/mobile`、`/tablet` 不作为业务路由；在 viewport 字段记录。
- Query/hash 状态必须作为独立复刻状态验收：例如 `/teacher/agent?action=communication`、`/parent/agent?child=c-1#feedback`。

## Explicit Current Routes
| Target Route | Current Project Route | Status | Notes |
| --- | --- | --- | --- |
| /login | /login | existing | 登录、注册、示例账号。 |
| /admin | /admin | existing | 园长首页。 |
| /admin/agent | /admin/agent | existing | 园长 AI 助手。 |
| /admin/agent?action=weekly-report | /admin/agent?action=weekly-report | existing query state | 园长周报/运营分析目标。 |
| /admin/teachers | /admin/teachers | existing but underdocumented | 教师管理。 |
| /teacher | /teacher | existing | 教师工作台。 |
| /teacher/agent | /teacher/agent | existing | 教师 AI 助手。 |
| /teacher/health-file-bridge | /teacher/health-file-bridge | existing | 健康材料解析。 |
| /teacher/high-risk-consultation | /teacher/high-risk-consultation | existing | 高风险会诊。 |
| /parent | /parent | existing | 家长首页。 |
| /parent/agent | /parent/agent | existing | 家长 AI 助手。 |
| /parent/storybook | /parent/storybook | existing | 成长绘本。 |
| /parent/reminders | /parent/reminders | existing but underdocumented | 家长提醒。 |
| /children | /children | existing shared | 儿童档案/记录。 |
| /health | /health | existing shared | 健康/晨检。 |
| /growth | /growth | existing shared | 成长行为。 |
| /diet | /diet | existing shared | 饮食记录。 |

## Per-Design Mapping
| Design ID | Target Route | Current Project Route | Has Page | Missing Page | Function Missing | Large UI Diff | Next Task |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SCFR-001-director-ai-assistant-mobile | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-002-mobile-ai-assistant-mobile | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-003-mobile-ai-assistant-mobile | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-004-mobile-ai-assistant-mobile | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-005-teacher-ai-assistant-desktop | /teacher/agent | /teacher/agent | yes | no | needs R05/R06 audit | yes | R30 |
| SCFR-006-shared-ai-assistant-desktop | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-007-teacher-ai-assistant-mobile | /teacher/agent | /teacher/agent | yes | no | needs R05/R06 audit | yes | R30 |
| SCFR-008-parent-ai-assistant-mobile | /parent/agent?child=c-1 | /parent/agent?child=c-1 | yes | no | needs R05/R06 audit | yes | R40 |
| SCFR-009-mobile-ai-assistant-mobile | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-010-director-ai-assistant-desktop | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-011-parent-ai-assistant-mobile | /parent/agent?child=c-1 | /parent/agent?child=c-1 | yes | no | needs R05/R06 audit | yes | R40 |
| SCFR-012-teacher-ai-assistant-mobile | /teacher/agent | /teacher/agent | yes | no | needs R05/R06 audit | yes | R30 |
| SCFR-013-parent-dashboard-tablet-portrait | /parent/storybook?child=c-1 | /parent/storybook?child=c-1 | yes | no | unknown until route audit | yes | R40 |
| SCFR-014-shared-records-profile-desktop | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-015-mobile-ai-assistant-mobile | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-016-mobile-ai-assistant-mobile | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-017-mobile-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-018-mobile-dashboard-mobile | /growth | /growth | yes | no | unknown until route audit | likely | R50 |
| SCFR-019-shared-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-020-director-dashboard-tablet-portrait | /health | /health | yes | no | unknown until route audit | yes | R50 |
| SCFR-021-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-022-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-023-parent-dashboard-tablet-portrait | /parent?child=c-1 | /parent?child=c-1 | yes | no | unknown until route audit | yes | R40 |
| SCFR-024-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-025-mobile-communication-feedback-mobile | /parent/agent?child=c-1#feedback | /parent/agent?child=c-1#feedback | yes | no | unknown until route audit | likely | R40 |
| SCFR-026-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-027-mobile-modal-state-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-028-mobile-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-029-shared-dashboard-tablet-portrait | /growth | /growth | yes | no | unknown until route audit | likely | R50 |
| SCFR-030-mobile-dashboard-mobile | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-031-director-dashboard-tablet-portrait | /health | /health | yes | no | unknown until route audit | yes | R50 |
| SCFR-032-shared-dashboard-desktop | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-033-director-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-034-shared-dashboard-desktop | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-035-director-diet-meal-desktop | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-036-shared-dashboard-desktop | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-037-mobile-dashboard-mobile | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-038-shared-dashboard-desktop | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-039-director-dashboard-desktop | /children | /children | yes | no | unknown until route audit | yes | R50 |
| SCFR-040-director-dashboard-desktop | /children | /children | yes | no | unknown until route audit | yes | R50 |
| SCFR-041-mobile-records-profile-mobile | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-042-mobile-records-profile-mobile | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-043-director-dashboard-desktop | /children | /children | yes | no | unknown until route audit | yes | R50 |
| SCFR-044-director-records-profile-mobile | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-045-director-dashboard-tablet-portrait | /children | /children | yes | no | unknown until route audit | yes | R50 |
| SCFR-046-director-dashboard-mobile | /children | /children | yes | no | unknown until route audit | yes | R50 |
| SCFR-047-shared-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-048-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-049-parent-dashboard-mobile | /parent/storybook?child=c-1 | /parent/storybook?child=c-1 | yes | no | unknown until route audit | yes | R40 |
| SCFR-050-shared-ai-assistant-desktop | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-051-shared-ai-assistant-desktop | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-052-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-053-shared-ai-assistant-desktop | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-054-mobile-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-055-mobile-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-056-mobile-dashboard-mobile | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-057-shared-dashboard-desktop | /parent/agent?child=c-1#feedback | /parent/agent?child=c-1#feedback | yes | no | unknown until route audit | likely | R40 |
| SCFR-058-mobile-ai-assistant-mobile | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-059-director-records-profile-mobile | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-060-mobile-ai-assistant-mobile | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-061-shared-dashboard-desktop | /parent/agent?child=c-1#feedback | /parent/agent?child=c-1#feedback | yes | no | unknown until route audit | likely | R40 |
| SCFR-062-shared-dashboard-desktop | /parent/agent?child=c-1#feedback | /parent/agent?child=c-1#feedback | yes | no | unknown until route audit | likely | R40 |
| SCFR-063-shared-dashboard-tablet-portrait | /parent/agent?child=c-1#feedback | /parent/agent?child=c-1#feedback | yes | no | unknown until route audit | likely | R40 |
| SCFR-064-shared-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-065-mobile-ai-assistant-mobile | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-066-mobile-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-067-shared-dashboard-desktop | /parent/agent?child=c-1#feedback | /parent/agent?child=c-1#feedback | yes | no | unknown until route audit | likely | R40 |
| SCFR-068-shared-dashboard-desktop | /parent/agent?child=c-1#feedback | /parent/agent?child=c-1#feedback | yes | no | unknown until route audit | likely | R40 |
| SCFR-069-director-dashboard-desktop | /growth | /growth | yes | no | unknown until route audit | yes | R50 |
| SCFR-070-shared-dashboard-tablet-portrait | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-071-mobile-dashboard-mobile | /growth | /growth | yes | no | unknown until route audit | likely | R50 |
| SCFR-072-mobile-health-mobile | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-073-mobile-health-mobile | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-074-mobile-health-mobile | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-075-mobile-dashboard-mobile | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-076-director-ai-assistant-mobile | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-077-director-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-078-director-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-079-director-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-080-director-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-081-director-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-082-director-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-083-director-dashboard-desktop | /admin/agent?action=weekly-report | /admin/agent?action=weekly-report | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-084-director-ai-assistant-desktop | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-085-director-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-086-director-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-087-login-auth-login-desktop | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-088-director-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-089-director-modal-state-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-090-director-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-091-director-dashboard-mobile | /diet | /diet | yes | no | unknown until route audit | yes | R50 |
| SCFR-092-director-dashboard-desktop | /children | /children | yes | no | unknown until route audit | yes | R50 |
| SCFR-093-shared-dashboard-desktop | /diet | /diet | yes | no | unknown until route audit | likely | R50 |
| SCFR-094-shared-dashboard-tablet-portrait | /diet | /diet | yes | no | unknown until route audit | likely | R50 |
| SCFR-095-shared-dashboard-tablet-portrait | /diet | /diet | yes | no | unknown until route audit | likely | R50 |
| SCFR-096-mobile-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-097-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-098-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-099-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-100-shared-dashboard-desktop | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-101-shared-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-102-director-diet-meal-desktop | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-103-shared-dashboard-desktop | /parent/agent?child=c-1#feedback | /parent/agent?child=c-1#feedback | yes | no | unknown until route audit | likely | R40 |
| SCFR-104-login-auth-login-desktop | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-105-login-auth-login-desktop | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-106-shared-dashboard-tablet-portrait | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-107-director-dashboard-desktop | /children | /children | yes | no | unknown until route audit | yes | R50 |
| SCFR-108-shared-design-system-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-109-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-110-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-111-mobile-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-112-mobile-records-profile-mobile | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-113-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-114-director-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-115-teacher-dashboard-mobile | /teacher | /teacher | yes | no | unknown until route audit | yes | R30 |
| SCFR-116-teacher-dashboard-mobile | /teacher | /teacher | yes | no | unknown until route audit | yes | R30 |
| SCFR-117-shared-dashboard-desktop | /admin/agent?action=weekly-report | /admin/agent?action=weekly-report | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-118-mobile-dashboard-mobile | /admin/agent?action=weekly-report | /admin/agent?action=weekly-report | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-119-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-120-director-dashboard-desktop | /children | /children | yes | no | unknown until route audit | yes | R50 |
| SCFR-121-director-dashboard-desktop | /children | /children | yes | no | unknown until route audit | yes | R50 |
| SCFR-122-mobile-records-profile-mobile | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-123-mobile-records-profile-mobile | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-124-shared-dashboard-tablet-portrait | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-125-director-dashboard-tablet-portrait | /children | /children | yes | no | unknown until route audit | yes | R50 |
| SCFR-126-director-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-127-teacher-dashboard-desktop | /teacher/health-file-bridge | /teacher/health-file-bridge | yes | no | unknown until route audit | yes | R30 |
| SCFR-128-login-auth-login-desktop | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-129-login-auth-login-desktop | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-130-director-modal-state-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-131-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-132-director-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-133-shared-design-system-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-134-mobile-dashboard-mobile | /parent/agent?child=c-1#feedback | /parent/agent?child=c-1#feedback | yes | no | unknown until route audit | likely | R40 |
| SCFR-135-director-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-136-shared-diet-meal-desktop | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-137-parent-growth-storybook-mobile | /parent/storybook?child=c-1 | /parent/storybook?child=c-1 | yes | no | unknown until route audit | likely | R40 |
| SCFR-138-director-dashboard-desktop | /health | /health | yes | no | unknown until route audit | yes | R50 |
| SCFR-139-shared-dashboard-desktop | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-140-mobile-health-mobile | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-141-director-dashboard-mobile | /health | /health | yes | no | unknown until route audit | yes | R50 |
| SCFR-142-director-dashboard-tablet-portrait | /children | /children | yes | no | unknown until route audit | yes | R50 |
| SCFR-143-shared-dashboard-desktop | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-144-director-dashboard-desktop | /health | /health | yes | no | unknown until route audit | yes | R50 |
| SCFR-145-mobile-dashboard-mobile | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-146-shared-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-147-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-148-shared-ai-assistant-desktop | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-149-shared-dashboard-tablet-portrait | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-150-mobile-dashboard-mobile | /admin/agent?action=weekly-report | /admin/agent?action=weekly-report | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-151-mobile-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-152-director-dashboard-desktop | /children | /children | yes | no | unknown until route audit | yes | R50 |
| SCFR-153-director-diet-meal-desktop | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-154-mobile-health-mobile | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-155-mobile-diet-meal-mobile | /diet | /diet | yes | no | unknown until route audit | likely | R50 |
| SCFR-156-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-157-director-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-158-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-159-login-auth-login-desktop | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-160-login-auth-login-tablet-portrait | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-161-login-auth-login-tablet-portrait | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-162-login-auth-login-desktop | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-163-shared-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-164-director-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-165-login-auth-login-desktop | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-166-login-auth-login-desktop | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-167-login-auth-login-desktop | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-168-shared-communication-feedback-desktop | /parent/agent?child=c-1#feedback | /parent/agent?child=c-1#feedback | yes | no | unknown until route audit | likely | R40 |
| SCFR-169-login-auth-login-desktop | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-170-mobile-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-171-login-auth-login-mobile | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-172-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-173-shared-dashboard-desktop | /admin/agent?action=weekly-report | /admin/agent?action=weekly-report | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-174-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-175-login-auth-login-tablet-portrait | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-176-login-auth-login-desktop | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-177-director-dashboard-tablet-portrait | /health | /health | yes | no | unknown until route audit | yes | R50 |
| SCFR-178-shared-dashboard-desktop | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-179-shared-ai-assistant-desktop | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-180-parent-communication-feedback-mobile | /parent/agent?child=c-1#feedback | /parent/agent?child=c-1#feedback | yes | no | unknown until route audit | likely | R40 |
| SCFR-181-teacher-communication-feedback-mobile | /teacher/agent?action=communication | /teacher/agent?action=communication | yes | no | unknown until route audit | likely | R30 |
| SCFR-182-parent-dashboard-desktop | /parent?child=c-1 | /parent?child=c-1 | yes | no | unknown until route audit | yes | R40 |
| SCFR-183-parent-ai-assistant-desktop | /parent/agent?child=c-1 | /parent/agent?child=c-1 | yes | no | needs R05/R06 audit | yes | R40 |
| SCFR-184-parent-growth-storybook-mobile | /parent/storybook?child=c-1 | /parent/storybook?child=c-1 | yes | no | unknown until route audit | likely | R40 |
| SCFR-185-parent-dashboard-mobile | /parent?child=c-1 | /parent?child=c-1 | yes | no | unknown until route audit | yes | R40 |
| SCFR-186-parent-dashboard-tablet-portrait | /parent/storybook?child=c-1 | /parent/storybook?child=c-1 | yes | no | unknown until route audit | yes | R40 |
| SCFR-187-parent-dashboard-tablet-portrait | /parent/storybook?child=c-1 | /parent/storybook?child=c-1 | yes | no | unknown until route audit | yes | R40 |
| SCFR-188-parent-dashboard-desktop | /parent/storybook?child=c-1 | /parent/storybook?child=c-1 | yes | no | unknown until route audit | yes | R40 |
| SCFR-189-mobile-dashboard-mobile | /admin/agent?action=weekly-report | /admin/agent?action=weekly-report | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-190-mobile-modal-state-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-191-mobile-modal-state-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-192-mobile-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-193-login-auth-login-desktop | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-194-director-dashboard-desktop | /children | /children | yes | no | unknown until route audit | yes | R50 |
| SCFR-195-shared-dashboard-desktop | /children | /children | yes | no | unknown until route audit | likely | R50 |
| SCFR-196-shared-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-197-shared-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-198-mobile-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-199-mobile-ai-assistant-mobile | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-200-shared-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-201-mobile-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-202-shared-dashboard-desktop | /parent/agent?child=c-1#feedback | /parent/agent?child=c-1#feedback | yes | no | unknown until route audit | likely | R40 |
| SCFR-203-shared-dashboard-tablet-portrait | /parent/agent?child=c-1#feedback | /parent/agent?child=c-1#feedback | yes | no | unknown until route audit | likely | R40 |
| SCFR-204-shared-dashboard-tablet-portrait | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-205-director-dashboard-desktop | /health | /health | yes | no | unknown until route audit | yes | R50 |
| SCFR-206-shared-dashboard-desktop | /health | /health | yes | no | unknown until route audit | likely | R50 |
| SCFR-207-director-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-208-director-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-209-director-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-210-director-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-211-shared-dashboard-desktop | /diet | /diet | yes | no | unknown until route audit | likely | R50 |
| SCFR-212-shared-dashboard-desktop | /diet | /diet | yes | no | unknown until route audit | likely | R50 |
| SCFR-213-director-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-214-shared-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-215-shared-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-216-shared-dashboard-tablet-portrait | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-217-mobile-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-218-mobile-dashboard-mobile | /admin | /admin | yes | no | unknown until route audit | likely | R20 |
| SCFR-219-login-auth-login-desktop | /login | /login | yes | no | unknown until route audit | yes | R10 |
| SCFR-220-mobile-dashboard-mobile | /admin/agent?action=weekly-report | /admin/agent?action=weekly-report | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-221-shared-ai-assistant-tablet-portrait | /admin/agent | /admin/agent | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-222-director-dashboard-desktop | /admin | /admin | yes | no | unknown until route audit | yes | R20 |
| SCFR-223-shared-dashboard-tablet-portrait | /growth | /growth | yes | no | unknown until route audit | likely | R50 |
| SCFR-224-teacher-dashboard-mobile | /teacher | /teacher | yes | no | unknown until route audit | yes | R30 |
| SCFR-225-teacher-dashboard-tablet-portrait | /teacher | /teacher | yes | no | unknown until route audit | yes | R30 |
| SCFR-226-parent-dashboard-mobile | /parent?child=c-1 | /parent?child=c-1 | yes | no | unknown until route audit | yes | R40 |
| SCFR-227-teacher-ai-assistant-tablet-portrait | /teacher/agent | /teacher/agent | yes | no | needs R05/R06 audit | yes | R30 |
| SCFR-228-teacher-ai-assistant-mobile | /teacher/agent | /teacher/agent | yes | no | needs R05/R06 audit | yes | R30 |
| SCFR-229-teacher-dashboard-mobile | /teacher/health-file-bridge | /teacher/health-file-bridge | yes | no | unknown until route audit | yes | R30 |
| SCFR-230-teacher-ai-assistant-tablet-portrait | /teacher/agent | /teacher/agent | yes | no | needs R05/R06 audit | yes | R30 |
| SCFR-231-teacher-dashboard-tablet-portrait | /teacher | /teacher | yes | no | unknown until route audit | yes | R30 |
| SCFR-232-teacher-dashboard-tablet-portrait | /teacher | /teacher | yes | no | unknown until route audit | yes | R30 |
| SCFR-233-teacher-dashboard-mobile | /teacher | /teacher | yes | no | unknown until route audit | yes | R30 |
| SCFR-234-teacher-dashboard-mobile | /teacher | /teacher | yes | no | unknown until route audit | yes | R30 |
| SCFR-235-teacher-ai-assistant-tablet-portrait | /teacher/agent | /teacher/agent | yes | no | needs R05/R06 audit | yes | R30 |
| SCFR-236-teacher-dashboard-desktop | /teacher | /teacher | yes | no | unknown until route audit | yes | R30 |
| SCFR-237-teacher-dashboard-tablet-portrait | /teacher/health-file-bridge | /teacher/health-file-bridge | yes | no | unknown until route audit | yes | R30 |
| SCFR-238-teacher-dashboard-desktop | /teacher/agent?action=communication | /teacher/agent?action=communication | yes | no | unknown until route audit | yes | R30 |
| SCFR-239-teacher-dashboard-mobile | /teacher/agent?action=communication | /teacher/agent?action=communication | yes | no | unknown until route audit | yes | R30 |
| SCFR-240-teacher-dashboard-tablet-portrait | /teacher/agent?action=communication | /teacher/agent?action=communication | yes | no | unknown until route audit | yes | R30 |
| SCFR-241-teacher-ai-assistant-mobile | /teacher/agent | /teacher/agent | yes | no | needs R05/R06 audit | yes | R30 |
| SCFR-242-teacher-dashboard-mobile | /teacher | /teacher | yes | no | unknown until route audit | yes | R30 |
| SCFR-243-teacher-dashboard-desktop | /teacher | /teacher | yes | no | unknown until route audit | yes | R30 |
| SCFR-244-teacher-dashboard-desktop | /teacher | /teacher | yes | no | unknown until route audit | yes | R30 |
| SCFR-245-parent-communication-feedback-mobile | /parent/agent?child=c-1#feedback | /parent/agent?child=c-1#feedback | yes | no | unknown until route audit | likely | R40 |
| SCFR-246-director-dashboard-mobile | /admin/agent?action=weekly-report | /admin/agent?action=weekly-report | yes | no | needs R05/R06 audit | yes | R20 |
| SCFR-247-director-charts-reports-tablet-portrait | /admin/agent?action=weekly-report | /admin/agent?action=weekly-report | yes | no | needs R05/R06 audit | yes | R20 |
