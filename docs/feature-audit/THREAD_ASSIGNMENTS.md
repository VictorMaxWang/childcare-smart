# 线程分配

## Browser Use 线程

| 线程 | 输出 JSON | markdown 报告 | 截图目录 | 审计范围 |
| --- | --- | --- | --- | --- |
| C10-parent | `findings/C10-parent.json` | `findings/C10-parent.md` | `artifacts/feature-audit/C10-parent` | 家长端首页、AI 建议、反馈、成长绘本、健康/营养/提醒。 |
| C11-teacher | `findings/C11-teacher.json` | `findings/C11-teacher.md` | `artifacts/feature-audit/C11-teacher` | 教师工作台、教师 AI、高风险会诊、班级数据。 |
| C12-director | `findings/C12-director.json` | `findings/C12-director.md` | `artifacts/feature-audit/C12-director` | 园长看板、AI 助手、周报、通知、高风险概览。 |
| C13-chat-communication | `findings/C13-chat-communication.json` | `findings/C13-chat-communication.md` | `artifacts/feature-audit/C13-chat-communication` | 家园沟通、消息回复、反馈闭环、跨角色验证。 |
| C14-health-materials | `findings/C14-health-materials.json` | `findings/C14-health-materials.md` | `artifacts/feature-audit/C14-health-materials` | 健康材料上传/解析、高风险会诊、健康数据。 |
| C15-persistence-submit | `findings/C15-persistence-submit.json` | `findings/C15-persistence-submit.md` | `artifacts/feature-audit/C15-persistence-submit` | 所有主要提交、保存、上传、确认、刷新持久化抽检。 |

## 代码扫描线程

| 线程 | 输出 JSON | markdown 报告 | 证据目录 | 审计范围 |
| --- | --- | --- | --- | --- |
| C20-code-api-mock-visual-only | `findings/C20-api-mock-visual-only.json` | `findings/C20-api-mock-visual-only.md` | `artifacts/feature-audit/C20-code` | API 接入、mock、visual-only、pixel replica。 |
| C21-code-data-model-permission | `findings/C21-data-model-permission.json` | `findings/C21-data-model-permission.md` | `artifacts/feature-audit/C21-code` | 数据模型、权限、child/class/role 范围。 |
| C22-code-actions-buttons-forms | `findings/C22-actions-buttons-forms.json` | `findings/C22-actions-buttons-forms.md` | `artifacts/feature-audit/C22-code` | 按钮、表单、上传、保存、toast、fake success。 |
| C23-code-tests-coverage | `findings/C23-tests-coverage.json` | `findings/C23-tests-coverage.md` | `artifacts/feature-audit/C23-code` | 测试覆盖、缺少 E2E/持久化/权限回归。 |

## 汇总线程

| 线程 | 输出 |
| --- | --- |
| C99-triage-roadmap | 汇总 `INCOMPLETE_FEATURES.md`、`INCOMPLETE_FEATURES.json`、`API_GAP_ANALYSIS.md`、`USER_JOURNEY_COVERAGE.md`、`DATA_PERSISTENCE_AUDIT.md`、`MOCK_VISUAL_ONLY_AUDIT.md`、`PRODUCT_SPEC_GAPS.md`、`IMPLEMENTATION_ROADMAP.md`。 |

