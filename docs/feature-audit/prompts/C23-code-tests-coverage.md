# C23 代码扫描：测试覆盖和回归缺口审计

你执行 C23，只做测试覆盖扫描，不修业务源码。

## 输出文件

- JSON findings：`docs/feature-audit/findings/C23-tests-coverage.json`
- Markdown 报告：`docs/feature-audit/findings/C23-tests-coverage.md`
- 证据目录：`artifacts/feature-audit/C23-code/`

只写以上文件，不要编辑 `INCOMPLETE_FEATURES.json`。

## 扫描范围

- `tests/**`
- `app/**/*.test.ts`
- `app/**/*.test.tsx`
- `components/**/*.test.ts`
- `components/**/*.test.tsx`
- `lib/**/*.test.ts`
- `scripts/*smoke*`
- Playwright 配置和 release/bugbash 脚本。

## 审计重点

- 是否覆盖家长消息提交和刷新持久化。
- 是否覆盖教师保存、上传、健康材料解析、高风险会诊动作。
- 是否覆盖园长周报、AI 助手、通知事件。
- 是否覆盖角色权限、childId/classId 隔离。
- 是否有 fake success、mock-only、visual-only 的回归测试。
- 是否只有视觉或 smoke，不验证真实数据提交。

## Finding 要求

- `findingId` 使用 `C23-001` 递增。
- 测试缺口通常为 F3；如果缺少测试掩盖 F0/F1 数据风险，可升为 F2。
- `featureStatus` 可使用 `partial`、`mock-only`、`permission-incomplete` 或 `needs-product-spec`，不要用 `complete` 记录缺口。
- `evidence.sourceFiles` 写测试文件或缺失测试对应的功能文件。
- `recommendedImplementation` 写建议新增的测试场景。

## 报告内容

Markdown 报告包含：

- 现有测试类型和覆盖范围。
- 缺失的关键回归测试。
- 建议先补哪些测试来保护后续实现。

