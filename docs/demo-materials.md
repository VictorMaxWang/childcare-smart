# 演示素材生成说明

更新基准：`2026-05-31`

`demo:materials` 用于把答辩截图、系统导览、工程证明和录屏分镜统一收束到 `artifacts/demo-materials/`。

## 命令

```powershell
npm run demo:materials
npm run demo:materials:capture
npm run demo:video-storyboard
```

## 默认行为

- `npm run demo:materials`：打包已有 `artifacts/ui-screenshots/`、`public/demo/system-tour/`、`artifacts/demo-preflight-report.json` 和系统架构 PNG，不主动重新采集页面。
- `npm run demo:materials:capture`：重新生成系统导览图，执行 `capture:ui`，并以 `DEMO_PREFLIGHT_SCREENSHOTS=1` 运行 `demo:preflight`。
- `npm run demo:video-storyboard`：只更新 `artifacts/demo-materials/video-storyboard.md`。

## 输出

- `README.md`：素材包说明。
- `manifest.json`：素材来源、生成时间、route plan 和缺失项。
- `defense-screenshot-checklist.md`：下一阶段答辩截图清单。
- `video-storyboard.md`：3 分钟答辩录屏分镜。
- `screenshots/`：答辩截图候选。
- `system-tour/`：系统导览 PDF 与关键页面图片。
- `engineering-proof/`：provider/preflight/manifest/架构图等工程证明。

## 环境变量

- `DEMO_MATERIALS_BASE_URL`：目标站点，默认 `https://www.smartchildcare.cn`。
- `DEMO_MATERIALS_ACCOUNT`：录屏说明中的演示账号备注。
- `DEMO_MATERIALS_CAPTURE=1`：重新执行 UI 截图。
- `DEMO_MATERIALS_PREFLIGHT=1`：重新执行 demo preflight，自动开启成功截图。
- `DEMO_MATERIALS_SYSTEM_TOUR=1`：重新生成系统导览图片。
