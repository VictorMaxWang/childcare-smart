# C99 汇总：功能完整性审计分诊与路线图

你执行 C99，只在 C10-C15 和 C20-C23 全部完成后运行。

## 输入文件

读取：

- `docs/feature-audit/findings/C10-parent.json`
- `docs/feature-audit/findings/C11-teacher.json`
- `docs/feature-audit/findings/C12-director.json`
- `docs/feature-audit/findings/C13-chat-communication.json`
- `docs/feature-audit/findings/C14-health-materials.json`
- `docs/feature-audit/findings/C15-persistence-submit.json`
- `docs/feature-audit/findings/C20-api-mock-visual-only.json`
- `docs/feature-audit/findings/C21-data-model-permission.json`
- `docs/feature-audit/findings/C22-actions-buttons-forms.json`
- `docs/feature-audit/findings/C23-tests-coverage.json`

## 输出文件

C99 可以编辑：

- `docs/feature-audit/INCOMPLETE_FEATURES.md`
- `docs/feature-audit/INCOMPLETE_FEATURES.json`
- `docs/feature-audit/API_GAP_ANALYSIS.md`
- `docs/feature-audit/USER_JOURNEY_COVERAGE.md`
- `docs/feature-audit/DATA_PERSISTENCE_AUDIT.md`
- `docs/feature-audit/MOCK_VISUAL_ONLY_AUDIT.md`
- `docs/feature-audit/PRODUCT_SPEC_GAPS.md`
- `docs/feature-audit/IMPLEMENTATION_ROADMAP.md`

不要修业务源码。

## 汇总规则

1. 校验所有 findings JSON 都是数组，字段符合 README schema。
2. 合并重复 finding：同一功能、同一路由、同一根因只保留一条主 finding。
3. 保留跨线程证据：Browser Use 证据和代码证据互相引用。
4. 按 F0-F4 排序，并在 F0/F1 中优先处理 fake success、权限风险、核心流程无真实提交。
5. 将每个 finding 分类到 backend/frontend/product/test 四类工作。
6. 生成路线图时不要直接提出大重构，优先最小业务闭环。

## 输出要求

- `INCOMPLETE_FEATURES.json` 必须是汇总后的 finding 数组。
- Markdown 汇总必须包含 Top 10 优先项、API 缺口、持久化缺口、mock/visual-only 缺口、产品规则缺口。
- 路线图必须说明先实现哪些功能，以及依赖关系。
- 如果某线程没有发现问题，也要在汇总中说明该线程已覆盖。

