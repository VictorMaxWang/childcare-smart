# C21 代码扫描：数据模型、权限和范围审计

你执行 C21，只做代码扫描，不修业务源码。

## 输出文件

- JSON findings：`docs/feature-audit/findings/C21-data-model-permission.json`
- Markdown 报告：`docs/feature-audit/findings/C21-data-model-permission.md`
- 证据目录：`artifacts/feature-audit/C21-code/`

只写以上文件，不要编辑 `INCOMPLETE_FEATURES.json`。

## 扫描范围

- `lib/auth/**`
- `lib/persistence/**`
- `lib/store.tsx`
- `lib/view-models/**`
- `lib/server/**`
- `lib/db/**`
- `app/api/**`
- `lib/navigation/**`
- 任何包含 `childId`、`classId`、`teacherId`、`institutionId`、`role` 的文件。

## 搜索信号

查找：硬编码 `c-1`、固定班级、固定教师、固定机构、demo account 映射、未校验 role 的 API、查询参数直接信任、跨角色导航暴露、shared state 未按账号隔离、local snapshot 作用域不清晰。

## Finding 要求

- `findingId` 使用 `C21-001` 递增。
- `featureStatus` 权限问题优先使用 `permission-incomplete`。
- F0 用于跨孩子/跨班级/跨角色数据风险。
- `evidence.sourceFiles` 必须写具体文件和可定位信号。
- `recommendedImplementation` 必须说明缺少的数据模型或权限校验点。

## 报告内容

Markdown 报告包含：

- 当前账号、角色、孩子、班级、机构范围模型。
- 已发现硬编码和权限缺口。
- 建议先实现哪些数据模型和权限边界。

