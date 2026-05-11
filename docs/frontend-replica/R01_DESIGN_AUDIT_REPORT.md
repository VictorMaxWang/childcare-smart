# R01 Design Audit Report

## Summary
- Task: FRONTEND-REPLICA-R01
- Status: done
- Design files audited: 247
- Page specs generated: 247
- Chart targets: 174
- AI assistant targets: 32
- Modal/drawer/state targets: 13
- Design root: `../前端重构`

## Coverage

### By Priority
| Priority | Count |
| --- | --- |
| P0 | 131 |
| P1 | 61 |
| P2 | 55 |

### By Normalized Role
| Role | Count |
| --- | --- |
| director | 90 |
| login | 18 |
| parent | 18 |
| shared | 94 |
| teacher | 27 |

### By Original Role
| Original role | Count |
| --- | --- |
| director | 59 |
| login | 18 |
| mobile | 51 |
| parent | 16 |
| shared | 76 |
| teacher | 27 |

### By Viewport
| Viewport | Count |
| --- | --- |
| desktop 1448x1086 | 109 |
| mobile 941x1672 | 87 |
| tablet/portrait 1086x1448 | 51 |

### By Owner Task
| Task | Count |
| --- | --- |
| R10 | 18 |
| R20 | 105 |
| R30 | 27 |
| R40 | 28 |
| R50 | 69 |

### By Route
| Route | Count |
| --- | --- |
| /admin | 75 |
| /admin/agent | 30 |
| /children | 35 |
| /diet | 7 |
| /growth | 5 |
| /health | 22 |
| /login | 18 |
| /parent | 4 |
| /parent/agent | 17 |
| /parent/storybook | 7 |
| /teacher | 12 |
| /teacher/agent | 12 |
| /teacher/health-file-bridge | 3 |

## High Priority Gaps
- P0 route/query/hash states must be audited independently, especially weekly-report, communication, feedback, modal, permission, locked, empty, and loading states.
- P0 visual shell/layout/card/chart/assistant gaps remain across admin, teacher, parent, and shared routes.
- AI assistant surfaces must call server-side vivo provider or show explicit unavailable/degraded state; no fake success.
- Charts must bind existing demo/API/selector data and include tooltip, legend, empty, loading, and error states.
- Mobile/tablet viewport specs need separate acceptance from desktop; 941x1672 and 1086x1448 references are not routes.

## Corrected Source Paths
- None.

## Known Path Risk Verification
| Risk | Design ID | Verified actual path | Status |
| --- | --- | --- | --- |
| teacher_workspace_dashboard_for_daycare绠＄悊.png should resolve to teacher_workspace_dashboard_for_daycare管理.png | SCFR-244-teacher-dashboard-desktop | smartchildcare_images_part_08_of_08/images/teacher_workspace_dashboard_for_daycare管理.png | verified |
| 鏅烘収...png should resolve to 智慧托育平台运营报表分析界面.png | SCFR-247-director-charts-reports-tablet-portrait | smartchildcare_images_part_08_of_08/images/智慧托育平台运营报表分析界面.png | verified |

## Page Spec Index

| Design ID | Role | Route | Viewport | Charts | AI | State | Spec |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SCFR-001-director-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | yes | yes | no | PAGE_SPECS/SCFR-001-director-ai-assistant-mobile.md |
| SCFR-002-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | yes | yes | no | PAGE_SPECS/SCFR-002-mobile-ai-assistant-mobile.md |
| SCFR-003-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | yes | yes | no | PAGE_SPECS/SCFR-003-mobile-ai-assistant-mobile.md |
| SCFR-004-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | no | yes | no | PAGE_SPECS/SCFR-004-mobile-ai-assistant-mobile.md |
| SCFR-005-teacher-ai-assistant-desktop | teacher | /teacher/agent | desktop 1448x1086 | yes | yes | no | PAGE_SPECS/SCFR-005-teacher-ai-assistant-desktop.md |
| SCFR-006-shared-ai-assistant-desktop | shared | /admin/agent | desktop 1448x1086 | no | yes | no | PAGE_SPECS/SCFR-006-shared-ai-assistant-desktop.md |
| SCFR-007-teacher-ai-assistant-mobile | teacher | /teacher/agent | mobile 941x1672 | yes | yes | no | PAGE_SPECS/SCFR-007-teacher-ai-assistant-mobile.md |
| SCFR-008-parent-ai-assistant-mobile | parent | /parent/agent?child=c-1 | mobile 941x1672 | yes | yes | no | PAGE_SPECS/SCFR-008-parent-ai-assistant-mobile.md |
| SCFR-009-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | yes | yes | no | PAGE_SPECS/SCFR-009-mobile-ai-assistant-mobile.md |
| SCFR-010-director-ai-assistant-desktop | director | /admin/agent | desktop 1448x1086 | yes | yes | no | PAGE_SPECS/SCFR-010-director-ai-assistant-desktop.md |
| SCFR-011-parent-ai-assistant-mobile | parent | /parent/agent?child=c-1 | mobile 941x1672 | no | yes | no | PAGE_SPECS/SCFR-011-parent-ai-assistant-mobile.md |
| SCFR-012-teacher-ai-assistant-mobile | teacher | /teacher/agent | mobile 941x1672 | yes | yes | no | PAGE_SPECS/SCFR-012-teacher-ai-assistant-mobile.md |
| SCFR-013-parent-dashboard-tablet-portrait | parent | /parent/storybook?child=c-1 | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-013-parent-dashboard-tablet-portrait.md |
| SCFR-014-shared-records-profile-desktop | shared | /children | desktop 1448x1086 | no | no | yes | PAGE_SPECS/SCFR-014-shared-records-profile-desktop.md |
| SCFR-015-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | no | yes | no | PAGE_SPECS/SCFR-015-mobile-ai-assistant-mobile.md |
| SCFR-016-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | no | yes | no | PAGE_SPECS/SCFR-016-mobile-ai-assistant-mobile.md |
| SCFR-017-mobile-dashboard-mobile | director | /admin | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-017-mobile-dashboard-mobile.md |
| SCFR-018-mobile-dashboard-mobile | shared | /growth | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-018-mobile-dashboard-mobile.md |
| SCFR-019-shared-dashboard-tablet-portrait | shared | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-019-shared-dashboard-tablet-portrait.md |
| SCFR-020-director-dashboard-tablet-portrait | director | /health | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-020-director-dashboard-tablet-portrait.md |
| SCFR-021-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-021-shared-dashboard-desktop.md |
| SCFR-022-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | yes | PAGE_SPECS/SCFR-022-shared-dashboard-desktop.md |
| SCFR-023-parent-dashboard-tablet-portrait | parent | /parent?child=c-1 | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-023-parent-dashboard-tablet-portrait.md |
| SCFR-024-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-024-shared-dashboard-desktop.md |
| SCFR-025-mobile-communication-feedback-mobile | parent | /parent/agent?child=c-1#feedback | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-025-mobile-communication-feedback-mobile.md |
| SCFR-026-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-026-shared-dashboard-desktop.md |
| SCFR-027-mobile-modal-state-mobile | director | /admin | mobile 941x1672 | no | no | yes | PAGE_SPECS/SCFR-027-mobile-modal-state-mobile.md |
| SCFR-028-mobile-dashboard-mobile | director | /admin | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-028-mobile-dashboard-mobile.md |
| SCFR-029-shared-dashboard-tablet-portrait | shared | /growth | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-029-shared-dashboard-tablet-portrait.md |
| SCFR-030-mobile-dashboard-mobile | shared | /health | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-030-mobile-dashboard-mobile.md |
| SCFR-031-director-dashboard-tablet-portrait | director | /health | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-031-director-dashboard-tablet-portrait.md |
| SCFR-032-shared-dashboard-desktop | shared | /health | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-032-shared-dashboard-desktop.md |
| SCFR-033-director-dashboard-desktop | director | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-033-director-dashboard-desktop.md |
| SCFR-034-shared-dashboard-desktop | shared | /children | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-034-shared-dashboard-desktop.md |
| SCFR-035-director-diet-meal-desktop | director | /children | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-035-director-diet-meal-desktop.md |
| SCFR-036-shared-dashboard-desktop | shared | /children | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-036-shared-dashboard-desktop.md |
| SCFR-037-mobile-dashboard-mobile | shared | /children | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-037-mobile-dashboard-mobile.md |
| SCFR-038-shared-dashboard-desktop | shared | /children | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-038-shared-dashboard-desktop.md |
| SCFR-039-director-dashboard-desktop | director | /children | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-039-director-dashboard-desktop.md |
| SCFR-040-director-dashboard-desktop | director | /children | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-040-director-dashboard-desktop.md |
| SCFR-041-mobile-records-profile-mobile | shared | /children | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-041-mobile-records-profile-mobile.md |
| SCFR-042-mobile-records-profile-mobile | shared | /children | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-042-mobile-records-profile-mobile.md |
| SCFR-043-director-dashboard-desktop | director | /children | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-043-director-dashboard-desktop.md |
| SCFR-044-director-records-profile-mobile | director | /children | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-044-director-records-profile-mobile.md |
| SCFR-045-director-dashboard-tablet-portrait | director | /children | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-045-director-dashboard-tablet-portrait.md |
| SCFR-046-director-dashboard-mobile | director | /children | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-046-director-dashboard-mobile.md |
| SCFR-047-shared-dashboard-tablet-portrait | shared | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-047-shared-dashboard-tablet-portrait.md |
| SCFR-048-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-048-shared-dashboard-desktop.md |
| SCFR-049-parent-dashboard-mobile | parent | /parent/storybook?child=c-1 | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-049-parent-dashboard-mobile.md |
| SCFR-050-shared-ai-assistant-desktop | shared | /admin/agent | desktop 1448x1086 | yes | yes | no | PAGE_SPECS/SCFR-050-shared-ai-assistant-desktop.md |
| SCFR-051-shared-ai-assistant-desktop | shared | /admin/agent | desktop 1448x1086 | yes | yes | no | PAGE_SPECS/SCFR-051-shared-ai-assistant-desktop.md |
| SCFR-052-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-052-shared-dashboard-desktop.md |
| SCFR-053-shared-ai-assistant-desktop | shared | /admin/agent | desktop 1448x1086 | yes | yes | no | PAGE_SPECS/SCFR-053-shared-ai-assistant-desktop.md |
| SCFR-054-mobile-dashboard-mobile | director | /admin | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-054-mobile-dashboard-mobile.md |
| SCFR-055-mobile-dashboard-mobile | director | /admin | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-055-mobile-dashboard-mobile.md |
| SCFR-056-mobile-dashboard-mobile | shared | /children | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-056-mobile-dashboard-mobile.md |
| SCFR-057-shared-dashboard-desktop | shared | /parent/agent?child=c-1#feedback | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-057-shared-dashboard-desktop.md |
| SCFR-058-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | no | yes | no | PAGE_SPECS/SCFR-058-mobile-ai-assistant-mobile.md |
| SCFR-059-director-records-profile-mobile | director | /children | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-059-director-records-profile-mobile.md |
| SCFR-060-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | no | yes | no | PAGE_SPECS/SCFR-060-mobile-ai-assistant-mobile.md |
| SCFR-061-shared-dashboard-desktop | shared | /parent/agent?child=c-1#feedback | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-061-shared-dashboard-desktop.md |
| SCFR-062-shared-dashboard-desktop | shared | /parent/agent?child=c-1#feedback | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-062-shared-dashboard-desktop.md |
| SCFR-063-shared-dashboard-tablet-portrait | shared | /parent/agent?child=c-1#feedback | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-063-shared-dashboard-tablet-portrait.md |
| SCFR-064-shared-dashboard-tablet-portrait | shared | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-064-shared-dashboard-tablet-portrait.md |
| SCFR-065-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | yes | yes | no | PAGE_SPECS/SCFR-065-mobile-ai-assistant-mobile.md |
| SCFR-066-mobile-dashboard-mobile | director | /admin | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-066-mobile-dashboard-mobile.md |
| SCFR-067-shared-dashboard-desktop | shared | /parent/agent?child=c-1#feedback | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-067-shared-dashboard-desktop.md |
| SCFR-068-shared-dashboard-desktop | shared | /parent/agent?child=c-1#feedback | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-068-shared-dashboard-desktop.md |
| SCFR-069-director-dashboard-desktop | director | /growth | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-069-director-dashboard-desktop.md |
| SCFR-070-shared-dashboard-tablet-portrait | shared | /children | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-070-shared-dashboard-tablet-portrait.md |
| SCFR-071-mobile-dashboard-mobile | shared | /growth | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-071-mobile-dashboard-mobile.md |
| SCFR-072-mobile-health-mobile | shared | /health | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-072-mobile-health-mobile.md |
| SCFR-073-mobile-health-mobile | shared | /health | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-073-mobile-health-mobile.md |
| SCFR-074-mobile-health-mobile | shared | /health | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-074-mobile-health-mobile.md |
| SCFR-075-mobile-dashboard-mobile | shared | /health | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-075-mobile-dashboard-mobile.md |
| SCFR-076-director-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | yes | yes | no | PAGE_SPECS/SCFR-076-director-ai-assistant-mobile.md |
| SCFR-077-director-dashboard-mobile | director | /admin | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-077-director-dashboard-mobile.md |
| SCFR-078-director-dashboard-mobile | director | /admin | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-078-director-dashboard-mobile.md |
| SCFR-079-director-dashboard-mobile | director | /admin | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-079-director-dashboard-mobile.md |
| SCFR-080-director-dashboard-desktop | director | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-080-director-dashboard-desktop.md |
| SCFR-081-director-dashboard-tablet-portrait | director | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-081-director-dashboard-tablet-portrait.md |
| SCFR-082-director-dashboard-desktop | director | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-082-director-dashboard-desktop.md |
| SCFR-083-director-dashboard-desktop | director | /admin/agent?action=weekly-report | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-083-director-dashboard-desktop.md |
| SCFR-084-director-ai-assistant-desktop | director | /admin/agent | desktop 1448x1086 | yes | yes | no | PAGE_SPECS/SCFR-084-director-ai-assistant-desktop.md |
| SCFR-085-director-dashboard-desktop | director | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-085-director-dashboard-desktop.md |
| SCFR-086-director-dashboard-desktop | director | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-086-director-dashboard-desktop.md |
| SCFR-087-login-auth-login-desktop | login | /login | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-087-login-auth-login-desktop.md |
| SCFR-088-director-dashboard-tablet-portrait | director | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-088-director-dashboard-tablet-portrait.md |
| SCFR-089-director-modal-state-desktop | director | /admin | desktop 1448x1086 | no | no | yes | PAGE_SPECS/SCFR-089-director-modal-state-desktop.md |
| SCFR-090-director-dashboard-desktop | director | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-090-director-dashboard-desktop.md |
| SCFR-091-director-dashboard-mobile | director | /diet | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-091-director-dashboard-mobile.md |
| SCFR-092-director-dashboard-desktop | director | /children | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-092-director-dashboard-desktop.md |
| SCFR-093-shared-dashboard-desktop | shared | /diet | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-093-shared-dashboard-desktop.md |
| SCFR-094-shared-dashboard-tablet-portrait | shared | /diet | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-094-shared-dashboard-tablet-portrait.md |
| SCFR-095-shared-dashboard-tablet-portrait | shared | /diet | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-095-shared-dashboard-tablet-portrait.md |
| SCFR-096-mobile-dashboard-mobile | director | /admin | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-096-mobile-dashboard-mobile.md |
| SCFR-097-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-097-shared-dashboard-desktop.md |
| SCFR-098-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-098-shared-dashboard-desktop.md |
| SCFR-099-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-099-shared-dashboard-desktop.md |
| SCFR-100-shared-dashboard-desktop | shared | /children | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-100-shared-dashboard-desktop.md |
| SCFR-101-shared-dashboard-tablet-portrait | shared | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-101-shared-dashboard-tablet-portrait.md |
| SCFR-102-director-diet-meal-desktop | director | /children | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-102-director-diet-meal-desktop.md |
| SCFR-103-shared-dashboard-desktop | shared | /parent/agent?child=c-1#feedback | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-103-shared-dashboard-desktop.md |
| SCFR-104-login-auth-login-desktop | login | /login | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-104-login-auth-login-desktop.md |
| SCFR-105-login-auth-login-desktop | login | /login | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-105-login-auth-login-desktop.md |
| SCFR-106-shared-dashboard-tablet-portrait | shared | /children | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-106-shared-dashboard-tablet-portrait.md |
| SCFR-107-director-dashboard-desktop | director | /children | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-107-director-dashboard-desktop.md |
| SCFR-108-shared-design-system-desktop | shared | /admin | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-108-shared-design-system-desktop.md |
| SCFR-109-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-109-shared-dashboard-desktop.md |
| SCFR-110-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-110-shared-dashboard-desktop.md |
| SCFR-111-mobile-dashboard-mobile | director | /admin | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-111-mobile-dashboard-mobile.md |
| SCFR-112-mobile-records-profile-mobile | shared | /children | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-112-mobile-records-profile-mobile.md |
| SCFR-113-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-113-shared-dashboard-desktop.md |
| SCFR-114-director-dashboard-tablet-portrait | director | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-114-director-dashboard-tablet-portrait.md |
| SCFR-115-teacher-dashboard-mobile | teacher | /teacher | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-115-teacher-dashboard-mobile.md |
| SCFR-116-teacher-dashboard-mobile | teacher | /teacher | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-116-teacher-dashboard-mobile.md |
| SCFR-117-shared-dashboard-desktop | shared | /admin/agent?action=weekly-report | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-117-shared-dashboard-desktop.md |
| SCFR-118-mobile-dashboard-mobile | director | /admin/agent?action=weekly-report | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-118-mobile-dashboard-mobile.md |
| SCFR-119-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-119-shared-dashboard-desktop.md |
| SCFR-120-director-dashboard-desktop | director | /children | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-120-director-dashboard-desktop.md |
| SCFR-121-director-dashboard-desktop | director | /children | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-121-director-dashboard-desktop.md |
| SCFR-122-mobile-records-profile-mobile | shared | /children | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-122-mobile-records-profile-mobile.md |
| SCFR-123-mobile-records-profile-mobile | shared | /children | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-123-mobile-records-profile-mobile.md |
| SCFR-124-shared-dashboard-tablet-portrait | shared | /children | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-124-shared-dashboard-tablet-portrait.md |
| SCFR-125-director-dashboard-tablet-portrait | director | /children | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-125-director-dashboard-tablet-portrait.md |
| SCFR-126-director-dashboard-tablet-portrait | director | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-126-director-dashboard-tablet-portrait.md |
| SCFR-127-teacher-dashboard-desktop | teacher | /teacher/health-file-bridge | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-127-teacher-dashboard-desktop.md |
| SCFR-128-login-auth-login-desktop | login | /login | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-128-login-auth-login-desktop.md |
| SCFR-129-login-auth-login-desktop | login | /login | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-129-login-auth-login-desktop.md |
| SCFR-130-director-modal-state-desktop | director | /admin | desktop 1448x1086 | no | no | yes | PAGE_SPECS/SCFR-130-director-modal-state-desktop.md |
| SCFR-131-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | yes | PAGE_SPECS/SCFR-131-shared-dashboard-desktop.md |
| SCFR-132-director-dashboard-mobile | director | /admin | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-132-director-dashboard-mobile.md |
| SCFR-133-shared-design-system-desktop | shared | /admin | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-133-shared-design-system-desktop.md |
| SCFR-134-mobile-dashboard-mobile | parent | /parent/agent?child=c-1#feedback | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-134-mobile-dashboard-mobile.md |
| SCFR-135-director-dashboard-tablet-portrait | director | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-135-director-dashboard-tablet-portrait.md |
| SCFR-136-shared-diet-meal-desktop | shared | /children | desktop 1448x1086 | no | no | yes | PAGE_SPECS/SCFR-136-shared-diet-meal-desktop.md |
| SCFR-137-parent-growth-storybook-mobile | parent | /parent/storybook?child=c-1 | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-137-parent-growth-storybook-mobile.md |
| SCFR-138-director-dashboard-desktop | director | /health | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-138-director-dashboard-desktop.md |
| SCFR-139-shared-dashboard-desktop | shared | /health | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-139-shared-dashboard-desktop.md |
| SCFR-140-mobile-health-mobile | shared | /health | mobile 941x1672 | no | no | yes | PAGE_SPECS/SCFR-140-mobile-health-mobile.md |
| SCFR-141-director-dashboard-mobile | director | /health | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-141-director-dashboard-mobile.md |
| SCFR-142-director-dashboard-tablet-portrait | director | /children | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-142-director-dashboard-tablet-portrait.md |
| SCFR-143-shared-dashboard-desktop | shared | /health | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-143-shared-dashboard-desktop.md |
| SCFR-144-director-dashboard-desktop | director | /health | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-144-director-dashboard-desktop.md |
| SCFR-145-mobile-dashboard-mobile | shared | /health | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-145-mobile-dashboard-mobile.md |
| SCFR-146-shared-dashboard-tablet-portrait | shared | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-146-shared-dashboard-tablet-portrait.md |
| SCFR-147-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-147-shared-dashboard-desktop.md |
| SCFR-148-shared-ai-assistant-desktop | shared | /admin/agent | desktop 1448x1086 | yes | yes | no | PAGE_SPECS/SCFR-148-shared-ai-assistant-desktop.md |
| SCFR-149-shared-dashboard-tablet-portrait | shared | /health | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-149-shared-dashboard-tablet-portrait.md |
| SCFR-150-mobile-dashboard-mobile | director | /admin/agent?action=weekly-report | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-150-mobile-dashboard-mobile.md |
| SCFR-151-mobile-dashboard-mobile | director | /admin | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-151-mobile-dashboard-mobile.md |
| SCFR-152-director-dashboard-desktop | director | /children | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-152-director-dashboard-desktop.md |
| SCFR-153-director-diet-meal-desktop | director | /children | desktop 1448x1086 | no | no | yes | PAGE_SPECS/SCFR-153-director-diet-meal-desktop.md |
| SCFR-154-mobile-health-mobile | shared | /health | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-154-mobile-health-mobile.md |
| SCFR-155-mobile-diet-meal-mobile | shared | /diet | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-155-mobile-diet-meal-mobile.md |
| SCFR-156-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-156-shared-dashboard-desktop.md |
| SCFR-157-director-dashboard-desktop | director | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-157-director-dashboard-desktop.md |
| SCFR-158-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-158-shared-dashboard-desktop.md |
| SCFR-159-login-auth-login-desktop | login | /login | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-159-login-auth-login-desktop.md |
| SCFR-160-login-auth-login-tablet-portrait | login | /login | tablet/portrait 1086x1448 | no | no | no | PAGE_SPECS/SCFR-160-login-auth-login-tablet-portrait.md |
| SCFR-161-login-auth-login-tablet-portrait | login | /login | tablet/portrait 1086x1448 | no | no | no | PAGE_SPECS/SCFR-161-login-auth-login-tablet-portrait.md |
| SCFR-162-login-auth-login-desktop | login | /login | desktop 1448x1086 | no | no | yes | PAGE_SPECS/SCFR-162-login-auth-login-desktop.md |
| SCFR-163-shared-dashboard-tablet-portrait | shared | /admin | tablet/portrait 1086x1448 | no | no | no | PAGE_SPECS/SCFR-163-shared-dashboard-tablet-portrait.md |
| SCFR-164-director-dashboard-tablet-portrait | director | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-164-director-dashboard-tablet-portrait.md |
| SCFR-165-login-auth-login-desktop | login | /login | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-165-login-auth-login-desktop.md |
| SCFR-166-login-auth-login-desktop | login | /login | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-166-login-auth-login-desktop.md |
| SCFR-167-login-auth-login-desktop | login | /login | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-167-login-auth-login-desktop.md |
| SCFR-168-shared-communication-feedback-desktop | shared | /parent/agent?child=c-1#feedback | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-168-shared-communication-feedback-desktop.md |
| SCFR-169-login-auth-login-desktop | login | /login | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-169-login-auth-login-desktop.md |
| SCFR-170-mobile-dashboard-mobile | director | /admin | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-170-mobile-dashboard-mobile.md |
| SCFR-171-login-auth-login-mobile | login | /login | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-171-login-auth-login-mobile.md |
| SCFR-172-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-172-shared-dashboard-desktop.md |
| SCFR-173-shared-dashboard-desktop | shared | /admin/agent?action=weekly-report | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-173-shared-dashboard-desktop.md |
| SCFR-174-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-174-shared-dashboard-desktop.md |
| SCFR-175-login-auth-login-tablet-portrait | login | /login | tablet/portrait 1086x1448 | no | no | no | PAGE_SPECS/SCFR-175-login-auth-login-tablet-portrait.md |
| SCFR-176-login-auth-login-desktop | login | /login | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-176-login-auth-login-desktop.md |
| SCFR-177-director-dashboard-tablet-portrait | director | /health | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-177-director-dashboard-tablet-portrait.md |
| SCFR-178-shared-dashboard-desktop | shared | /health | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-178-shared-dashboard-desktop.md |
| SCFR-179-shared-ai-assistant-desktop | shared | /admin/agent | desktop 1448x1086 | yes | yes | no | PAGE_SPECS/SCFR-179-shared-ai-assistant-desktop.md |
| SCFR-180-parent-communication-feedback-mobile | parent | /parent/agent?child=c-1#feedback | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-180-parent-communication-feedback-mobile.md |
| SCFR-181-teacher-communication-feedback-mobile | teacher | /teacher/agent?action=communication | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-181-teacher-communication-feedback-mobile.md |
| SCFR-182-parent-dashboard-desktop | parent | /parent?child=c-1 | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-182-parent-dashboard-desktop.md |
| SCFR-183-parent-ai-assistant-desktop | parent | /parent/agent?child=c-1 | desktop 1448x1086 | yes | yes | no | PAGE_SPECS/SCFR-183-parent-ai-assistant-desktop.md |
| SCFR-184-parent-growth-storybook-mobile | parent | /parent/storybook?child=c-1 | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-184-parent-growth-storybook-mobile.md |
| SCFR-185-parent-dashboard-mobile | parent | /parent?child=c-1 | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-185-parent-dashboard-mobile.md |
| SCFR-186-parent-dashboard-tablet-portrait | parent | /parent/storybook?child=c-1 | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-186-parent-dashboard-tablet-portrait.md |
| SCFR-187-parent-dashboard-tablet-portrait | parent | /parent/storybook?child=c-1 | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-187-parent-dashboard-tablet-portrait.md |
| SCFR-188-parent-dashboard-desktop | parent | /parent/storybook?child=c-1 | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-188-parent-dashboard-desktop.md |
| SCFR-189-mobile-dashboard-mobile | director | /admin/agent?action=weekly-report | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-189-mobile-dashboard-mobile.md |
| SCFR-190-mobile-modal-state-mobile | director | /admin | mobile 941x1672 | no | no | yes | PAGE_SPECS/SCFR-190-mobile-modal-state-mobile.md |
| SCFR-191-mobile-modal-state-mobile | director | /admin | mobile 941x1672 | no | no | yes | PAGE_SPECS/SCFR-191-mobile-modal-state-mobile.md |
| SCFR-192-mobile-dashboard-mobile | director | /admin | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-192-mobile-dashboard-mobile.md |
| SCFR-193-login-auth-login-desktop | login | /login | desktop 1448x1086 | no | no | yes | PAGE_SPECS/SCFR-193-login-auth-login-desktop.md |
| SCFR-194-director-dashboard-desktop | director | /children | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-194-director-dashboard-desktop.md |
| SCFR-195-shared-dashboard-desktop | shared | /children | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-195-shared-dashboard-desktop.md |
| SCFR-196-shared-dashboard-tablet-portrait | shared | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-196-shared-dashboard-tablet-portrait.md |
| SCFR-197-shared-dashboard-tablet-portrait | shared | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-197-shared-dashboard-tablet-portrait.md |
| SCFR-198-mobile-dashboard-mobile | director | /admin | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-198-mobile-dashboard-mobile.md |
| SCFR-199-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | yes | yes | no | PAGE_SPECS/SCFR-199-mobile-ai-assistant-mobile.md |
| SCFR-200-shared-dashboard-desktop | shared | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-200-shared-dashboard-desktop.md |
| SCFR-201-mobile-dashboard-mobile | director | /admin | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-201-mobile-dashboard-mobile.md |
| SCFR-202-shared-dashboard-desktop | shared | /parent/agent?child=c-1#feedback | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-202-shared-dashboard-desktop.md |
| SCFR-203-shared-dashboard-tablet-portrait | shared | /parent/agent?child=c-1#feedback | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-203-shared-dashboard-tablet-portrait.md |
| SCFR-204-shared-dashboard-tablet-portrait | shared | /health | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-204-shared-dashboard-tablet-portrait.md |
| SCFR-205-director-dashboard-desktop | director | /health | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-205-director-dashboard-desktop.md |
| SCFR-206-shared-dashboard-desktop | shared | /health | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-206-shared-dashboard-desktop.md |
| SCFR-207-director-dashboard-mobile | director | /admin | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-207-director-dashboard-mobile.md |
| SCFR-208-director-dashboard-desktop | director | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-208-director-dashboard-desktop.md |
| SCFR-209-director-dashboard-desktop | director | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-209-director-dashboard-desktop.md |
| SCFR-210-director-dashboard-desktop | director | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-210-director-dashboard-desktop.md |
| SCFR-211-shared-dashboard-desktop | shared | /diet | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-211-shared-dashboard-desktop.md |
| SCFR-212-shared-dashboard-desktop | shared | /diet | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-212-shared-dashboard-desktop.md |
| SCFR-213-director-dashboard-desktop | director | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-213-director-dashboard-desktop.md |
| SCFR-214-shared-dashboard-tablet-portrait | shared | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-214-shared-dashboard-tablet-portrait.md |
| SCFR-215-shared-dashboard-tablet-portrait | shared | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-215-shared-dashboard-tablet-portrait.md |
| SCFR-216-shared-dashboard-tablet-portrait | shared | /admin | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-216-shared-dashboard-tablet-portrait.md |
| SCFR-217-mobile-dashboard-mobile | director | /admin | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-217-mobile-dashboard-mobile.md |
| SCFR-218-mobile-dashboard-mobile | director | /admin | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-218-mobile-dashboard-mobile.md |
| SCFR-219-login-auth-login-desktop | login | /login | desktop 1448x1086 | no | no | no | PAGE_SPECS/SCFR-219-login-auth-login-desktop.md |
| SCFR-220-mobile-dashboard-mobile | director | /admin/agent?action=weekly-report | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-220-mobile-dashboard-mobile.md |
| SCFR-221-shared-ai-assistant-tablet-portrait | shared | /admin/agent | tablet/portrait 1086x1448 | yes | yes | no | PAGE_SPECS/SCFR-221-shared-ai-assistant-tablet-portrait.md |
| SCFR-222-director-dashboard-desktop | director | /admin | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-222-director-dashboard-desktop.md |
| SCFR-223-shared-dashboard-tablet-portrait | shared | /growth | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-223-shared-dashboard-tablet-portrait.md |
| SCFR-224-teacher-dashboard-mobile | teacher | /teacher | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-224-teacher-dashboard-mobile.md |
| SCFR-225-teacher-dashboard-tablet-portrait | teacher | /teacher | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-225-teacher-dashboard-tablet-portrait.md |
| SCFR-226-parent-dashboard-mobile | parent | /parent?child=c-1 | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-226-parent-dashboard-mobile.md |
| SCFR-227-teacher-ai-assistant-tablet-portrait | teacher | /teacher/agent | tablet/portrait 1086x1448 | yes | yes | no | PAGE_SPECS/SCFR-227-teacher-ai-assistant-tablet-portrait.md |
| SCFR-228-teacher-ai-assistant-mobile | teacher | /teacher/agent | mobile 941x1672 | no | yes | no | PAGE_SPECS/SCFR-228-teacher-ai-assistant-mobile.md |
| SCFR-229-teacher-dashboard-mobile | teacher | /teacher/health-file-bridge | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-229-teacher-dashboard-mobile.md |
| SCFR-230-teacher-ai-assistant-tablet-portrait | teacher | /teacher/agent | tablet/portrait 1086x1448 | yes | yes | no | PAGE_SPECS/SCFR-230-teacher-ai-assistant-tablet-portrait.md |
| SCFR-231-teacher-dashboard-tablet-portrait | teacher | /teacher | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-231-teacher-dashboard-tablet-portrait.md |
| SCFR-232-teacher-dashboard-tablet-portrait | teacher | /teacher | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-232-teacher-dashboard-tablet-portrait.md |
| SCFR-233-teacher-dashboard-mobile | teacher | /teacher | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-233-teacher-dashboard-mobile.md |
| SCFR-234-teacher-dashboard-mobile | teacher | /teacher | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-234-teacher-dashboard-mobile.md |
| SCFR-235-teacher-ai-assistant-tablet-portrait | teacher | /teacher/agent | tablet/portrait 1086x1448 | yes | yes | no | PAGE_SPECS/SCFR-235-teacher-ai-assistant-tablet-portrait.md |
| SCFR-236-teacher-dashboard-desktop | teacher | /teacher | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-236-teacher-dashboard-desktop.md |
| SCFR-237-teacher-dashboard-tablet-portrait | teacher | /teacher/health-file-bridge | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-237-teacher-dashboard-tablet-portrait.md |
| SCFR-238-teacher-dashboard-desktop | teacher | /teacher/agent?action=communication | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-238-teacher-dashboard-desktop.md |
| SCFR-239-teacher-dashboard-mobile | teacher | /teacher/agent?action=communication | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-239-teacher-dashboard-mobile.md |
| SCFR-240-teacher-dashboard-tablet-portrait | teacher | /teacher/agent?action=communication | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-240-teacher-dashboard-tablet-portrait.md |
| SCFR-241-teacher-ai-assistant-mobile | teacher | /teacher/agent | mobile 941x1672 | yes | yes | no | PAGE_SPECS/SCFR-241-teacher-ai-assistant-mobile.md |
| SCFR-242-teacher-dashboard-mobile | teacher | /teacher | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-242-teacher-dashboard-mobile.md |
| SCFR-243-teacher-dashboard-desktop | teacher | /teacher | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-243-teacher-dashboard-desktop.md |
| SCFR-244-teacher-dashboard-desktop | teacher | /teacher | desktop 1448x1086 | yes | no | no | PAGE_SPECS/SCFR-244-teacher-dashboard-desktop.md |
| SCFR-245-parent-communication-feedback-mobile | parent | /parent/agent?child=c-1#feedback | mobile 941x1672 | no | no | no | PAGE_SPECS/SCFR-245-parent-communication-feedback-mobile.md |
| SCFR-246-director-dashboard-mobile | director | /admin/agent?action=weekly-report | mobile 941x1672 | yes | no | no | PAGE_SPECS/SCFR-246-director-dashboard-mobile.md |
| SCFR-247-director-charts-reports-tablet-portrait | director | /admin/agent?action=weekly-report | tablet/portrait 1086x1448 | yes | no | no | PAGE_SPECS/SCFR-247-director-charts-reports-tablet-portrait.md |
