# 腾讯云生产运行与恢复说明

本说明对应 2026-10-31 的腾讯云生产部署，入口为 [www.smartchildcare.cn](https://www.smartchildcare.cn)。代码与测试范围见[本轮验收报告](tencent-final-acceptance-20261031.md)。旧 `deployment-vps.md` 描述另一台服务器的后端 staging，不作为当前生产配置来源。

## 当前发布身份

服务器为 `ubuntu@124.156.209.173`，部署目录为 `/home/ubuntu/smartchildcare`，Compose 项目名固定为 `smartchildcare-production`。主域为 `www.smartchildcare.cn`，`smartchildcare.cn` 保留路径跳转到主域；本轮更新应用时没有修改 DNS。

| 项目 | 当前已运行版本 |
| --- | --- |
| `/api/health` 的 `deployment.commitSha` | 与交付 GitHub main 同一SHA，以健康接口及本机最终交付清单核对 |
| `deploymentId` | `restoration-20261031-final` |
| web/backend 镜像 | `smartchildcare-web:restoration-20261031` / `smartchildcare-backend:restoration-20261031`；精确摘要见最终交付清单，不能单靠可变tag回滚 |
| 数据/证书卷 | 保留 `smartchildcare-production` 既有四卷，重启前后核验通过 |

镜像 ID 已与本机构建、服务器加载结果对照。标签会被下一次发布复用，因此恢复时以保存的镜像 ID 和发布记录为准。文档提交可晚于应用构建；最终交付提交由发布负责人另行记录，不能用文档 HEAD 推断线上应用版本。本说明不表示 GitHub 已推送，也不表示 Vercel formal gate 通过。

## 服务、持久卷与内存

配置来源为 [Compose](../../deploy/tencent/compose.yml) 与 [Caddyfile](../../deploy/tencent/Caddyfile)。公网只开放 Caddy 的 TCP 80/443；Next.js 3000、FastAPI 8000、MySQL 3306 通过容器内网访问。Caddy 保留 SSE 流式转发、HTTP 至 HTTPS 跳转及两个域名的自动证书续期。

| 服务 | 内存上限 | 持久化与主要限制 |
| --- | --- | --- |
| Next.js | 640 MiB | Node 22 standalone；`NODE_OPTIONS=--max-old-space-size=384` |
| FastAPI / Brain | 384 MiB | `backend_data:/data`，含 Brain SQLite |
| MySQL 8.4 | 512 MiB | `mysql_data:/var/lib/mysql`；缓冲池 128 MiB，最多 30 个连接 |
| Caddy | 64 MiB | `caddy_data:/data` 保存证书，`caddy_config:/config` 保存配置状态 |

实际卷名使用 `smartchildcare-production_` 前缀，共四个卷。保留服务器已有 Swap。应用更新不得更改 Compose 项目名或卷名，不执行 `docker compose down -v`、`docker volume prune` 或删除这些卷。私有图片、音频继续位于 Vercel Blob；不要用本机临时文件替代已经保存的 Blob 媒体。

## 运行时私有配置

服务器的 `.env` 保存镜像引用及现有 MySQL 初始化凭据；`.env.web`、`.env.backend` 在运行时注入各服务。文件权限为 `0600`，部署目录为 `0700`。Compose 的 `env_file.format: raw` 保留密钥中的特殊字符；不要用 `source` 或 `eval` 解析这些文件，不把它们放入 Git、镜像、公开报告或测试产物。

当前 MaaS 配置如下，不包含任何密钥值。Next.js 与 FastAPI 必须使用一致的 provider 和模型身份：

| 配置 / 能力 | 当前值 |
| --- | --- |
| `AI_PROVIDER` | `maas` |
| `AI_BASE_URL` | `https://maas.qianwenaiapi.com/compatible-mode/v1` |
| `AI_TEXT_MODEL`，文本 / 识图 / OCR | `qwen3.8-flash` |
| `AI_IMAGE_MODEL` | `z-image-turbo` |
| `AI_EMBEDDING_MODEL` | `qwen3.7-text-embedding-flash` |
| `AI_TTS_MODEL` | `qwen3-tts-flash` |
| `AI_ASR_MODEL` | `qwen-audio-3.0-asr-flash` |
| 图片 / TTS / ASR 协议 | `native`，使用同一网关的原生多模态接口 |

`AI_API_KEY`、数据库连接、会话密钥、Blob 凭据以及前后端共享的 `BRAIN_INTERNAL_SHARED_SECRET` 只保存在私有文件中。更新时保留数据库、Blob 和内部签名配置；不要重新初始化 MySQL 密码或生成不匹配的内部签名。代码仍支持配置 `ZHIPU/GLM-5.3-Flash`，当前真实验收使用上表 Qwen 模型，不能按代码默认值标记实际输出来源。

`qwen3-tts-flash` 每次输入最多 **600 个 Unicode 字符**，包含标点和空白，表情按 Unicode 字符计数。超过限制在发出收费请求前拒绝，保留完整原文，不静默截断。修改旁白后主动重试对应页面，不重新生成已成功的文字、图片或音频。

`AI_SERVICE_UNAVAILABLE=1` 是紧急停用开关，不能作为正常交付状态。开启后新 AI 生成返回结构化不可用状态，历史数据和私有媒体读取仍保留。恢复时先核验凭据、模型权限及受控真实调用，再更新私有配置并重建应用容器。普通读回、缓存读取和压测不应调用收费模型。

## 构建与应用更新

镜像在本机 Linux 环境构建，腾讯云只负责加载和运行。发布源为项目子目录的干净代码快照，不混入父目录旧代码、Windows 的 `node_modules`、`.next`、图片库、ZIP 或本地环境文件。两份 Dockerfile 均以项目根目录为上下文，后端需要根目录 `shared` 的月龄照护规则：

```sh
docker build -t smartchildcare-web:RELEASE .
docker build -f backend/Dockerfile -t smartchildcare-backend:RELEASE .
```

将经过测试的镜像及私有发布包传入后，先核对预期镜像 ID，再执行增量迁移和应用更新。增量镜像包依赖既有基线层，缺层时补齐文件传输并重新核验；加载失败不能作为重新生成 AI 数据的理由。

以下命令在服务器 Bash 中运行。显式固定项目、目录和配置文件，`config -q` 只校验配置，不输出展开后的密钥：

```sh
set -euo pipefail
deploy_dir=/home/ubuntu/smartchildcare
dc() {
  sudo -n docker compose --project-directory "$deploy_dir" \
    --env-file "$deploy_dir/.env" -f "$deploy_dir/compose.yml" "$@"
}
dc config -q
# 完成下节三份增量 SQL 与结构检查后更新应用，不重建数据库和证书卷。
dc up -d --no-deps backend web
dc ps
for service in backend web; do
  container_id="$(dc ps -q "$service")"
  sudo -n docker inspect --format \
    '{{.Name}} image={{.Image}} health={{.State.Health.Status}} oom={{.State.OOMKilled}} restarts={{.RestartCount}}' \
    "$container_id"
done
curl --fail --silent --show-error https://www.smartchildcare.cn/api/health
```

将健康响应中的 SHA、发布 ID、URL 与候选清单比较。能力的 `configured` 仅表示配置存在；`live` 是当前实例最近成功调用的观测，重启后可重新变为 `configured`，不能替代业务结果、模型身份和持久化验收。

## 现有数据库的增量迁移

当前保留既有 16 张业务表，新增六张独立表，共 22 张。只按以下顺序执行这三份 SQL：

1. [20261031_ai_result_cache.sql](../../supabase/sql/20261031_ai_result_cache.sql)：`ai_result_cache`。
2. [20261031_parent_courses.sql](../../supabase/sql/20261031_parent_courses.sql)：`parent_course_catalog`、`parent_course_learning_events`、`parent_course_recommendation_jobs`、`parent_course_semantic_cache`。
3. [20261031_storybook_media_receipts.sql](../../supabase/sql/20261031_storybook_media_receipts.sql)：`storybook_media_receipts`。

本轮生产迁移已连续执行两遍，并检查六张表存在。SQL 使用 `CREATE TABLE IF NOT EXISTS`，不重建、清空或覆盖原表；它也**不会修复已经存在但结构不兼容的表**。重放前须检查字段、索引与类型，遇到不一致停止并制定单独增量 ALTER。不得在生产运行 `deploy/tencent/initialize-empty-db.sh`，也不能用初始化脚本替代升级。

发布包的 `apply-incremental-migrations.sh` 会先检查现有表的必需字段，三份 SQL 执行两遍后再检查六表。无 `--apply` 时只显示计划；已审核包可执行：

```sh
bash /absolute/release-bundle/apply-incremental-migrations.sh \
  --apply /home/ubuntu/smartchildcare
```

手工执行的等价入口如下。`release_dir` 指向本次审核的发布包，其中含 `migrations/`；root 口令只由 MySQL 容器自己的环境变量读取，不打印、不放入进程 argv：

```sh
release_dir=/absolute/release-bundle
mysql_admin() {
  dc exec -T mysql sh -c \
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot --default-character-set=utf8mb4 --batch --skip-column-names childcare "$@"' \
    sh "$@"
}
mysql_admin < "$release_dir/migrations/20261031_ai_result_cache.sql"
mysql_admin < "$release_dir/migrations/20261031_parent_courses.sql"
mysql_admin < "$release_dir/migrations/20261031_storybook_media_receipts.sql"
mysql_admin -e "SELECT table_name FROM information_schema.tables WHERE table_schema='childcare' ORDER BY table_name"
```

应用账号沿用现有业务权限；结构迁移使用容器管理身份。不要为解决缺表而临时暴露数据库，或将数据库 root 连接交给 Web 服务。

## 备份与恢复点

本轮集中备份根目录为：

```text
D:\codex工作备份回滚\任务备份\20261031-154609-慧育童行功能恢复课程迁移
```

原 `production-before` 保留。正式更新前的最新备份为该目录下 `production-before-final-1945.tar.gz`；本机已逐成员读取验证 9 个归档条目，其中 SQL 为 118174 字节，SQLite 为 65536 字节且文件头正确。这是文件完整性检查，不表示已执行整库恢复演练。服务器对应暂存目录为 `/home/ubuntu/smartchildcare/backups/20261031-restoration-final-1945/`。私有配置与数据库备份包含敏感内容，不公开、不提交 Git。

后续升级先创建新的恢复点，使用数据库一致性导出和 SQLite backup API，避免直接复制运行中的 SQLite 文件。下列模板先在服务器生成受限暂存文件；随后须传回上述集中根目录的新任务子目录并核验归档，不能只保留服务器副本：

```sh
stamp="$(date -u +%Y%m%d-%H%M%S)-before-update"
backup_dir="$deploy_dir/backups/$stamp"
install -d -m 700 "$backup_dir"
cp -p "$deploy_dir/.env" "$deploy_dir/.env.web" "$deploy_dir/.env.backend" \
  "$deploy_dir/compose.yml" "$deploy_dir/Caddyfile" "$backup_dir/"
dc exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers --events childcare' \
  > "$backup_dir/database.sql"
dc exec -T backend python -c \
  "import os,sqlite3; p=os.environ.get('BRAIN_MEMORY_SQLITE_PATH','/data/agent-memory.db'); sqlite3.connect(p).backup(sqlite3.connect('/tmp/release-memory.db'))"
dc cp backend:/tmp/release-memory.db "$backup_dir/brain-memory.db"
sudo -n chown ubuntu:ubuntu "$backup_dir/brain-memory.db"
dc images --format json > "$backup_dir/images.json"
chmod 600 "$backup_dir"/*
tar -czf "$backup_dir.tar.gz" -C "$backup_dir" .
chmod 600 "$backup_dir.tar.gz"
tar -tzf "$backup_dir.tar.gz"
```

恢复前检查 SQL、SQLite、私有配置、发布身份和镜像清单属于同一恢复点。私有 Blob 不在此归档中；恢复必须保留原 Blob 存储及数据库中的授权资产引用。

## 收费任务异常与免费恢复

AI 结果缓存和媒体任务使用持久状态、owner claim 与幂等键。相同授权范围、数据版本和模型身份的已完成结果可复用；同请求处理中不并发重发。超时、响应丢失或租约到期后结果不确定会标记 `unknown`，不能通过刷新、换 requestId、删缓存、删任务或重启容器自动再付费。

`storybook_media_receipts` 保存已收到的供应商媒体回执，可能含临时签名 URL 或编码内容，必须按私有数据保护。供应商已返回成功但下载、转码或 Blob 保存失败时，恢复仅重做**已知回执对应的文件传输和持久化**，不重新请求模型。操作员先核对原 storyId、任务状态、回执和当前 SHA；先不加 `--execute` 查看计划，确认后使用免费恢复模式：

```sh
node scripts/storybook-media-real-matrix.mjs --execute --reconcile \
  --expected-commit-sha=0639de1ea870993e6a5639d9077e729fc0d273c3 \
  --manifest=/absolute/private/real-matrix.private.json \
  --progress=/absolute/private/original-storybook-progress.private.json \
  --report=/absolute/private/reconcile-report.json
```

使用原进度文件，不建立新册；更换发布版本后相应更新预期 SHA。此模式要求服务端确认 `reconcileOnly`，没有可恢复回执时停止，不提交新图像或语音请求。回执失效且无法免费取回，或原任务只有 `unknown` 而无回执时，保留证据并报告缺口，获得明确预算与重试决定后再处理。`--execute --verify-only` 用于重启后读取已有书和媒体，不调用 AI。`--execute --ai` 属于新的收费验收，不是日常恢复命令。

## 保留新写入的应用级回滚

1. 先限制新生成与写入，保存当前数据库、Brain、私有配置和任务状态的新恢复点，记录停写窗口及仍在进行的请求。不要让旧、新应用同时对不同数据库继续写入。
2. 从发布前的镜像清单取回已验证的 Web / Backend 镜像 ID，确认旧应用兼容当前增量表。保留新增六表和全部新业务数据，不执行反向删表。
3. 只更新应用镜像及必要的兼容运行时配置；MySQL 密码、数据库连接、Blob、会话和内部签名保持一致。私有文件中的三个 `DEPLOYMENT_*` 字段须同步为所恢复应用的真实发布身份，不能把旧镜像标成新 SHA。不要整包覆盖旧 `.env*`。
4. 重建 Web / Backend，读取健康身份，使用既有普通测试账号验证登录、最新记录、私有媒体和缓存读回；该阶段不为证明恢复而再次生成收费内容。
5. 确认没有 OOM、错误重启或丢写后恢复入口。当前主域指向同机，应用级回滚无需修改 DNS。

以下命令仅在填入并核验旧镜像 ID、完成配置身份更新后运行；镜像 ID 不是凭据：

```sh
: "${ROLLBACK_WEB_IMAGE:?Set a verified retained web image ID}"
: "${ROLLBACK_BACKEND_IMAGE:?Set a verified retained backend image ID}"
sudo -n docker image inspect "$ROLLBACK_WEB_IMAGE" "$ROLLBACK_BACKEND_IMAGE" \
  --format '{{.Id}}'
sudo -n env WEB_IMAGE="$ROLLBACK_WEB_IMAGE" BACKEND_IMAGE="$ROLLBACK_BACKEND_IMAGE" \
  docker compose --project-directory "$deploy_dir" --env-file "$deploy_dir/.env" \
  -f "$deploy_dir/compose.yml" up -d --no-deps backend web
dc ps
curl --fail --silent --show-error https://www.smartchildcare.cn/api/health
```

**禁止恢复旧 SQL 覆盖当前库、删除持久卷或回退 Blob 存储来处理应用故障。** 若必须进行数据恢复，先保护切换后的全部新写入，再单独设计增量合并和停写方案，避免数据分叉。生产验证与费用证据以本轮独立验收报告为准，不把腾讯云恢复结果写成原 Vercel 正式门禁结果。
