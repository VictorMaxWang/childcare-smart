# D05 健康材料解析 / 高风险会诊补齐结果

Status: completed

## 覆盖范围

- 已补齐语义 findingId：`C14-001`, `C14-002`, `C14-003`, `C14-004`, `C14-005`, `C11-005`, `C11-006`, `C20-001`, `C20-008`, `C20-012`, `C22-012`, `C22-013`, `C22-014`
- 对应 gap：`D05-G01`, `D05-G02`, `D05-G03`, `D05-G04`, `D05-G05`
- 说明：`FINDING_TO_TASK_MAP.md` 中 `C20-007`、`C20-002` 等编号存在语义漂移，本次按 D05 健康材料/会诊业务语义和用户指定 findingId 实施。

## 实现结果

- 健康材料解析：`/teacher/health-file-bridge` 支持真实文件选择或纯材料说明创建解析任务，任务状态覆盖 `pending`、`processing`、`completed`、`failed`。
- 本地演示解析：解析结果明确标识 `本地演示解析`，不宣称真实 OCR、真实 AI 诊断或用药授权。
- 解析结果保存：结果写入 D01 `healthMaterials`，包含摘要、风险提示、建议、关注项、复查提示、来源标识和 provenance，刷新后仍可恢复。
- 高风险会诊：可从解析结果创建会诊，绑定 `sourceMaterialId`，支持详情恢复、备注保存、`pending` / `in-progress` / `resolved` 状态更新。
- 园长端汇总：`/admin`、`/admin/agent` 读取 D01 本地真实会诊记录；高风险 feed route 不再用 demo feed 注入假会诊覆盖真实空态。
- 家长端健康摘要：`/parent?child=c-1` 仅展示家长可见摘要、关注提示和复查建议，不展示诊断、用药授权或未核对原始风险细节。
- 权限和持久化：D01 action 对 material/consultation 的 child scope 做校验；demo hydration 改为保留已保存业务记录，避免刷新时被种子会诊覆盖。
- 跨账号隔离：周老师访问非本班 child 时看不到李老师创建的材料会诊；园长旧 namespace 迁移改为非破坏合并，避免覆盖共享 D01 记录。

## 验收

- Playwright 关键路径：`tests/bug-bash/d05-health-consultation.spec.ts`
- 截图目录：`artifacts/feature-implementation/D05/`
- 当前增强验收截图：`01-li-health-material-ready.png` 到 `09-lin-parent-health-summary.png`
- 额外覆盖：空 feed 不注入 demo items、`processing` 状态、`sourceMaterialId` 绑定、`pending`/`resolved` 会诊状态、周老师隔离、`/admin` 与 `/admin/agent` 园长汇总。

## 检查

- `npm run typecheck`：passed
- `node --import ./scripts/register-test-path-loader.mjs --test ./lib/demo-data/*.test.ts`：passed
- `npm run lint`：passed
- `npm run build`：passed
- `BUGBASH_BASE_URL=http://127.0.0.1:3000 npm run bugbash:smoke`：passed
