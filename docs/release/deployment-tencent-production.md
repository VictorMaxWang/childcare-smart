# 腾讯云整站部署

本入口覆盖 `deploy/tencent/` 的整站部署。旧 `deployment-vps.md` 只描述另一台服务器的后端 staging，不作为本次生产配置来源。

## 服务与配置

- `124.156.209.173`：Caddy → Next.js；Next.js → FastAPI / MySQL，后两者不发布公网端口。
- 主站 `https://www.smartchildcare.cn`；根域名保留路径并跳转到主站。
- MySQL 8.4、Brain SQLite 和 Caddy 证书使用独立持久卷。升级及排障不执行 `docker compose down -v`。
- Node 22 多阶段镜像使用 standalone，运行时保留完整 `public` 和 `.next/static`。
- `.env` 仅保存镜像标签与 MySQL 初始化凭据；`.env.web`、`.env.backend` 分别供服务运行时读取，均设置为 0600，父目录为 0700，不提交或打包入镜像。
- Next/FastAPI 共享 `BRAIN_INTERNAL_SHARED_SECRET`。Vivo、百炼和 Vercel Blob 凭据只通过运行时注入。
- `DEPLOYMENT_COMMIT_SHA`、`DEPLOYMENT_ID`、`DEPLOYMENT_URL` 为平台中性的发布身份；未设置时兼容原 Vercel 字段。
- `AI_SERVICE_UNAVAILABLE=1` 是运行时维护开关：页面显示服务不可用提示，已授权的 AI 生成请求返回 503；历史媒体和状态读取仍保留。恢复账户余额和模型授权、完成真实调用验证后，再清除此开关并重建 web 容器。

## 构建与启动

在本机 Linux 构建环境，使用同一份源代码快照分别构建根目录 `Dockerfile` 与 `backend/Dockerfile`，将两个带发布标签的镜像导出并传至服务器。Windows 的 `node_modules`、`.next`、本地环境文件不属于发布内容。

两份 Dockerfile 都以项目根目录作为上下文；后端需要同时携带根目录的 `shared` 月龄照护规则：

```sh
docker build -t smartchildcare-web:RELEASE .
docker build -f backend/Dockerfile -t smartchildcare-backend:RELEASE .
```

服务器目录为 `/home/ubuntu/smartchildcare`。先验证配置，再启动数据库、后端和网站；只有内网验收通过后才启动正式域名入口并切换 DNS。

```sh
cd /home/ubuntu/smartchildcare
sudo docker compose config -q
sudo docker compose up -d mysql backend web
sudo docker compose ps
sudo docker compose up -d caddy
```

## 数据与切换

1. 优先从旧库或其备份恢复。恢复后根据 `information_schema` 补齐缺失字段和索引，不能无条件重放非幂等 ALTER。
2. 旧库及备份不可恢复时，按用户授权建立新库。空库依次建立账号、机构快照、手机号字段、同意记录、机构授权关系、媒体资产与任务、通知和语音确认账本。
3. 运行只读 `scripts/check-real-db-ready.mjs` 检查全部 16 张业务表及必需字段、索引。应用账号保留业务 CRUD 权限，并兼容现有惰性初始化，仅对媒体任务、ASR 任务和语音确认三张既有表授予 CREATE；其余结构维护使用单独管理身份。`initialize-empty-db.sh` 会拒绝非空库。
4. 在独立测试机构验证注册、角色与机构隔离、跨端数据、上传、AI SSE 和私有媒体。测试请求可能产生 AI 费用，禁止重置原有用户或 demo 数据。
5. 保留旧 DNS 记录后，将 `@`、`www` 的 A 记录指向本机，TTL 为 600 秒；保留其他记录。云防火墙需要 TCP 80/443，MySQL 3306 与后端 8000 保持内网访问。
6. 验证两域证书、HTTPS 跳转、Cookie、静态文件、私有媒体及 SSE。容器重启后复查数据库和 Brain 持久化，并检查 OOM 状态。

用户选择在 AI 维护状态下先开放网站时，验证页面提示和生成接口的结构化 503；这不能替代真实 AI 会诊 SSE、绘本文本、图片和语音生成的验收。恢复 AI 前必须补做这些验证，现有手工内容与私有媒体读取可单独验收。

## 恢复与验收边界

迁移备份集中放在 `D:\codex工作备份回滚\任务备份\<时间戳>-慧育童行迁移`。恢复文件含秘密和可能的业务数据，应限制本机访问权限，不写入公开报告。

回滚先停止新入口写入并保护新库，再恢复应用镜像及解析；切换后已有新数据时不能只回 DNS。保留 MySQL、Brain 和证书卷，禁止把旧实例或旧媒体存储当作临时文件清理。

`/api/health` 中的能力标志只说明配置非空，不能代替数据库连接、真实 AI 或媒体验收。腾讯部署使用独立验收报告；未运行原正式门禁时不声明 Vercel formal gate 已通过。
