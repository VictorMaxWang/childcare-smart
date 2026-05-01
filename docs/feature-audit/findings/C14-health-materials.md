# C14 健康材料解析 / 高风险会诊专项审计

- 生成时间：2026-05-01T00:00:22.072Z
- baseURL：http://127.0.0.1:3000
- 浏览器：Browser Use node_repl blocked by Node v22.20.0; used Playwright Chromium fallback.
- 健康材料解析状态：mock-only
- 高风险会诊状态：fake-success
- 是否有真实上传：有文件控件，但未上传真实二进制，仅发送文件元数据/previewText。
- 是否有真实解析：未证明；本地 fallback 返回 mock/liveReadyButNotVerified。
- 是否有真实保存：未证明；demo 状态主要 localStorage，健康解析结果刷新丢失。
- 是否有真实会诊流程：有 SSE/Next API 流程，但 fallback/mock 与本地状态为主，跨角色同步未证明。
- F0/F1/F2/F3/F4：1/3/1/0/0

## 不完整功能

- F1 C14-001：健康材料解析有文件控件但不上传二进制，只把文件元数据和预览文字送入 mock/fallback 解析（mock-only）
- F0 C14-002：高风险会诊可生成结果但同步提示超出实际能力，结果只进入本地 demo 状态（fake-success）
- F1 C14-003：会诊讨论记录和加入后续提醒是前端本地状态，刷新后不可追溯（not-persisted）
- F1 C14-004：园长端高风险会诊汇总优先使用静态 demo feed，不能证明看到教师新发起会诊（mock-only）
- F2 C14-005：李老师/周老师班级视角有前端隔离，但健康材料与会诊缺少后端权限证据（permission-incomplete）

## 需要后端接口

- 上传：POST health material upload，接收真实图片/PDF 二进制或对象存储 URL，返回 fileId。
- 解析：POST health material parse job，返回结构化事实、风险、置信度、原文证据和错误态。
- 保存：POST/PUT health material result，将解析结果绑定 childId/sourceRole/fileId，支持刷新查询。
- 会诊：POST consultation、GET consultation detail、POST consultation note/action/reminder，持久化流程与处理记录。
- 查询：GET consultation feed for teacher/director/parent，GET parent/teacher health material history，均需 session child/class 权限校验。

## Findings

### C14-001 健康材料解析有文件控件但不上传二进制，只把文件元数据和预览文字送入 mock/fallback 解析
- severity：F1
- featureStatus：mock-only
- route：/teacher/health-file-bridge
- actual：文件控件存在 accept=image/*,.pdf|image/*,.pdf; 空提交提示=true; 提交请求为 POST /api/ai/health-file-bridge -> 200 (next-json-fallback) reason=brain-fetch-typeerror。请求体只包含 name/mimeType/sizeBytes/previewText，没有真实文件内容。刷新后解析结果消失。
- screenshots：artifacts/feature-audit/C14-health-materials/02-health-file-before-upload.png, artifacts/feature-audit/C14-health-materials/03-health-file-empty-submit-error.png, artifacts/feature-audit/C14-health-materials/04-health-file-after-parse.png, artifacts/feature-audit/C14-health-materials/05-health-file-after-refresh.png

### C14-002 高风险会诊可生成结果但同步提示超出实际能力，结果只进入本地 demo 状态
- severity：F0
- featureStatus：fake-success
- route：/teacher/high-risk-consultation
- actual：会诊流请求为 POST /api/ai/high-risk-consultation/stream -> 200 (next-stream-fallback) reason=brain-fetch-typeerror; GET /api/ai/high-risk-consultation/feed?limit=4&escalated_only=true -> FAILED; GET /api/admin/notification-events -> 200; GET /api/admin/notification-events -> 200; GET /api/ai/high-risk-consultation/feed?limit=4&escalated_only=true -> 200 (next-json-fallback) reason=brain-fetch-typeerror; GET /api/ai/high-risk-consultation/feed?limit=4&escalated_only=true -> FAILED; GET /api/admin/notification-events -> 200; GET /api/admin/notification-events -> 200; GET /api/ai/high-risk-consultation/feed?limit=4&escalated_only=true -> 200 (next-json-fallback) reason=brain-fetch-typeerror；页面提示会诊完成/同步，但 demo 账号远端状态只 local_only。刷新后仍回到待启动视图或本地状态，陈园长端显示的是 feed/demo 汇总，不是刚生成的跨账号后端记录。
- screenshots：artifacts/feature-audit/C14-health-materials/06-consultation-before-start.png, artifacts/feature-audit/C14-health-materials/07-consultation-after-generation.png, artifacts/feature-audit/C14-health-materials/10-consultation-after-refresh.png, artifacts/feature-audit/C14-health-materials/12-director-home-consultation-summary.png, artifacts/feature-audit/C14-health-materials/13-director-agent-consultation-feed.png

### C14-003 会诊讨论记录和加入后续提醒是前端本地状态，刷新后不可追溯
- severity：F1
- featureStatus：not-persisted
- route：/teacher/high-risk-consultation
- actual：讨论发送=true，提醒按钮点击=true；记录立即出现在页面，但代码只 setDiscussionNotes；加入后续提醒调用 upsertReminder。本轮未观察到保存讨论/处理记录的 API。
- screenshots：artifacts/feature-audit/C14-health-materials/08-consultation-discussion-sent.png, artifacts/feature-audit/C14-health-materials/09-consultation-after-reminder.png, artifacts/feature-audit/C14-health-materials/10-consultation-after-refresh.png

### C14-004 园长端高风险会诊汇总优先使用静态 demo feed，不能证明看到教师新发起会诊
- severity：F1
- featureStatus：mock-only
- route：/admin; /admin/agent
- actual：园长端请求记录为 GET /api/ai/high-risk-consultation/feed?limit=4&escalated_only=true -> FAILED; GET /api/admin/notification-events -> 200; GET /api/admin/notification-events -> 200; GET /api/ai/high-risk-consultation/feed?limit=4&escalated_only=true -> 200 (next-json-fallback) reason=brain-fetch-typeerror; GET /api/ai/high-risk-consultation/feed?limit=4&escalated_only=true -> FAILED; GET /api/admin/notification-events -> 200; GET /api/admin/notification-events -> 200; GET /api/ai/high-risk-consultation/feed?limit=4&escalated_only=true -> 200 (next-json-fallback) reason=brain-fetch-typeerror；feed route 在 brain 不可用时返回 buildDemoConsultationFeedItems，页面未能证明包含刚创建的李老师会诊。
- screenshots：artifacts/feature-audit/C14-health-materials/12-director-home-consultation-summary.png, artifacts/feature-audit/C14-health-materials/13-director-agent-consultation-feed.png

### C14-005 李老师/周老师班级视角有前端隔离，但健康材料与会诊缺少后端权限证据
- severity：F2
- featureStatus：permission-incomplete
- route：/teacher/high-risk-consultation; /teacher/health-file-bridge
- actual：周老师页面显示样本包含 晨曦班，说明前端可见数据随账号变化；但本轮 API payload 由前端 snapshot 传入，未观察到后端基于 session 对 childId/classId 的强制校验证据。
- screenshots：artifacts/feature-audit/C14-health-materials/01-teacher-li-home.png, artifacts/feature-audit/C14-health-materials/11-zhou-consultation-class-scope.png

