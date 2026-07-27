# Current Status Ledger

更新基准：`2026-07-28`

## 当前状态

- 教师成长绘本候选已完成本地实现：教师可在分班授权内选择幼儿、按真实记录生成并保存绘本，家长按监护授权读取同一份结果；切换幼儿会取消上一请求，打开页面不会自动触发付费生成。
- 本轮本地门禁为 `lint`、`typecheck`、production build、`667/667` Node、`28/28` 媒体状态和 `2/2` 定向浏览器测试通过；生产现有账号与 fresh 三端账号验收仍需等待该候选部署后执行。
- 真实账号注册仍创建独立的个人/机构初始空间；注册成功不等于已经加入同一托育机构。
- 新增的一次性机构邀请码负责后续正式绑定：园长创建邀请，教师按稳定班级 ID 加入，家长在完整监护同意校验后迁入孩子与历史记录。
- 规范授权真相位于 `institution_memberships`、`teacher_class_assignments`、`child_registry`、`guardian_child_links`；`app_users` 的机构、班级、child_ids 仅保留兼容投影。
- `a6ca28a72f2f604583811eb1fb6032d11ed8ea47` 已推送 `origin/main`；`https://www.smartchildcare.cn/api/health` 已确认部署 ID `dpl_FzJr6ewRkkztpbTFV8HUECRUnCXp` 对应这一完整提交。
- 当前运行时代码已通过 `lint`、`typecheck`、production build、663 项 Node、228 项 Python 和 36 项发布证明测试；新增的绘本文案、Vivo 错误分类、DashScope 正文截止时间和前端状态定向回归为 `40/40`。
- 正式真实账号门禁现要求高风险会诊、营养评估、成长绘本文本/图片/语音均提供实时 provider 结果，并逐端实际打开搜索、通知和消息面板；残缺的上游营养评估结构会被拒绝并降级为完整规则结果。
- 园长、教师、家长的搜索、通知、消息与账号菜单已从装饰按钮接入作用域数据；跨角色演示缓存切换、无权 child 链接和远端状态失败均有显式处理。
- AI 持久化结果现在需要服务端来源证明，上传需要 MIME 与文件魔数一致，语音确认令牌需要数据库一次性消费；这些安全边界不能由浏览器字段绕过。
- 生产 fresh smoke 已真实创建并绑定园长、教师、家长账号，依次通过健康/餐食/成长写入、跨端消息、语音确认写入、健康材料 OCR、食物识别、ASR、高风险会诊、三端 AI、营养评估和成长绘本文本；首次运行在绘本媒体状态请求处出现 `ECONNRESET`。
- 绘本媒体状态接口已把 Brain 查询和本地图片/语音 provider 限制在浏览器轮询预算内，并为生产 smoke 增加瞬时网络错误重试；该补丁已部署。
- 第二轮 fresh smoke 在绑定完成后的并发会话读取处发现 MySQL `ETIMEDOUT`；会话只读路径现对明确的连接超时/断开做有限重试，持续失败返回带 `Retry-After` 的 503，该补丁已部署。
- `0336460` 上的正式 smoke 已让现有三示例账号通过，并让 fresh 三账号完成注册绑定、记录、消息、语音、OCR/食物/ASR、高风险会诊、三端 AI、营养评估和绘本文本；百炼图片达到 `4/4`，音频因媒体数据库提交超时为 `0/4`。
- 当前候选代码为音频使用稳定机构媒体键，在任务账本提交结果不确定或 `markReady` 超时时执行精确回读；已落库音频可恢复账本且不会再次付费合成。Vivo ASR 同时补齐共享截止时间、取消信号、完成度判定和跨请求恢复账本。
- 绘本文案现在以 Vivo 为首选，并在上游明确返回鉴权、限流或响应错误时使用已配置的 DashScope；连接重置、正文中断和超时不会自动改投另一供应商，避免结果不确定时重复付费。DashScope 调用与响应正文共享取消信号和总截止时间。
- `a6ca28a` 生产 `REAL_SMOKE_MODE=all` 已完成现有三示例账号与 fresh 三账号两条真实浏览器链路：`2 passed`，`0 skipped`、`0 flaky`、`0 failed`。fresh 链路逐页冷读首 4 页媒体，图片为 `4/4 private_blob WebP (RIFF/WEBP)`，音频为 `4/4 private_blob WAV (RIFF/WAVE)`。
- 生产 DMC 已执行幂等 `vivo_asr_tasks` 迁移，并用 `SHOW CREATE TABLE` 验证 18 个字段、主键和 3 个作用域/租约/过期索引；严格 `npm run db:check` 仍需从不暴露连接串的受控环境生成签名证据。
- 正式发布证据现在要求 40 位完整 SHA、HMAC 报告签名、同一 `releaseRunId` 和不变的 Vercel `deploymentId`；权威入口在启动 Node 前净化环境，本地构建从该提交的隔离 worktree 执行，生产 smoke 固定到 deployment URL，旧报告、忽略的 `.env.local`、外部 Git hook 或跨部署报告不能拼接成通过结果。
- 三端生产业务与 live AI 浏览器 smoke 已闭环；但本机 `.env.release` 缺少正式发布所需的 17 个字段，因此未运行签名 formal gate，`productionValidated` 仍不能作为正式证据声明。严格生产数据库预检仍需从不暴露连接串的受控环境生成。
- 比赛展示口径已统一为 `慧育童行 - SmartChildcare Agent`，中文展示名为 `慧育童行`，英文名 / 技术系统名为 `SmartChildcare Agent`。
- 当前 demo 数据热修已经切到“相对日期 + 固定 hero child matrix”模式。
- 前端本地 demo snapshot 与后端 `build_demo_snapshot()` 已经围绕同一批 child case 对齐。
- Parent / Teacher / Admin 三端的主要录屏页现在都能拿到更饱满的 demo 内容。

## 当前最稳定的录屏主线

1. `c-8` 负责 Teacher 风险故事和会诊入口。
2. `c-15` 负责 Admin 首屏优先级与 weekly-report。
3. `c-11` 负责偏食与家园沟通。
4. `c-14` 负责晨曦班睡眠复核链路。
5. `c-1` 负责 Parent 闭环收尾。
6. `c-3` 负责正向成长对照，不让画面全是风险。

## 相对日期策略

- 核心展示窗口：最近 `14` 天。
- 高密度展示窗口：最近 `7` 天。
- 今日重点：`daysAgo(0)`。
- 未来提醒 / 跟进：未来 `1-3` 天。
- 本地 demo 用户每次载入 snapshot 时都会重基准，避免 localStorage 长期缓存旧日期。

## 受益最大的页面

- `/parent`
- `/parent/agent?child=c-1`
- `/parent/storybook?child=c-1`
- `/teacher`
- `/teacher/high-risk-consultation`
- `/admin`

补充路线仍保留 `/teacher/agent` 与 `/admin/agent?action=weekly-report`，但答辩主线优先按 `docs/competition-message-guide.md` 执行。

## 演示素材口径

- 餐食图片与成长图片只来自本地 demo 资产。
- 全部素材都应被表述为“示意图 / demo-safe illustration”。
- 本轮没有引入外链素材，也没有引入儿童正脸素材。

## 仍然成立的限制

- 未执行 `supabase/sql/20260724_create_institution_memberships.sql` 的环境会回退旧授权字段，不具备正式邀请绑定能力。
- 未执行 `supabase/sql/20260726_create_voice_confirmation_token_consumptions.sql` 的生产环境会拒绝需要确认的语音写操作，避免以不安全的内存防重放继续运行。
- 本地 Brain 未启动时，页面会显式进入规则降级或 provider unavailable；这不能代替生产 live AI 验收。
- `scripts/align-sample-accounts.mjs` 默认 dry-run；只有人工确认目标库后使用 `--apply` 才会写入。
- demo 数据仍然是演示化数据，不能夸大成真实业务事实。
- Parent 仍只绑定 `c-1`。
- Storybook 真实图片依赖 `NEXT_STORYBOOK_IMAGE_PROVIDER=dashscope` 与有效 `DASHSCOPE_API_KEY`；未配置时会保留动态预览而不会伪装成真实图片。
- 录屏顺序仍建议人工挑选，尤其是 Admin top 4 consultation 与 Parent 收尾之间的切换。

## 后续最容易被冲掉的点

- hero child 排序
- 相对日期重基准逻辑
- meal / growth 资产轮换
- consultation / weekly / follow-up 对齐关系
- `lib/store.tsx` 与 `backend/app/db/demo_snapshot.py` 的叙事一致性
