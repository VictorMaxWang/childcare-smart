# C20 代码扫描：API、Mock、Visual-only 审计

你执行 C20，只做代码扫描，不修业务源码。

## 输出文件

- JSON findings：`docs/feature-audit/findings/C20-api-mock-visual-only.json`
- Markdown 报告：`docs/feature-audit/findings/C20-api-mock-visual-only.md`
- 证据目录：`artifacts/feature-audit/C20-code/`

只写以上文件，不要编辑 `INCOMPLETE_FEATURES.json`。

## 扫描范围

- `app/api/**`
- `app/**/page.tsx`
- `components/**`
- `lib/agent/**`
- `lib/ai/**`
- `lib/mock/**`
- `components/**/pixel-replica/**`
- `tests/**`

## 搜索信号

查找：`mock`、`demoSeed`、`fixture`、`preset`、`visual-only`、`pixel-replica`、`visual-parity`、`placeholder`、`TODO`、`FIXME`、`setTimeout`、`localStorage`、`toast`、`fallback`、`Brain proxy`、无 POST/PUT/PATCH/DELETE 的读展示功能。

## Finding 要求

- `findingId` 使用 `C20-001` 递增。
- `viewport` 使用 `code`。
- `evidence.sourceFiles` 必须写具体文件。
- `evidence.apiEndpoints` 必须写相关 API 或应存在但缺失的 API。
- `evidence.codeSignals` 必须写具体信号，例如 `const demoCards = [...]`、`forwardBrainRequest fallback`。
- `recommendedImplementation` 写 likely implementation gap，不要写完整修复代码。

## 报告内容

Markdown 报告包含：

- API 接入图：前端功能到 API 到后端/持久化。
- mock-only 和 visual-only 模块列表。
- 建议先实现哪些真实 API 或替换哪些 mock。

