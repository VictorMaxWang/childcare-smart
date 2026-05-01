# 数据持久化审计

## 判定结果

| result | 定义 |
| --- | --- |
| `persisted` | 提交后刷新、重新进入或重新登录仍能看到正确状态。 |
| `lost-after-refresh` | 前端状态改变，但刷新后丢失。 |
| `no-submit` | 没有真实提交动作或提交入口。 |
| `unknown` | 证据不足，需要代码或后端确认。 |
| `not-applicable` | 展示型功能，无提交或持久化期望。 |

## Browser Use 测试步骤

1. 以对应 demo 账号登录。
2. 打开目标路由，记录初始状态和网络面板。
3. 执行新增、回复、保存、上传、确认、反馈等真实操作。
4. 记录请求方法、URL、payload 关键字段、响应状态。
5. 刷新当前页面，检查状态是否仍在。
6. 退出并换账号，检查数据隔离。
7. 将截图、console error、network request 写入该线程 findings。

## 代码扫描重点

- React local state 只在页面内更新，没有服务端写入。
- `localStorage`、临时 cache 或 snapshot 被当成正式业务存储。
- 成功 toast 与 API 响应无关。
- POST/PUT/PATCH/DELETE 缺失。
- childId/classId/teacherId 写死。

