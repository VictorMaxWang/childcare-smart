# 家长三元课程与智慧推荐

家长入口为 `/parent/courses`。9 个原创微课分别覆盖营养教育、心理健康支持和体育活动指导，包含知识卡、情境自检与家庭实践。视频仅作外链补充，不代表大学MOOC授权、专业诊断或与视频作者的合作。

## 来源与核验

算法根据用户授权从 `newbot_agent3.0` 的 `RecommendationOptimizer.java` 及语义推荐流程适配，未复制源项目的账号、密钥、私库、课程实例、Java运行环境或桌面应用。知识卡、自检与实践文字为本项目原创；未复制 MOOC 正文或下载视频，没有使用其完整 CoursePlayer 或任意 HTML 互动执行器。

原算法位置为 `src/main/java/com/demo/edu/classroom/recommendation/RecommendationOptimizer.java`。源仓库顶层未发现项目级LICENSE，本次依据用户明确的项目内迁移授权适配，不给源项目追加或推断开源许可；第三方视频权利仍归各作者，站内只展示归属与外链。

2026-10-31 核对 B站公开元数据：包括明确 BV、分P、作者、免费状态与实际时长。直接 HTTP 遇 412 后停止该请求链；允许的普通浏览器读取已取得元数据，后续用户限制 OpenCLI 后未再发起该工具的浏览器调用。营养来源为 [儿科科普合集](https://www.bilibili.com/video/BV13X4y1u7VE/) P1/P2（101/102秒）、[惠州市第二妇幼保健院辅食质地科普](https://www.bilibili.com/video/BV1wQ1sB9EGQ/)（44秒）；心理来源为 [稚桥教育依恋科普](https://www.bilibili.com/video/BV1MT4y1i7Xn/)（232秒）、[亲子回应说明](https://www.bilibili.com/video/BV1vcNa68EmW/?p=1)（650秒）、[幼儿冲突指导](https://www.bilibili.com/video/BV1S1421d77j/)（134秒）；运动来源为 [亲子大运动](https://www.bilibili.com/video/BV1Yf4y1u7c2/)（63秒）、[1–3岁亲子游戏](https://www.bilibili.com/video/BV1UMQiB5Eay/)（41秒，两个不同微课引用同一资源）。

不将整条合集总时长当作单P时长；曾发现搜索索引中的某个分P标题与实时元数据不一致，已剔除。两门微课可引用同一视频，但推荐时归为重复组，不会重复占用推荐位。

## 推荐机制

使用 MaaS GLM 从服务端授权档案的最小汇总事实选择学习目标，使用单独 embedding 模型计算语义相关与重复度，在最多20候选中穷举1–3项。视频预算为5/10/20分钟硬约束，评分包含目标覆盖、相关性、互补性、明确反馈偏好和重复惩罚。旧组合在当前输入下重新复核，模型分差≤0.02才沿用；不是学习成效预测。

视频元数据与语义缓存24小时。向量模型、端点、维度或课程目录变化会使缓存失效；未知、未核验或付费视频不参与推荐，平台412/429不绕过。推荐任务按机构、家长和儿童隔离，保存到 MySQL；同一请求幂等，同一数据条件下复用进行中或有效结果。已运行但结果未知的任务不会因刷新自动重复付费。

## 数据与部署

执行增量迁移 `supabase/sql/20261031_parent_courses.sql`，只新增课程元数据、学习事件、推荐任务和语义缓存表，应用账号仍仅使用常规业务 CRUD，不在 GET 中创建表。基础原创课程随应用发布，公共元数据可在独立目录表更新；已有课程版本的学习事件不覆盖。

课程阅读与元数据查询不调用收费模型，只有家长主动生成推荐才启动模型请求。打开B站只记录 opened；自检、实践及课程反馈分别记录，不能推断站外播放完成。课程 API 使用现有 session 与儿童作用域，学习记录与推荐只属于当前家长。

公共目录种子可以离线生成，再交由独立管理账号导入；脚本不读取环境变量或凭据：

```powershell
node --import ./scripts/register-test-path-loader.mjs scripts/export-parent-course-seed.mjs > artifacts/implementation-20261031/parent-course-seed.sql
```

迁移的4条语句都是 `CREATE TABLE IF NOT EXISTS`，可重复执行。学习事件以独立自增序号识别最新反馈，不依赖秒级时间或随机UUID顺序。应用连接不需要DDL权限。公共语义缓存被模型身份/维度检查判定失效时仅清除可重建的派生缓存，不涉及用户学习事件。

## 普通账号真实验收夹具

`scripts/parent-courses-real-matrix.mjs` 使用正常注册、监护同意建档和园长邀请码流程，不注入数据库身份、不启动浏览器、不调用收费AI。默认只输出计划：

```powershell
node scripts/parent-courses-real-matrix.mjs --prefix=qa-care-20261031
```

在旧生产先准备同一数据集作为性能基线（只建账号、儿童和邀请，不访问新课程API）：

```powershell
node scripts/parent-courses-real-matrix.mjs --execute --setup-only --prefix=qa-care-20261031 --manifest=artifacts/implementation-20261031/real-matrix.private.json
```

候选版本部署后复用上述凭据执行普通业务验收，不增加AI费用：

```powershell
node scripts/parent-courses-real-matrix.mjs --execute --prefix=qa-care-20261031 --manifest=artifacts/implementation-20261031/real-matrix.private.json --report=artifacts/implementation-20261031/parent-courses-real-report.json
```

清单包含8个普通账号：A/B两位园长；A机构同班与异班教师各一位、B机构教师一位；A机构两位家长、B机构一位家长。其中A家长1有8和26月龄两名合成儿童，A家长2有30月龄儿童，B家长1有18月龄儿童。同名班级跨机构设置，用于捕获只按班名过滤的错误。注册生成的初始个人空间在邀请码迁移后可能留下空记录；按保留数据原则不删除，验收目标机构为两家。

私有清单保存随机测试密码，仅允许存入被gitignore排除的artifacts目录，不能提交Git或随报告分发。失败时保留已经创建的数据，不自动清理，也不会自动追加付费重试。成功报告只包含脱敏计数、检查项与状态。

脚本覆盖8账号儿童列表的机构/班级/家长隔离、匿名与错误角色、跨儿童课程读写、课程自检/实践/反馈持久化、同请求重复写入和冲突、B站打开不算完成，以及另一个普通登录会话读取已保存进度。以下项目必须另外真实验收，不能由此脚本冒充通过：Chrome桌面/390px/768px交互；教师记录与照片到家长反馈全流程；预算内的一次真实智慧推荐、跨家长读取推荐拒绝；容器重启后的持久化和未知上游任务不重复提交。

本地回归入口（不访问真实模型）：

```powershell
node --import ./scripts/register-test-path-loader.mjs --test lib/courses/optimizer.test.ts lib/server/parent-course-service.test.ts lib/navigation/primary-nav.test.ts scripts/parent-courses-real-matrix.test.mjs
```

请求受理与执行分离。任务仅从 `pending` 原子领取一次；超过5分钟的 `running` 读取为 `unknown`，不会重新发送。已发送后超时、网络断线或提交结果断线归为 `unknown`；明确的鉴权/限流/格式错误归为 `failed`。用户显式重新生成才会创建新意图，界面说明未知结果可能已经计费。

## 本地真实MySQL集成回归

`scripts/parent-courses-sql-integration.mjs` 固定连接 `127.0.0.1:13306` 的 `childcare` 隔离库，以私有凭据文件的 `app` 字段读取密码，覆盖继承的数据库配置，不能传入生产地址。先完成上述4表迁移，再执行：

```powershell
node --import ./scripts/register-test-path-loader.mjs scripts/parent-courses-sql-integration.mjs --execute --credentials-file=<私有本地凭据JSON> --report=artifacts/implementation-20261031/parent-courses-sql-integration.json
```

2026-10-31 本地隔离MySQL实际执行21项检查全部通过：10并发事件与推荐意图去重、不同事件无丢写、JSON幂等、预算冲突、用户/机构/儿童隔离、同秒最新反馈、模型身份和过期缓存、撤销授权、已完成合成结果回放、反馈关联与版本失效、任务领取与连接池重建持久化。全局fetch在发送前故意抛出离线错误，10并发工作者只有一次抵达故障点，随后任务为unknown且重复run不再抵达网络层；真实AI调用与外部网络请求均为0。合成模型结果只验证数据库契约，不作为真实生成证据；合成服务scope不替代浏览器登录验收。
