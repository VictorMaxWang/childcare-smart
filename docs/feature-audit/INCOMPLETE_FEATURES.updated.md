# Incomplete Features Updated

D90 generated: 2026-05-01

## Summary

| Metric | Count |
| --- | ---: |
| Total audit findings read | 92 |
| Implemented / verified | 70 |
| Remaining incomplete | 22 |
| partial | 6 |
| needs-backend | 10 |
| needs-product-spec | 6 |
| backend-missing but unmarked | 0 |

## Remaining Incomplete Findings

| Finding | Severity | Status | Task | Original status/category | Title | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `C12-001` | F1 | partial | D06 | partial | 园长 AI 助手有生成请求，但派单/任务闭环不可用 | Run D06 and define suggestion handling, dispatch statuses, and backend writes. |
| `C12-002` | F1 | needs-product-spec | D06 | ui-only | 周报/运营报表可生成但导出、分享、反馈详情和派单均未开放 | Define report product scope before implementing archive, export, share, and feedback details. |
| `C12-003` | F1 | needs-backend | D06/D07 | not-persisted | 儿童档案等管理操作主要是本地 store，未观察到真实 CRUD 后端 | Add real children/attendance CRUD APIs and server-side scope checks. |
| `C12-004` | F1 | needs-product-spec | D06 | backend-missing | 教师管理功能入口和路由缺失 | Define teacher management scope, role policy, and page/API contract. |
| `C12-005` | F2 | needs-backend | D06 | mock-only | 健康/饮食/成长汇总图表依赖前端 store 与演示数据，缺少真实聚合查询 | Implement server-side aggregate queries and replace static/demo metrics. |
| `C15-010` | F2 | partial | D06 | partial | 园长 AI 建议可请求但建议处理/派单依赖通知事件后端，可用性不稳定 | Merge into D06 dispatch closure work. |
| `C15-011` | F2 | needs-backend | D06 | partial | 园长周报可生成/刷新但没有保存为周报记录的提交链路 | Implement weekly report archive/save/share APIs. |
| `C15-012` | F1 | partial | D07 | fake-success | 幼儿档案新增显示保存成功但 demo 下仅本地持久化，编辑功能未开放 | Define edit/delete/archive rules and backend CRUD, or keep controls disabled. |
| `C20-009` | F1 | needs-product-spec | D03/D07 | mock-only | 教师语音/OCR 草稿入口使用 buildMock 和 placeholder provider | Decide whether real ASR/OCR is in scope; if yes, add providers, failures, and persistence boundaries. |
| `C20-010` | F2 | needs-backend | D04 | backend-missing | 家长趋势查询在 brain 不可用时直接 503，缺少本地或后端实现 | Define parent trend API/fallback behavior and add tests. |
| `C20-013` | F2 | partial | D06/D07 | visual-only | 园长 pixel replica 看板包含静态图表与档案行，属于 visual/mock metrics | Replace static metrics in D06 using D01 or backend aggregates. |
| `C20-014` | F2 | needs-backend | D06 | backend-missing | 周报预览有生成 API，但没有保存/归档周报接口 | Implement report record model, save, export, and share flow. |
| `C20-015` | F2 | needs-product-spec | D02/D07 | visual-only | 家长反馈附件/语音图片补充是 disabled 占位入口 | Define attachment/voice/image scope; if in scope, add upload, scanning, and authorization. |
| `C21-001` | F0 | needs-backend | D01/D06 | permission-incomplete | Teacher and high-risk AI APIs trust client supplied role and child scope | Add non-forgeable authorization checks in real APIs. |
| `C21-002` | F0 | needs-backend | D06 | permission-incomplete | Admin AI endpoints do not require an admin session before using institution payload | Add server-side admin authorization in admin AI routes or API gateway. |
| `C21-004` | F0 | needs-backend | D05 | permission-incomplete | Health file bridge and teacher voice APIs accept childId without server scope validation | Add scope checks when real upload and voice APIs are connected. |
| `C21-007` | F1 | needs-backend | D01/D06 | data-model-incomplete | Class and account scope use className/childIds but lack stable classId teacherId parentId relationships | Add production data model, migrations, and query constraints. |
| `C21-010` | F2 | needs-backend | D01 | scope-positive-with-gaps | State snapshot and localStorage have useful account scoping but should not be treated as full authorization | Replace demo authorization with server sessions and row/server-side scope. |
| `C22-005` | F0 | needs-product-spec | D07 | dangerous-delete,fake-success | 确认删除 | Define delete, archive, undo, and audit rules before opening the action. |
| `C22-015` | F2 | needs-product-spec | D06/D07 | export-share-gap,static-detail | 导出周报 / 分享周报 / 查看反馈详情 | Implement together with D06 weekly report product scope and archive backend. |
| `C22-016` | F2 | partial | D04 | share-export-missing | 绘本生成后的保存 / 分享 / 导出 | Define storybook share/export scope and add version/share-link/file-export flow. |
| `C23-007` | F3 | partial | D08/D06 | partial | 园长看板和教师工作台空/零状态缺少可断言测试 | After D06, add zero-state and quality-metric assertions. |

## Implemented / Verified Finding IDs

`C10-001`, `C10-002`, `C10-003`, `C10-004`, `C10-005`, `C10-006`, `C10-007`, `C11-001`, `C11-002`, `C11-003`, `C11-004`, `C11-005`, `C11-006`, `C13-001`, `C13-002`, `C13-003`, `C13-004`, `C13-005`, `C13-006`, `C14-001`, `C14-002`, `C14-003`, `C14-004`, `C14-005`, `C15-001`, `C15-002`, `C15-003`, `C15-004`, `C15-005`, `C15-006`, `C15-007`, `C15-008`, `C15-009`, `C15-013`, `C20-001`, `C20-002`, `C20-003`, `C20-004`, `C20-005`, `C20-006`, `C20-007`, `C20-008`, `C20-011`, `C20-012`, `C21-003`, `C21-005`, `C21-006`, `C21-008`, `C21-009`, `C22-001`, `C22-002`, `C22-003`, `C22-004`, `C22-006`, `C22-007`, `C22-008`, `C22-009`, `C22-010`, `C22-011`, `C22-012`, `C22-013`, `C22-014`, `C23-001`, `C23-002`, `C23-003`, `C23-004`, `C23-005`, `C23-006`, `C23-008`, `C23-009`

## D90 Check Results

| Check | Result | Notes |
| --- | --- | --- |
| npm run lint | passed | eslint completed successfully. |
| npm run build | passed | Next.js production build completed successfully. |
| npm run feature:smoke | passed after explicit base URL | Direct default run failed because .next/dev/lock skipped Playwright webServer and 3330 was not serving; rerun with FEATURE_BASE_URL=http://127.0.0.1:3000 passed 9 tests. |

## Quality Gate Scan

- fake-success remaining: None
- ui-only / visual-only core remaining: `C12-002`, `C20-013`, `C20-015`, `C22-015`, `C22-016`
- mock-only core remaining: `C12-005`, `C20-009`
- not-persisted / local-state-only core remaining: `C12-003`
- backend-missing but unmarked: None
