# VIVO 环境变量同步指南

更新时间：2026-05-05

本指南用于把 vivo AIGC 的服务端环境变量安全配置到本地 `.env.local`、Vercel Project Environment Variables，以及可选的腾讯云 Docker 后端容器。真实 AppKEY 只能写入本地 `.env.local`、Vercel 环境变量或服务器运行环境变量。

## 变量清单

必须支持 9 个服务端变量：

```dotenv
VIVO_APP_KEY=填入重置后的新 AppKEY
VIVO_APP_ID=2026676457
VIVO_BASE_URL=https://api-ai.vivo.com.cn
VIVO_LLM_MODEL=填入 vivo 文档或控制台确认值
VIVO_OCR_PATH=/ocr/general_recognition
VIVO_ASR_PACKAGE=填入 vivo 文档或控制台确认值
VIVO_ASR_CLIENT_VERSION=填入 vivo 文档或控制台确认值
VIVO_ASR_USER_ID=填入 vivo 文档或控制台确认值
VIVO_ASR_ENGINE_ID=填入 vivo 文档或控制台确认值
```

可靠默认值仅包括 `VIVO_APP_ID=2026676457`、`VIVO_BASE_URL=https://api-ai.vivo.com.cn`、`VIVO_OCR_PATH=/ocr/general_recognition`。`VIVO_LLM_MODEL` 与 ASR 元数据必须从 vivo 控制台或官方文档确认，不要猜测。ASR 可以暂时跳过，跳过后必须显示 `ASR=missing-env`。

## 本地配置

交互式配置：

```powershell
npm run vivo:configure-local
npm run vivo:check-env
npm run product:ai
```

跳过 ASR：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configure-vivo-env-local.ps1 -UseDefaults -SkipAsr -Force
npm run vivo:check-env:partial
npm run product:ai
```

脚本会备份已存在的 `.env.local` 为 `.env.local.backup.YYYYMMDD-HHMMSS`，并拒绝 `NEXT_PUBLIC_VIVO_*`。

## Vercel 配置

Vercel 控制台路径：

1. Vercel Project -> Settings -> Environment Variables。
2. 添加 9 个 `VIVO_*` 变量。
3. 勾选 Production、Preview、Development。
4. 不要添加任何 `NEXT_PUBLIC_VIVO_*`。
5. 配置后必须 redeploy。

Vercel CLI 脚本：

```powershell
npm run vivo:configure-vercel
```

脚本会检查 `vercel --version`、`vercel whoami`、`.vercel/project.json`。当前本机状态是 Vercel CLI `MISSING` 且项目未 link，因此脚本会生成手动清单：`artifacts/product-completion/R04/vercel-env-manual-checklist.md`。

如果变量已存在，非 `-Force` 模式会要求明确覆盖确认；`-Force` 会删除后重建。变量值通过 stdin 传递，不作为命令行参数。

## 腾讯云 Docker 配置

已知容器：

- `childcare-smart-backend-staging`
- `smartchildcare-backend-staging`
- `smartchildcare-caddy-staging`，仅为 Caddy 代理容器

检查命令：

```bash
bash scripts/check-vivo-env-tencent-docker.sh
```

检查指定容器：

```bash
bash scripts/check-vivo-env-tencent-docker.sh childcare-smart-backend-staging smartchildcare-backend-staging
```

脚本只输出 `SET` / `MISSING` / `ready` / `missing-env` 类状态，不打印真实值，不重启容器。Docker 容器 env 不能直接在线修改；如果后端也调用 vivo，需要更新 compose/env 文件并有计划地重建容器。

`www.smartchildcare.cn/api/ai/provider-status` 由 Vercel Next 响应，所以 Vercel env 是 Next `/api/ai/*` 的主阻塞项。腾讯云 Docker env 只影响后端容器直接调用 vivo 的场景。

## 安全要求

- 不要使用 `NEXT_PUBLIC_VIVO_*`。
- 不要提交 `.env.local`。
- 不要打印 AppKEY、token、signature 或 secret。
- 不要把真实 key 写入 docs、README、测试 fixture、快照、报告或聊天。
- 如果 AppKEY 曾经出现在聊天、日志、截图或工单中，必须视为泄露；请在 vivo 控制台重置 AppKEY，并只使用新 AppKEY 配置本地和 Vercel。
