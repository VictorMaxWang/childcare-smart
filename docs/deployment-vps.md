# SmartChildcare Agent 腾讯云香港 VPS Staging 部署与修复 Runbook

本文件只覆盖 S1 范围：

- 服务器：腾讯云香港轻量服务器 Linux VPS
- 公网 IP：`150.109.77.178`
- 域名：`api-staging.smartchildcareagent.cn`
- 拓扑：[`docker-compose.yml`](C:/Users/12804/Desktop/smartchildcare-agent/childcare-smart/docker-compose.yml) + [`Caddyfile`](C:/Users/12804/Desktop/smartchildcare-agent/childcare-smart/Caddyfile)
- 前端：继续部署在 Vercel 或现有前端平台，通过 `BRAIN_API_BASE_URL` 走 remote brain proxy

边界：

- 不修改 consultation 叙事逻辑。
- 不修改 SSE 事件名、阶段顺序、业务 contract。
- 不在任何代码、文档、日志、截图、示例里写入真实 `VIVO_APP_ID` / `VIVO_APP_KEY`。
- 凡是涉及 vivo 接入事实，以 [vivo 官方文档](https://aigc.vivo.com.cn/#/document/index?id=1746) 为准。

## 1. 目标状态

S1 完成时必须同时满足：

1. `https://api-staging.smartchildcareagent.cn/api/v1/health` TLS 正常。
2. 外部 health 返回当前仓库的新 schema。
3. health 不再暴露明显旧环境特征：
   - `environment=development`
   - `providers.llm=mock`
4. raw consultation SSE 在 20 秒内至少收到首帧，最终走到 `done`。
5. 前端 release debug 页面能证明请求真的走了 remote brain proxy，而不是 Next fallback。

## 2. 服务器准备

部署前确认：

- 可以 SSH 登录服务器。
- 安全组或防火墙已开放 `22`、`80`、`443`。
- 服务器已安装 Docker 与 Docker Compose。
- 仓库实际工作根目录为 `childcare-smart/`。

基础检查：

```bash
docker --version
docker compose version
```

SSH 示例：

```bash
ssh root@150.109.77.178
```

或：

```bash
ssh ubuntu@150.109.77.178
```

## 3. 域名与入口原则

DNS 必须满足：

- `api-staging.smartchildcareagent.cn -> 150.109.77.178`

入口原则：

- `http://150.109.77.178` 只用于临时排障。
- 所有 release / staging 正式联调都只认域名，不认 IP。
- 前端服务端桥接只认：

```env
BRAIN_API_BASE_URL=https://api-staging.smartchildcareagent.cn
```

## 4. 服务器 `.env.release`

部署目录示例：

```bash
mkdir -p ~/apps
cd ~/apps
git clone <your-repo-url> smartchildcare-agent
cd smartchildcare-agent/childcare-smart
```

本轮 compose 只读取根目录 `.env.release`：

- 使用：`./.env.release`
- 不使用：`backend/.env.release`

首次部署：

```bash
cp .env.release.example .env.release
vim .env.release
```

至少要确认这些值是 staging 真实值，而不是默认占位：

```env
ENVIRONMENT=staging
ENABLE_MOCK_PROVIDER=false
BRAIN_PROVIDER=vivo
BRAIN_API_BASE_URL=https://api-staging.smartchildcareagent.cn
BRAIN_API_TIMEOUT_MS=45000
BRAIN_TIMEOUT_MS=45000
REQUEST_TIMEOUT_SECONDS=45
ALLOW_ORIGINS=https://<real-release-domain>,https://<real-preview-domain>
VIVO_APP_ID=replace-on-server-only
VIVO_APP_KEY=replace-on-server-only
```

说明：

- `ALLOW_ORIGINS` 必须改成真实前端域名，不能原样保留示例占位。
- 真实 vivo 密钥只允许存在于服务器本地 `.env.release`。
- 不要把 `.env.release` 提交到 git。

## 5. 先定位，再修复

不要先 `docker compose down && up`。先确认你改的是对的目录、对的 compose、对的 Caddy 配置。

### 5.1 目录、版本、配置指纹

```bash
cd ~/apps/smartchildcare-agent/childcare-smart
pwd
git rev-parse HEAD
sha256sum Caddyfile docker-compose.yml .env.release
docker compose config
```

如果这里的路径、SHA、compose 展开结果不符合预期，先修目录和版本，不要继续。

### 5.2 当前运行中的容器

```bash
docker compose ps
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
```

预期至少看到：

- `smartchildcare-backend-staging`
- `smartchildcare-caddy-staging`

### 5.3 backend 内部 health

先验证容器内 backend 是不是新代码：

```bash
docker compose exec backend python - <<'PY'
import json, urllib.request
payload = json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=5))
print(json.dumps(payload, ensure_ascii=False, indent=2))
PY
```

必须满足：

- `status == ok`
- `provider_assertion_scope == "configuration_only"`
- `brain_provider` 非空
- `llm_provider_selected` 非空
- `environment != "development"`
- `providers.llm != "mock"`

再确认 env 真的是 staging：

```bash
docker compose exec backend sh -lc 'printenv | egrep "^(ENVIRONMENT|BRAIN_PROVIDER|ENABLE_MOCK_PROVIDER|ALLOW_ORIGINS|BRAIN_MEMORY_BACKEND|BRAIN_API_BASE_URL)="'
```

如果这里已经不对，优先修 `.env.release` 或 backend 容器，不要先怪 TLS。

### 5.4 Caddy 实载配置

确认远端运行中的 Caddy 真加载了当前文件：

```bash
docker compose exec caddy sh -lc 'cat /etc/caddy/Caddyfile'
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
docker compose exec caddy caddy adapt --config /etc/caddy/Caddyfile --pretty
```

至少确认：

- host matcher 是 `api-staging.smartchildcareagent.cn`
- `flush_interval -1` 仍在
- 响应头里有 `X-SmartChildcare-Gateway: caddy-staging-s1`
- SSE 路径有 `X-SmartChildcare-SSE: unbuffered`

### 5.5 backend / caddy 日志

```bash
docker compose logs --tail=200 backend
docker compose logs --tail=200 caddy
```

重点看：

- backend startup 日志里的 `environment` / `llm_provider` / `configured_memory_backend`
- caddy 的 ACME、certificate、handshake、reload 错误

如果 Caddy 日志显示证书申请失败或 storage/cert 错误，先修证书链路；不要盲删 Caddy 数据目录。

## 6. TLS 与外部 health 排查

### 6.1 TLS 握手

```bash
curl -vk https://api-staging.smartchildcareagent.cn/api/v1/health
openssl s_client -connect api-staging.smartchildcareagent.cn:443 -servername api-staging.smartchildcareagent.cn
```

如果 443 握手失败：

- 先看 `docker compose logs caddy`
- 再看 DNS / 防火墙 / ACME
- 只有在日志明确显示证书状态损坏时，才考虑备份后清理 Caddy 证书状态

### 6.2 外部 health

```bash
curl -fsS https://api-staging.smartchildcareagent.cn/api/v1/health
curl -fsS http://150.109.77.178/api/v1/health
```

判读规则：

- 域名 health 是 staging 正式准入标准。
- IP health 只用于判断“是不是还有旧 runtime 在跑”。
- 如果域名 TLS 坏、IP health 还是旧 schema，优先怀疑旧 backend/旧 compose + 坏 Caddy 并存。

## 7. consultation SSE 验证

### 7.1 聚合 smoke

优先跑仓库自带聚合 smoke：

```bash
BASE_URL=https://api-staging.smartchildcareagent.cn \
FIRST_EVENT_TIMEOUT=20 \
STREAM_TIMEOUT=45 \
MEMORY_CHECK=required \
REQUIRE_REAL_PROVIDER=1 \
DOCKER_SERVICE=backend \
bash scripts/vps_smoke.sh
```

必须关注：

- `health`
- `environment`
- `providers.llm`
- `brain_provider`
- `first_frame_seconds`
- `first_event_seconds`
- `transport`
- `provider_source`
- `fallback`
- `memory`

### 7.2 raw SSE

```bash
curl -N -H "Accept: text/event-stream" -H "Content-Type: application/json" \
  -X POST https://api-staging.smartchildcareagent.cn/api/v1/agents/consultations/high-risk/stream \
  -d '{
    "targetChildId":"stage-demo-child",
    "teacherNote":"S1 staging SSE verification",
    "currentUser":{"id":"teacher-stage","name":"Stage Teacher","className":"Sunshine"},
    "visibleChildren":[{"id":"stage-demo-child","name":"Stage Demo Child"}],
    "presentChildren":[{"id":"stage-demo-child","name":"Stage Demo Child"}],
    "healthCheckRecords":[],
    "growthRecords":[],
    "guardianFeedbacks":[],
    "debugMemory":true
  }'
```

通过条件：

- 20 秒内至少收到一个 SSE 首帧
- stage 顺序仍是：
  - `long_term_profile`
  - `recent_context`
  - `current_recommendation`
- 最终 `done` 里看到：
  - `transport=fastapi-brain`
  - `provider_source=vivo`
  - `realProvider=true`
  - `fallback=false`

## 8. 修复顺序

只有在 5~7 步已经确认问题后，再按这个顺序修：

### 8.1 修 backend

```bash
cd ~/apps/smartchildcare-agent/childcare-smart
git pull --ff-only
docker compose build --no-cache backend
docker compose up -d backend
```

立即复验：

```bash
docker compose exec backend python - <<'PY'
import json, urllib.request
payload = json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=5))
assert payload['status'] == 'ok'
assert payload['environment'] != 'development'
assert payload['provider_assertion_scope'] == 'configuration_only'
assert payload['brain_provider']
assert payload['llm_provider_selected']
print(json.dumps(payload, ensure_ascii=False, indent=2))
PY
```

### 8.2 再修 Caddy

```bash
docker compose up -d --force-recreate caddy
docker compose logs --tail=200 caddy
curl -vk https://api-staging.smartchildcareagent.cn/api/v1/health
```

### 8.3 最后复验 SSE 与前端 proxy

```bash
bash scripts/vps_smoke.sh
```

再做 release debug 页面人工验收。

## 9. 前端 release remote brain proxy 验收

release 环境至少要有：

```env
BRAIN_API_BASE_URL=https://api-staging.smartchildcareagent.cn
```

打开：

```text
/teacher/high-risk-consultation?trace=debug
```

必须同时确认：

- Next `/api/ai/high-risk-consultation/stream` 响应头里有：
  - `x-smartchildcare-transport: remote-brain-proxy`
  - `x-smartchildcare-upstream-host: api-staging.smartchildcareagent.cn`
- 页面 debug 卡里最终是：
  - `providerTrace.transport=fastapi-brain`
  - `providerTrace.source=vivo`
  - `realProvider=true`
  - `fallback=false`

如果看到：

- `next-json-fallback`
- `next-stream-fallback`
- `x-smartchildcare-fallback-reason`

则判定 release 仍未真正走 remote brain proxy。

## 10. 严格警告

- 不要因为 TLS 坏了就先删 Caddy 的 `/data` 或证书状态。
- 只有在日志明确证明证书状态损坏时，才允许先备份再清理。
- 默认优先顺序永远是：
  - 目录与版本
  - compose 展开
  - backend 内部 health
  - Caddy 实载配置
  - TLS
  - 外部 health
  - raw SSE
  - release proxy
