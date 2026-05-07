# M00 演示问题总控与线上现状诊断

生成时间：2026-05-07

## 结论摘要

- GPT Image 2 真图不存在：`public/demo-media/gpt-image2/` 不存在，真实图片计数为 0。
- 当前图片链路只是 fallback：`public/demo-media/manifest.json` 只有 placeholder 资产，饮食、健康材料、成长记录、成长绘本都使用 SVG fallback。
- GPT Image 2 prompt pack 已生成，但尚未提供和接入真实图片。
- 本地 seed/API 数据满足 D-SEED 目标：园长 36 名幼儿，李老师 18 名幼儿，周老师 18 名幼儿。
- 教师端饮食记录入口存在，`/diet` 会按教师班级作用域过滤幼儿和饮食记录。
- 线上看到 11 人或饮食数据不完整，首要怀疑是浏览器 `localStorage` 旧 demo snapshot 未被 AppProvider 读缓存路径迁移修复；其次才是“在园人数”和“班级总人数”的展示理解差异。
- 当前 D-SEED 大概率已部署到 Vercel；如果执行 M01 修复 seed 迁移，修复后仍需重新部署。

## 图片问题诊断

### 文件与目录状态

- `public/demo-media/gpt-image2/`：不存在。
- GPT Image 2 图片数量：0。
- `public/demo-media/` 当前只包含 fallback SVG 和 `manifest.json`：
  - `growth/demo-growth-placeholder.svg`
  - `health-materials/demo-health-material-placeholder.svg`
  - `meals/demo-meal-placeholder.svg`
  - `placeholders/demo-placeholder.svg`
  - `storybooks/demo-storybook-placeholder.svg`
  - `manifest.json`

### Manifest 状态

`public/demo-media/manifest.json` 当前记录 4 个资产，均为 placeholder：

- meal placeholder
- health-material placeholder
- growth placeholder
- storybook placeholder

manifest 中没有 `/demo-media/gpt-image2/` 引用，因此页面不可能显示真实 GPT Image 2 图片。

### Seed 与页面行为

`lib/demo-data/seed.ts` 中的 `DEMO_MEDIA` 明确指向 fallback SVG：

- 饮食记录：`/demo-media/meals/demo-meal-placeholder.svg`
- 健康材料：`/demo-media/health-materials/demo-health-material-placeholder.svg`
- 成长记录：`/demo-media/growth/demo-growth-placeholder.svg`
- 成长绘本：`/demo-media/storybooks/demo-storybook-placeholder.svg`

饮食页 `app/diet/page.tsx` 使用记录中的 `photoUrls` 渲染图片，因此当前页面是在正确显示 fallback，而不是已经接入真实图后显示失败。

### 诊断计数

- 饮食记录总数：1008。
- meal media refs：2016，全部 placeholder，GPT Image 2 refs 为 0。
- health material media refs：36，全部 placeholder，GPT Image 2 refs 为 0。
- growth media refs：432，全部 placeholder，GPT Image 2 refs 为 0。
- storybook media refs：576，全部 placeholder，GPT Image 2 refs 为 0。
- 成长绘本数量：36。

结论：图片问题不是页面渲染或 vivo provider 问题，而是当前仓库只提交了占位图。需要先执行 M02 生成真实 GPT Image 2 出图交付包，再执行 M03 接入。

## 教师端饮食问题诊断

### Seed 计数

- 园长可见幼儿数：36。
- 李老师可见幼儿数：18。
- 周老师可见幼儿数：18。
- 李老师饮食记录数：504。
- 周老师饮食记录数：504。

504 条饮食记录对应：18 名幼儿 * 7 天 * 4 餐次。

### 页面入口与作用域

教师端存在饮食记录入口：

- `components/teacher/TeacherWorkbenchPage.tsx` 中有多个 `/diet` 入口。
- `app/teacher/agent/page.tsx` 中也有 `/diet` 快捷入口。

`app/diet/page.tsx` 使用 `visibleChildren`、`presentChildren`、`mealRecords`，并按当前用户角色和班级过滤可见饮食记录。教师角色理论上只能看到对应班级的 18 名幼儿及对应饮食数据。

### 疑似根因

本地 fresh seed 和 API 侧数据是正确的；线上如果仍显示 11 人或饮食数据不完整，更可能来自浏览器旧缓存：

- `lib/demo-data/persistence.ts` 有 D-SEED baseline 修复逻辑。
- `lib/store.tsx` 的 AppProvider 本地缓存读取路径使用自己的 `readScopedSnapshot()`。
- 该路径没有覆盖 `mergeDSeedBaseline` 的旧 D-SEED 修复。
- 如果浏览器中已有旧 namespace 下的 11 人 snapshot，AppProvider 可能优先读旧 snapshot。
- 教师作用域合并时又会基于当前旧 snapshot 计算授权幼儿 ID，导致 fresh API snapshot 不能完整补回 18 人。

另一个需要排除的展示误解是：教师端部分指标显示的是 `presentChildren.length`，即“今日出勤/在园人数”，不是班级总人数。不过当前 seed 的出勤数据应支持教师今日在园 18 人，因此线上 11 人仍优先怀疑旧本地缓存。

## 线上部署诊断

### Git 状态

- 最新本地提交：`09d82df6019c959ee365408302798fb0551190f2`
- 提交标题：`stabilize demo accounts and seed data`
- 本地 `main` 与 `origin/main` 一致。
- 诊断前后 `git status --short` 均为空，工作区干净。

### Vercel 状态

`npx vercel inspect https://www.smartchildcare.cn` 显示：

- deployment：`childcare-smart-31a5dw590-victormaxwangs-projects.vercel.app`
- deployment id：`dpl_39i5r4ARWf28GvNEnSuYX9pKTL3C`
- target：production
- status：READY
- created：2026-05-07 10:49:49 +08:00
- aliases 包含：`www.smartchildcare.cn`、`smartchildcare.cn`、`childcare-smart.vercel.app`、`childcare-smart-git-main-victormaxwangs-projects.vercel.app`

Vercel inspect 未暴露 git SHA，但生产部署创建时间晚于最新提交时间 2026-05-07 10:49:27 +08:00，并且 main 分支别名指向该部署。因此当前 D-SEED 大概率已经部署。

直接访问线上 `/demo-media/manifest.json` 和 placeholder SVG 会被重定向到 `/login`。这说明未登录静态资源探测不能直接证明资产内容；但仓库和构建产物层面已经确认当前没有 GPT Image 2 真图。

## 已运行检查

- `git status --short`：通过，最终为空。
- `git log -1 --oneline`：`09d82df stabilize demo accounts and seed data`。
- `npm run lint`：通过。
- `npm run build`：通过。
- `npm run product:smoke`：通过。
- `npm run product:journey`：通过。
- `npm run feature:smoke`：通过。
- `npm run bugbash:smoke`：通过。
- `npx tsc --noEmit`：通过。

## 任务分派建议

1. M01：先修教师饮食和 seed 迁移。
   - 在 AppProvider/localStorage 读缓存路径补齐 D-SEED stale snapshot 自动迁移或版本化清理。
   - 验证旧 11 人 snapshot 能自动恢复到李老师 18 人、周老师 18 人、园长 36 人。
   - 验证 `/teacher` 快捷入口和 `/diet` 教师视角饮食记录一致。

2. M02：生成 GPT Image 2 出图交付包。
   - 使用现有 `docs/demo-media/GPT_IMAGE2_ASSET_PROMPTS.md`。
   - 生成 meal、health-material、growth、storybook 四类真实图片。
   - 输出命名、尺寸、用途和版权安全说明。

3. M03：图片完成后接入真实图。
   - 新增 `public/demo-media/gpt-image2/` 图片资产。
   - 更新 `public/demo-media/manifest.json`。
   - 更新 seed/media refs，使页面优先显示真实图并保留 fallback。
