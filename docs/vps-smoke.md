# VPS Smoke Runbook

适用场景：staging 部署完成后，验证 SmartChildcare Agent 是否满足“真 staging + 真 vivo + 真 memory + 真 SSE + 真 remote proxy”。

边界：

- 不修改 consultation 的 stage 顺序和 SSE 事件名。
- 真实 `VIVO_APP_ID` / `VIVO_APP_KEY` 只允许通过环境变量注入。
- staging 对外验收只认 `/api/v1/health`，`/health` 只保留为兼容 alias。

## 1. 先看 TLS

命令：

```bash
curl -vk https://api-staging.smartchildcareagent.cn/api/v1/health
openssl s_client -connect api-staging.smartchildcareagent.cn:443 -servername api-staging.smartchildcareagent.cn
```

判读：

- 能握手并拿到 HTTP 响应，才继续后面的 smoke。
- 如果 TLS 握手失败，优先回看 Caddy logs，不要先判断 backend 已挂。

## 2. 再看 health schema

命令：

```bash
curl -fsS https://api-staging.smartchildcareagent.cn/api/v1/health
```

必须看到：

- `status=ok`
- `brain_provider` 非空
- `llm_provider_selected` 非空
- `provider_assertion_scope=configuration_only`
- `environment != development`
- `providers.llm != mock`

解释：

- `provider_assertion_scope=configuration_only` 是预期结果。
- `vivo_credentials_configured=true` 只能说明密钥存在，不能说明本次请求真的命中了 vivo。

## 3. direct vivo strict smoke

命令：

```bash
docker compose exec -T backend python /app/scripts/vivo_llm_smoke.py --strict
```

strict 通过条件：

- `brain_provider=vivo`
- `provider=vivo-llm`
- `provider_source=vivo`
- `provider_model` 非空
- `request_id` 非空
- `real_provider=true`
- `fallback=false`
- 至少一个 upstream marker 存在：`usage`、`upstream_markers.id`、`upstream_markers.created`

失败分类：

- `kind=config`：`BRAIN_PROVIDER` 或 vivo 密钥配置不完整
- `kind=auth`：vivo 鉴权失败
- `kind=network` / `kind=timeout`：到 vivo 上游的网络问题
- `kind=response`：上游返回异常或响应格式不满足 strict

## 4. consultation SSE strict smoke

命令：

```bash
docker compose exec -T backend python /app/scripts/consultation_sse_smoke.py \
  --base-url https://api-staging.smartchildcareagent.cn \
  --first-event-timeout 20 \
  --stream-timeout 45 \
  --memory-check required \
  --require-real-provider
```

transport-first 通过条件：

- 20 秒内至少收到一个 SSE 首帧

full-chain 通过条件：

- SSE 事件包含 `status` / `text` / `ui` / `done`
- stage 顺序为：
  - `long_term_profile`
  - `recent_context`
  - `current_recommendation`
- 最终输出包含：
  - `brain_provider=vivo`
  - `provider_source=vivo`
  - `provider_model` 非空
  - `request_id` 非空
  - `real_provider=true`
  - `fallback=false`
  - `transport=fastapi-brain`
  - `memory_used_sources`
  - `matched_snapshot_ids`
  - `matched_trace_ids`

失败时重点看：

- `health_issues`：health 还是旧 schema / 旧 runtime
- `first_frame_seconds`：首帧是否超过 20 秒
- `transport=next-stream-fallback`：页面跑通了，但不是远端 brain stream 真链路
- `provider_source != vivo`：不是 live vivo provider
- `real_provider=false`：provider 结果不满足真 live 判定
- `fallback=true`：走了 provider fallback 或 transport fallback
- `memory_check=absent`：没有读到连续性记忆

## 5. 聚合 smoke

命令：

```bash
BASE_URL=https://api-staging.smartchildcareagent.cn \
FIRST_EVENT_TIMEOUT=20 \
STREAM_TIMEOUT=45 \
MEMORY_CHECK=required \
REQUIRE_REAL_PROVIDER=1 \
DOCKER_SERVICE=backend \
bash scripts/vps_smoke.sh
```

汇总输出至少要看到：

- `health: pass`
- `environment: staging`
- `providers.llm` 不是 `mock`
- `brain_provider: vivo`
- `vivo_strict: real`
- `consultation_sse: pass`
- `first_frame_seconds` 不超过 `20`
- `transport: fastapi-brain`
- `provider_source: vivo`
- `fallback: false`
- `memory: present`

## 6. 人工 teacher 验证

页面：

```text
/teacher/high-risk-consultation?trace=debug
```

至少确认：

- `providerTrace.source`
- `providerTrace.transport`
- `providerTrace.model`
- `providerTrace.requestId`
- `memoryMeta.usedSources`
- `memoryMeta.matchedSnapshotIds`
- `memoryMeta.matchedTraceIds`

判读规则：

- `fastapi-brain`：远端 brain 真链路
- `next-stream-fallback`：Next 本地兜底
- `next-json-fallback`：Next JSON fallback
- 只看到结果卡片，不能当作 staging 真链路已通过

## 7. Release proxy 验收

release 环境必须配置：

```env
BRAIN_API_BASE_URL=https://api-staging.smartchildcareagent.cn
```

必须确认：

- `/api/ai/high-risk-consultation/stream` 响应头里有 `x-smartchildcare-transport=remote-brain-proxy`
- `x-smartchildcare-upstream-host=api-staging.smartchildcareagent.cn`
- debug 页面最终 `providerTrace.transport=fastapi-brain`
- 没有 `x-smartchildcare-fallback-reason`

## 8. 结论标准

只有当以下条件同时成立，才算 staging 真链路通过：

- 远端 TLS 可握手
- `https://api-staging.smartchildcareagent.cn/api/v1/health` 返回新 schema
- direct vivo strict 通过
- consultation SSE transport-first 与 full-chain 都通过
- transport 为 `fastapi-brain`
- memory check 为 `present`
- release UI 证明走的是 remote brain proxy，而不是 Next fallback
