# F60 Fix CSS Assets Responsive

你现在执行 F60：样式、资源、响应式、裁剪资产修复。

## 必修 bugId

- `BUG-004`
- `BUG-020`
- `BUG-021`
- `BUG-B11-004`
- `BUG-B24-001`
- `BUG-B24-002`
- `BUG-B24-003`

只处理 F60 分配 bugId。`BUG-B12-002` 是 `BUG-004` 的 duplicate 证据，不作为独立修复项。

## 读取

- `docs/bug-bash/BUG_FIX_PLAN.md`
- `docs/bug-bash/FIX_THREAD_MATRIX.md`
- `docs/bug-bash/BUGS.md`
- `artifacts/bug-bash/B10/b10-smoke-results.json`
- `artifacts/bug-bash/B11/B11-responsive-results.json`
- `artifacts/bug-bash/B14/candidate-bugs.json`
- `artifacts/bug-bash/B24/css-assets-responsive-scan.md`
- `package.json`

## 修复范围

- Recharts container stable dimensions for `/health` and `/growth`.
- Parent storybook mobile bottom navigation and summary overlap.
- Tablet parent feedback bottom-nav overlap.
- Director mobile table readability.
- Login mobile desktop-image unnecessary download.
- Storybook image eager/lazy loading strategy.
- Runtime/public Windows absolute source path leakage and pixel asset path hygiene.

## 约束

- F60 必须串行执行，在 F50 完成后开始。
- 不要直接修改 `BUGS.md` 或 `BUGS.json`；结果交给 F90 合并。
- 不要 introduce one-note color rewrites or unrelated visual redesigns.
- 如果修改 asset extraction scripts or public manifests, record whether generated artifacts must be refreshed.

## 验证

- 用 Browser Use 或 Playwright 覆盖 mobile 390x844、small mobile 360x740、tablet 768x1024 and desktop where relevant.
- Verify no document-level horizontal overflow on checked routes.
- Verify mobile `/login` does not load the desktop-only large image.
- Verify no public/runtime file exposes `C:\Users\12804\Desktop\childcare-smart源代码\前端重构`.
- Verify Recharts warnings no longer appear on normal `/health` and `/growth` navigation.
- Run necessary checks.

## 输出

- 写入 `docs/bug-bash/fix-results/F60-result.md`。
- 写入 `docs/bug-bash/fix-results/F60-result.json`。
- JSON 至少包含 `threadId`、`bugIds`、`statusByBugId`、`changedFiles`、`checksRun`、`browserOrPlaywrightEvidence`、`unfixedReasons`、`conflictRisks`。
