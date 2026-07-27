# Task Registry

更新基准：`2026-07-28`

## Active Hotfix

### Teacher Storybook Generation Extension

- 状态：`Local verified / Production smoke pending`
- 目标：教师可在自身机构与分班授权范围内选择幼儿，使用真实成长记录生成、补全媒体并保存绘本；对应家长读取同一份服务端绘本。
- 主改动源：
  - `app/teacher/storybook/page.tsx`
  - `components/storybook/StoryBookWorkspace.tsx`
  - `components/parent/StoryBookViewer.tsx`
  - `app/api/ai/parent-storybook/route.ts`
  - `app/api/ai/parent-storybook/media-status/route.ts`
  - `app/api/ai/parent-storybook/media/[mediaKey]/route.ts`
  - `tests/production-real/three-role.spec.ts`
- 固定边界：
  - 教师只能选择服务端投影出的同机构、已分班幼儿，不能通过请求体扩大 child scope。
  - `demoSeed` 继续只对演示家长开放；教师端打开或切换幼儿时不自动产生付费生成请求。
  - 教师生成后写入既有 storybook 服务，家长端按监护授权读取；图片和音频后续状态变化也要写回同一记录。
  - 生产验收同时覆盖现有三示例账号与新注册、邀请码绑定的三端账号。
- 本地验证：
  - `npm run lint`、`npm run typecheck`、`npm run build` 通过，正式构建已包含 `/teacher/storybook`。
  - 全量 Node 回归 `667/667` 通过；教师绘本定向 route/guard/nav `39/39`、媒体状态 `28/28` 通过。
  - `tests/feature-completion/parent-features.spec.ts` 浏览器回归 `2/2` 通过，教师保存的同一 storybook 可由家长列表与导出接口读取。

### Three-role Production Hardening & Functional Completion

- 状态：`Production smoke passed / Formal evidence pending`
- 目标：把园长、教师、家长三端从“页面可打开”推进到真实授权、真实写入、跨端读取、AI 结果可追溯和可审计发布。
- 主改动源：
  - `lib/persistence/state-scope.ts`
  - `lib/server/app-data-service.ts`
  - `lib/server/child-class-registry.ts`
  - `lib/ai/provenance-attestation.ts`
  - `lib/voice-assistant/confirmation-token.ts`
  - `lib/server/upload-security.ts`
  - `components/Navbar.tsx`
  - `components/layout/GlobalUtilityCenter.tsx`
  - `scripts/release-formal-gate.mjs`
- 已完成：
  - `/api/state`、任务、消息、会话、提醒和移动草稿按角色与幼儿作用域投影；家长无权 child 链接不再回退到其他幼儿。
  - 会话与远端状态失败不再伪装成空数据；顶部搜索、通知、消息和账号菜单已接入真实作用域数据及写入操作。
  - 演示账号切换不再把机构级完整缓存裁成单一角色快照；缓存超额时降级为内存/远端态而不击穿 React。
  - 班级使用稳定 `classId`，幼儿写入与 `child_registry` 同事务同步；同名班级不再构成授权依据。
  - AI 结果在服务端绑定用户、机构、能力、幼儿/班级和结果摘要；未签名或作用域不符的 provider 声明不能作为 live AI 结果持久化。
  - 上传按流式大小上限、严格 Base64、MIME 与文件魔数校验；语音确认令牌绑定操作者与作用域，并通过数据库一次性消费防重放。
  - 本地 `lint`、`typecheck`、production build、663 项 Node、228 项 Python、36 项发布证明测试和 83 项发布浏览器回归已执行；浏览器结果为 80 通过、3 项真实账号规格明确跳过，因此只属于本地验证。
  - 正式真实账号 smoke 已扩展为强制执行高风险会诊 live AI、营养评估、成长绘本文本及图片/语音媒体补全，并实际打开右上角搜索、通知和消息面板。
  - `dfc32f8` 已推送并由生产 `/api/health` 确认部署；fresh smoke 已通过注册绑定、三类记录、跨端读取/消息、语音、OCR、食物识别、ASR、高风险会诊、三端 AI、营养评估和绘本文本。
  - 首次 fresh smoke 在绘本媒体状态请求处发生 `ECONNRESET`；媒体接口现限制远端与本地 provider 时间预算，生产测试会按服务端退避提示重试瞬时断连。
  - 媒体补丁部署后的第二轮 fresh smoke 在绑定后会话读取处返回 500；Vercel 日志确认是 MySQL `ETIMEDOUT`。幂等会话读取现有限重试瞬时建连故障，持续失败使用可重试 503 响应。
  - `0336460` 已部署；正式 smoke 中现有三示例账号通过，fresh 三账号通过注册绑定及三端业务/AI 主链，百炼图片达到 `4/4`，最终仅剩 Vivo TTS 媒体数据库提交超时导致音频 `0/4`。
  - 当前候选为 TTS 使用稳定机构媒体键，并对未知提交、精确回读、账本 `markReady` 和已落库音频恢复提供有界重试；Vivo ASR 具备端到端截止时间、取消传播、完成度检查和跨请求恢复账本。
  - 生产 DMC 已执行 `vivo_asr_tasks` 幂等迁移，`SHOW CREATE TABLE` 已验证 18 个字段、主键和 3 个关键索引。
  - 发布门禁新增启动前环境净化、完整 SHA、HMAC 报告签名、隔离 worktree、禁用外部 Git hooks、固定 deployment origin、`releaseRunId` 与 `deploymentId`/deployment URL 交叉校验，避免旧报告、短 SHA、`.env.local` 或同提交不同部署造成假阳性。
  - 绘本文案新增 DashScope 结构化输出备用链路；仅对上游明确错误执行切换，连接/正文中断与超时不自动产生第二笔付费请求，Vivo 仍保留完整剩余预算。
  - `a6ca28a72f2f604583811eb1fb6032d11ed8ea47` 已部署为 `dpl_FzJr6ewRkkztpbTFV8HUECRUnCXp`。生产 `all` smoke 中 existing 与 fresh 两条链路均通过，首 4 页图片和音频分别达到 `4/4 private_blob` 冷读，并通过 WebP/WAV 魔数验证。
- 正式证据待完成：
  - 在受控发布环境补齐 `.env.release` 后运行权威 `release-formal-gate.ps1`；当前本机缺少 17 个正式字段，不能把非 formal smoke 报告签成正式发布证明。
  - 获得不暴露连接串的真实 `DATABASE_URL` 后，用严格 `npm run db:check` 生成新鲜数据库证据。
  - 对 Tencent Brain 服务版本和共享签名继续保留服务器侧证据；本轮仅确认生产请求成功，不扩写未核验的部署叙述。

### Real Account Institution Membership Hotfix

- 状态：`Production-verified / Formal DB proof pending`
- 目标：让独立注册的园长、教师、家长通过一次性邀请码建立正式机构、班级与监护关系，并完成“教师记录 -> 家长读取 -> AI 分析/绘本”的真实账号闭环。
- 主改动源：
  - `lib/server/institution-membership.ts`
  - `supabase/sql/20260724_create_institution_memberships.sql`
  - `app/api/admin/member-invitations/route.ts`
  - `app/api/account/member-invitations/accept/route.ts`
  - `lib/auth/membership-projection.ts`
  - `lib/server/app-data-repository.ts`
  - `scripts/align-sample-accounts.mjs`
- 已完成：
  - 规范机构成员、稳定班级 ID、教师分班、幼儿登记、监护链接和授权审计。
  - 家长迁移前校验三类监护同意，失败整体回滚并保留源家庭快照。
  - 晨检、饮食、成长真实账号写入改为等待服务端成功后再提示。
  - 家长真实账号直接读取服务端作用域数据；AI 绘本记录完整来源 ID。
  - 授权/建档/缓存/记录测试、注册测试、lint、typecheck、production build 已通过。
- 生产待完成：
  - 在不暴露连接串的受控环境运行严格 `npm run db:check`，补齐规范关系 SQL 的签名发布证据。
  - 保留 `scripts/align-sample-accounts.mjs` 的 dry-run 优先边界；现有三示例账号已在 `all` smoke 中完成记录、读取、AI 与绘本验收。

### Demo Data & Recording Asset Recovery Hotfix

- 状态：`Done-code-only`
- 目标：让 demo 账号每天都像刚更新过，提升三端录屏可讲性。
- 主改动源：
  - `lib/store.tsx`
  - `backend/app/db/demo_snapshot.py`
  - `lib/demo/demo-consultations.ts`
  - `backend/app/db/childcare_repository.py`

## 本轮固定叙事

- `c-1`：Parent 主线，负责 meals / media / feedback / weekly preview。
- `c-8`：Teacher 风险主线，负责分离焦虑与午睡过渡。
- `c-11`：Teacher / Admin 饮食主线，负责偏食与家园沟通。
- `c-14`：晨曦班睡眠复核。
- `c-15`：Admin 与 weekly-report 主线，负责补水趋势与 top consultation。
- `c-3`：正向成长对照。

## 本轮 contract

- demo 时间字段统一输出规范日期或 ISO 时间字符串。
- consultation / intervention / reminders / tasks / mobile drafts / taskCheckIns 共享同一套 hero child narrative。
- 不新增外部依赖，不改主工作流，不碰 Storybook 受保护文件。

## 已落地验证目标

- Parent 首页不再只有功能没有内容。
- Teacher 首页风险样本不再集中在一个 child。
- Admin 首页与 weekly-report 可以稳定讲班级分布、风险差异、attendance、consultation、follow-up。
- consultation fallback 与 backend snapshot 已按同一故事线对齐。

## 后续待继续的项

- 生成页面 smoke 截图并沉淀到 `artifacts/qa-sweep/<timestamp>/`
- 对 `npm run ai:smoke` 做一轮完整复验
- 在下一轮热修里继续守住 demo-safe 素材口径
