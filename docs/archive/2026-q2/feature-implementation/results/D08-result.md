# D08 自动化测试与 Browser Use 回归脚本补齐结果

## 状态

completed-with-known-bugbash-smoke-failure

Browser Use 已按插件流程尝试初始化，但本机 Node 为 `v22.20.0`，`node_repl` 要求 `>=22.22.0`，因此本轮关键路径使用 Playwright 执行。Playwright 回归已覆盖补齐后的核心业务链路，报告输出到 `artifacts/feature-implementation/D08/`。

## 新增测试文件

- `playwright.feature.config.ts`
- `tests/feature-completion/helpers.ts`
- `tests/feature-completion/communication-flow.spec.ts`
- `tests/feature-completion/teacher-records-persistence.spec.ts`
- `tests/feature-completion/parent-features.spec.ts`
- `tests/feature-completion/health-consultation.spec.ts`
- `tests/feature-completion/director-summary.spec.ts`
- `tests/feature-completion/visual-only-safety.spec.ts`

## 新增 npm script

- `feature:smoke`
- `feature:communication`
- `feature:persistence`

## 覆盖功能

- 家长发消息 -> 教师看到 -> 教师回复 -> 家长刷新后看到 -> 园长汇总可见并可标记处理。
- 教师新增晨检、饮食、成长记录 -> 刷新仍在 -> 家长端可见。
- 教师健康材料解析 -> 保存结果 -> 创建会诊 -> 会诊记录刷新仍在 -> 园长和家长可见。
- 家长端 `child` 参数在核心路径和移动端路径中保持，不回退到默认儿童。
- `demoSeed` 仅走隔离 fallback，不进入真实 provider 或 `/api/state` 远端持久化。
- mock/local-only mobile draft 不进入远端持久化 payload。
- 园长看板沟通汇总读取 D01 store 中真实写入结果，不使用固定 mock 覆盖。
- visual-only 按钮必须 disabled 或带 `暂未开放` 标识。
- `/login?next` 越权登录会被重定向到对应角色首页并附带 `accessDenied=1`。
- mobile 家长端核心路径无横向溢出。

## 未覆盖功能

- Browser Use 复核未执行，原因是本机 Node `v22.20.0` 低于插件要求的 `>=22.22.0`。
- D06 仍是 pending，本轮只锁定现有园长 store 汇总、沟通汇总和健康会诊可见性；周报/质量指标待 D06 补齐后扩展。
- 真实后端/真实 OCR/ASR/LLM provider 未接入，本轮按 D01 demo persistence 断言。
- `bugbash:smoke` 旧 B26 套件仍失败 27 项，主要为 production localhost 下 `_vercel/insights/script.js` MIME/404 和同源资源 console error；D08 `feature:smoke` 通过。

## 命令结果

- `npm run lint`: passed
- `npm run build`: passed
- `FEATURE_BASE_URL=http://127.0.0.1:3330 npm run feature:smoke`: passed, 9 passed
- `BUGBASH_BASE_URL=http://127.0.0.1:3330 npm run bugbash:smoke`: failed, B26 reported 27 issues in `artifacts/bug-bash/B26/b26-smoke-results.json`

## 产物

- Playwright output: `artifacts/feature-implementation/D08/playwright-output`
- Playwright HTML report: `artifacts/feature-implementation/D08/playwright-report`
- Per-test JSON/screenshot artifacts: `artifacts/feature-implementation/D08/`
