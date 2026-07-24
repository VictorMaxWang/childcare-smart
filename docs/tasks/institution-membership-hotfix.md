# Real Account Institution Membership Hotfix

更新日期：`2026-07-24`

## 问题

园长、教师、家长独立注册时各自生成新的 `institution_id` 和快照。教师档案也不等于登录账号，因此三端虽然都能登录，却没有共同机构、班级和监护授权关系。

## 目标

- 保持手机号密码注册逻辑不变。
- 由园长通过一次性邀请码建立正式成员关系。
- 教师只能读取已分配班级，家长只能读取已授权孩子。
- 家长已有孩子与记录在完整同意校验后事务迁移，源快照保留。
- 教师服务端写入的晨检、饮食、成长可由家长读取并进入 AI 分析/绘本。

## 发布门槛

- [x] 邀请创建/接受、角色限制、同意校验与回滚测试。
- [x] 稳定 classId、监护关系和普通 child CRUD 越权测试。
- [x] 服务端原子快照更新与教师写、家长读测试。
- [x] localStorage quota 降级测试。
- [x] lint、typecheck、production build。
- [ ] 生产执行 `20260724_create_institution_memberships.sql`。
- [ ] 生产 `npm run db:check`。
- [ ] 三示例账号对齐 dry-run 与 apply。
- [ ] Chrome 验证教师记录、家长读取、园长/教师/家长 AI、家长真实绘本。
- [ ] 提交、推送并确认生产部署。

## 安全边界

- 不提交或输出数据库连接串、密码、会话 cookie、完整手机号和生产导出。
- 不删除源快照，不执行全表删除、truncate 或 drop。
- `scripts/align-sample-accounts.mjs` 默认只读；`--apply` 使用单事务、冲突预检和授权审计。
