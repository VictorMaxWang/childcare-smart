# C23 测试覆盖与缺失能力扫描

审计范围：Playwright 测试、bugbash smoke、Node/TS unit tests、后端 pytest、parent message mapper test、API mock/fixture、route guard、form submit、persistence，以及 Browser Use 场景可自动化性。

## 当前测试覆盖

- Playwright：1 个 bugbash smoke（`tests/bug-bash/real-user-smoke.spec.ts`）和 6 个视觉截图/visual parity spec。覆盖登录、角色首页、菜单、刷新、白屏、移动端溢出、图片破损和部分页面截图；不覆盖真实业务提交闭环。
- Node/TS 单测：5 个 Next API route test、37 个 `lib/**` test、3 个 component/helper test。`npm run test:parent-message-mapper` 已通过，4/4。
- Node/TS 批量可执行性：用 `node --import ./scripts/register-test-path-loader.mjs --test <app/components/lib tests>` 临时跑通测试框架，但当前结果是 154/173 通过、19 失败；仓库缺少统一 `npm test`。
- Backend pytest：29 个后端测试文件。用 `py -3 -m pytest backend/tests -q` 运行结果为 202/204 通过、2 个 `test_demand_insight_engine.py` 失败；`python -m pytest` 命中了 MSYS Python，缺少 pytest。
- 已覆盖较清楚的能力：parent message mapper、健康材料 helper、后端高风险会诊 stream、反馈 normalization/consumption、snapshot normalization、storybook demo seed helper、部分 storybook route/cache/media contract。

## 缺失测试

- 家长发消息、教师回复、家长查看回复没有跨角色自动化闭环测试。
- 教师健康材料上传解析只有 helper/后端覆盖，缺 UI 上传、Next route、刷新持久化测试。
- 高风险会诊后端 stream 有覆盖，但缺前端 stream 交互、done 写回、刷新和跨端同步测试。
- 家长成长绘本已有 demo seed helper，但缺页面级 `child` 参数和 `demoSeed` 边界测试。
- mock draft 不进入真实持久化缺少专门回归测试。
- 家长反馈 child 不硬编码缺少非 `c-1` 的 UI/网络断言。
- 园长看板空/零状态、教师工作台空/零状态主要是组件条件和视觉截图，缺可断言测试。
- 表单保存后刷新持久化缺少端到端测试，覆盖范围应包括儿童档案、晨检、饮食、成长、家长反馈、提醒/草稿。
- 权限和 `/login?next` 缺 route-access 单测、proxy 单测和浏览器重定向测试。

## 最优先补充测试

1. `tests/e2e/communication-roundtrip.spec.ts`：家长提交唯一消息/反馈，教师看到并回复，家长刷新后看到回复；同时断言真实写入 API 或明确失败状态。
2. `tests/e2e/persistence-submit-refresh.spec.ts`：保存儿童档案、晨检、饮食、成长、家长反馈和草稿，刷新/新上下文后验证持久化或 local-only 标记。
3. `tests/e2e/teacher-health-consultation.spec.ts`：覆盖健康材料上传解析和高风险会诊 stream UI，验证请求体、结果卡、fallback 标记和刷新语义。
4. `lib/auth/route-access.test.ts`、`proxy.test.ts`、`tests/e2e/zero-states-and-route-guards.spec.ts`：锁定权限、`/login?next`、空状态和零状态。
5. `tests/e2e/parent-storybook-child-demo-seed.spec.ts`：锁定绘本 child 参数、demoSeed 只进入允许的 demo 分支、不误写真实持久化。

## 哪些功能无法自动化验证

- 第三方 AI/OCR/图片/音频内容质量不可稳定自动化，只适合验证请求契约、fallback 标记、provider/diagnostics、缓存、媒体 URL、人工复核提示。
- Browser Use 场景本身可自动化，但当前仓库审计建议先用 Playwright 作为稳定 CI 入口；历史审计中 Browser Use 受本机 Node 版本限制，不能作为当前可靠门禁。
- 真正跨设备/跨浏览器远端持久化需要可控后端环境；本地 demo 模式只能验证 local-only 行为或通过 mock `/api/state` 验证契约。

## 建议新增测试文件

- `tests/e2e/communication-roundtrip.spec.ts`
- `tests/e2e/persistence-submit-refresh.spec.ts`
- `tests/e2e/parent-storybook-child-demo-seed.spec.ts`
- `tests/e2e/teacher-health-consultation.spec.ts`
- `tests/e2e/zero-states-and-route-guards.spec.ts`
- `lib/auth/route-access.test.ts`
- `proxy.test.ts`
- `lib/mobile/local-draft-cache.test.ts`
- `app/api/ai/health-file-bridge/route.test.ts`
- `app/api/ai/high-risk-consultation/stream/route.test.ts`

## Findings

### C23-001 家长发消息、教师回复、家长查看回复缺少跨角色自动化闭环测试

- severity/status：F2 / open
- featureStatus：partial
- coverageStatus：missing-e2e
- 现有覆盖：bugbash smoke 检查角色登录/首页/菜单/刷新；反馈 normalization 和 follow-up route 有 helper/API 覆盖。
- 缺口：没有 Playwright 场景证明家长提交、教师可见、教师回复、家长刷新可见；也没有断言写入真实 API。
- 建议：新增 `tests/e2e/communication-roundtrip.spec.ts`。

### C23-002 教师健康材料上传解析缺少 UI 上传、Next route 和刷新持久化测试

- severity/status：F2 / open
- featureStatus：mock-only
- coverageStatus：partial-helper-backend-only
- 现有覆盖：`lib/agent/health-file-bridge.test.ts` 和后端 health file bridge 测试。
- 缺口：没有 UI 文件上传、请求体、结果卡、fallback/mock 标记、Next route 和刷新测试。
- 建议：新增 `tests/e2e/teacher-health-consultation.spec.ts` 和 `app/api/ai/health-file-bridge/route.test.ts`。

### C23-003 高风险会诊缺少前端 stream、done 写回、刷新和跨端同步测试

- severity/status：F2 / open
- featureStatus：partial
- coverageStatus：backend-covered-ui-missing
- 现有覆盖：后端 SSE stream、trace/result helper。
- 缺口：没有前端 start stream、status/text/ui/done、写回、刷新、园长/家长同步测试；Next stream route 也缺单测。
- 建议：新增 `tests/e2e/teacher-health-consultation.spec.ts` 和 `app/api/ai/high-risk-consultation/stream/route.test.ts`。

### C23-004 家长成长绘本 child 参数和 demoSeed 边界缺少页面级测试

- severity/status：F2 / open
- featureStatus：partial
- coverageStatus：helper-api-covered-page-gap
- 现有覆盖：demo seed helper、storybook helper、部分 route/cache/media contract。
- 缺口：没有页面级 child query、POST childId/snapshot child、demoSeed 不误进真实 API/持久化测试。
- 建议：新增 `tests/e2e/parent-storybook-child-demo-seed.spec.ts`。

### C23-005 mock draft 不进入真实持久化缺少回归测试

- severity/status：F2 / open
- featureStatus：partial
- coverageStatus：missing-unit-and-e2e
- 现有覆盖：snapshot normalization。
- 缺口：没有测试证明 mock/local-only/mobile draft 被排除出远端 snapshot，也没有 UI 层负断言。
- 建议：新增 `lib/mobile/local-draft-cache.test.ts`，并在 `tests/e2e/persistence-submit-refresh.spec.ts` 覆盖 `/api/state` payload。

### C23-006 家长反馈 child 不硬编码缺少非默认孩子 UI 测试

- severity/status：F2 / open
- featureStatus：partial
- coverageStatus：missing-child-scope-e2e
- 现有覆盖：feedback normalization 和 snapshot normalization 保留 childId。
- 缺口：没有非 `c-1` child 的浏览器提交、payload/localStorage/教师端可见性断言。
- 建议：扩展 communication 或 persistence e2e，使用第二个授权 child 或 fixture state。

### C23-007 园长看板和教师工作台空/零状态缺少可断言测试

- severity/status：F3 / open
- featureStatus：partial
- coverageStatus：visual-only
- 现有覆盖：组件条件渲染和 visual parity 通用空状态截图。
- 缺口：没有断言空状态标题、行动入口、零指标、无风险提示文案。
- 建议：新增 `tests/e2e/zero-states-and-route-guards.spec.ts`，用空 snapshot 或 mock state 验证。

### C23-008 表单保存后刷新持久化缺少端到端回归测试

- severity/status：F2 / open
- featureStatus：partial
- coverageStatus：missing-e2e
- 现有覆盖：snapshot normalization；bugbash 只刷新首页/菜单，不提交表单。
- 缺口：儿童档案、晨检、饮食、成长、家长反馈、提醒/草稿缺保存后刷新或新上下文验证。
- 建议：新增 `tests/e2e/persistence-submit-refresh.spec.ts`，用唯一 token 和 `/api/state` 拦截验证。

### C23-009 权限和 /login?next 缺少 route guard、proxy 和浏览器重定向测试

- severity/status：F2 / open
- featureStatus：permission-incomplete
- coverageStatus：missing-unit-and-e2e
- 现有覆盖：`lib/auth/route-access.ts` 和 `proxy.ts` 有实现；bugbash 只做角色导航 smoke。
- 缺口：没有 sanitizeNextPath、resolveAuthorizedRedirectPath、proxy cookie/role/accessDenied、深链登录回跳测试。
- 建议：新增 `lib/auth/route-access.test.ts`、`proxy.test.ts` 和 route guard e2e。

## 运行证据

- `npm run test:parent-message-mapper`：通过，4/4。
- `node --import ./scripts/register-test-path-loader.mjs --test <app/components/lib tests>`：173 个子测试，154 通过，19 失败。
- `py -3 -m pytest backend/tests -q`：204 个后端测试，202 通过，2 失败。
- `python -m pytest backend/tests -q`：命中 `C:\msys64\mingw64\bin\python.exe`，失败原因为未安装 pytest。
