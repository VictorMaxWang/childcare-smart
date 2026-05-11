# FRONTEND-REPLICA-R06 教师端复刻报告

生成时间：2026-05-11T15:26:27.0503242+08:00

## 复刻页面

- `/teacher`：按 SCFR-236、SCFR-224、SCFR-225、SCFR-231、SCFR-232、SCFR-242、SCFR-243、SCFR-244 校准教师工作台结构，保留 `buildTeacherHomeViewModel` 与真实班级数据，去除固定设计日期/天气文案，改为真实数据日与班级同步状态。
- `/teacher/agent`：按 SCFR-005、SCFR-007、SCFR-012、SCFR-227、SCFR-228、SCFR-230、SCFR-235、SCFR-241 校准教师 AI 助手壳层、提示、任务与 provider 状态。
- `/teacher/agent?action=communication`：保留 `action=communication` 查询态、线程卡片、回复草稿、附件选择、AI 建议、反馈详情和现有 testid。
- `/teacher/health-file-bridge`：按 SCFR-127、SCFR-229、SCFR-237 校准健康材料解析入口，保留文件 base64、预览文字、保存解析和创建会诊链路。
- `/teacher/high-risk-consultation`：该路由没有直接 teacher PAGE_SPEC，按补充参考 SCFR-146、SCFR-048、SCFR-047、SCFR-064 校准；保留流式会诊、状态更新、干预卡、提醒和派单/沟通闭环。
- 教师可访问共享页 `/children`、`/health`、`/diet`、`/growth` 已纳入 R06 响应式与媒体回归覆盖。

## 教师 AI 助手

- 保留 `/api/ai/teacher-agent` 请求链路、`RoleAssistantWorkspace`、provider 状态读取、降级展示、prompt chips、发送输入与任务建议。
- 待办侧栏不再使用固定红点 `12`，改为真实 `pendingTaskCount`。
- 设计稿中的固定时间文案改为“基于当前班级数据”和“按优先级”，避免视觉假数据。
- 家园沟通模式继续使用真实线程、家长反馈详情、附件选择、回复草稿与发送控件。
- 教师端语音球已在 `app/teacher/layout.tsx` 启用；`TeacherVoiceAssistantLayer` 继续按教师角色自检，保留录音、识别、草稿保存和 `/teacher/agent?from=voice-understanding` 跳转。

## 饮食 / 成长 / 健康材料

- 饮食记录未修改 demo seed 或媒体结构；`demo-media:test` 与 R06 Playwright 均验证 `/demo-media/` 真图正常加载。
- 成长记录未修改 `GrowthRecordImage`、`mediaRefs/mediaUrls` 或 fallback 链；`growth-media:test` 与 R06 Playwright 均验证成长真图正常加载。
- 健康材料保留 `/api/ai/health-file-bridge`、vivo OCR provider 边界和 `lib/providers/vivo/*` 服务端实现；R06 覆盖 PDF 解析、保存解析、创建会诊、讨论备注、状态更新和后续提醒。

## 18/18 数据一致性

- 未修改 `lib/demo-data/seed.ts` 的班级与儿童基线。
- R06 测试通过 `/api/analytics/teacher-workbench` 验证李老师可见儿童 `18` 人、周老师可见儿童 `18` 人。
- R06 测试验证周老师视角不泄漏李老师班级儿童。

## 测试结果

| 命令 | 结果 |
| --- | --- |
| `npx playwright test tests/frontend-replica/teacher-replica.spec.ts --config=playwright.feature.config.ts --project=chromium --reporter=line` | PASS，6 passed |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run product:api` | PASS，8 passed |
| `npm run product:ai` | PASS，product AI live Chat/OCR/ASR live-pass，Playwright 6 passed |
| `npm run product:voice` | PASS，13 parser tests + 20 browser tests |
| `npm run product:journey` | PASS，1 passed |
| `npm run feature:smoke` | PASS，19 passed |
| `npm run bugbash:smoke` | PASS，1 passed |
| `npm run demo-media:test` | PASS，3 passed |
| `npm run growth-media:test` | PASS，3 passed |
| `npx tsc --noEmit` | PASS |

## 已知偏差 / 说明

- `/teacher/high-risk-consultation` 未找到直接 teacher PAGE_SPEC，已记录并按相关会诊目标图实现。
- 本地测试环境未启动 brain proxy `127.0.0.1:8010` 时会输出 fallback/ECONNREFUSED 日志；相关命令均通过，页面保留真实 provider/degraded 状态。
- `bugbash:smoke` 与 `growth-media:test` 初次并行执行时因 Playwright webServer 同抢 `127.0.0.1:3330` 失败，已分别单独重跑并通过。
