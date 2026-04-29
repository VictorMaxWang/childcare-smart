# F40 修复结果

## 分配 bugId

- BUG-002
- BUG-003
- BUG-014
- BUG-015
- BUG-016
- BUG-019
- BUG-B21-001
- BUG-B23-003
- BUG-B25-003

## 已修复 bugId

- BUG-002：家长首页 `/api/ai/suggestions` 对 child-scoped 请求增加 200 fallback，AI/会诊失败不再暴露 500。
- BUG-003：`/api/ai/parent-storybook` 在 brain 不可用、非 2xx 或非 JSON 时返回本地绘本 fallback。
- BUG-014：桌面 `/parent/agent?child=c-1#feedback` 增加渲染后重试滚动与 focus。
- BUG-015：mobile 390x844 下 `#feedback` 同样能定位到反馈区，并预留固定导航偏移。
- BUG-016：家长 follow-up route 和客户端都增加 fallback，追问失败时返回可见结果而不是页面无变化。
- BUG-019：家长端推荐文案清理 route/demoSeed/录屏/mock 等内部泄漏词。
- BUG-B21-001：普通家长入口不再自动追加 demoSeed；demo seed 请求在 storybook API 内隔离，不转发真实 brain API。
- BUG-B23-003：`/parent/storybook` 缺失或非法 child 时写回 canonical `child=c-1`。
- BUG-B25-003：反馈组件展示当前 child 姓名/班级，并在提交前校验 childId 一致。

## 未修复 bugId

- 无。

## 家长端修复摘要

- 移除 `/parent`、`/parent/agent` 成长绘本入口的默认 `demoSeed=recording-c1-bedtime`。
- `/parent/storybook` 默认关闭 demo seed，仅允许 `NEXT_PUBLIC_ENABLE_PARENT_STORYBOOK_DEMO_SEEDS=true` 且显式参数时进入隔离演示路径。
- 家长 AI suggestions、follow-up、parent-message-reflexion、parent-storybook 均补齐家长端 fallback。
- `ParentStructuredFeedbackComposer` 不再硬编码“小宇 / 小一班”，改由当前 `selectedFeed.child` 传入。
- `#feedback` 锚点增加 post-render scroll/focus retry，桌面和 mobile 均可定位。

## 林妈妈复测

- 家长首页：`/parent?child=c-1` 加载成功，URL 保持 `child=c-1`，页面显示林小雨，无 `/api/ai/*` 5xx。
- 家长反馈：`/parent/agent?child=c-1` 反馈区显示“林小雨 / 向阳班”，未出现“小宇”。
- child 参数：`/parent`、`/parent/agent`、`/parent/storybook` 均保持 `child=c-1`；`/parent/storybook?child=bad` 自动规范为 `child=c-1`。
- #feedback：桌面 scrollY=8173、feedbackTop=0、focused=true；mobile 390x844 scrollY=13756、feedbackTop=88。
- 成长绘本：`/parent/storybook?child=c-1` 加载成功，URL 无 `demoSeed`，页面无 500/503 错误文案。
- demoSeed 隔离：捕获 7 个 storybook/media 请求，正常绘本请求体未包含 `demoSeed`、`recording-c1-bedtime` 或 `parent-storybook-demo-seed`。
- follow-up：点击“今晚我应该怎么陪伴？”触发 `/api/ai/follow-up`，返回 200 并出现追问记录。
- mobile：390x844 下反馈和绘本无水平溢出，`#feedback` 可定位。

## 修改文件

- 新增：
  - `docs/bug-bash/fix-results/F40-result.md`
  - `docs/bug-bash/fix-results/F40-result.json`
- 修改：
  - `app/parent/page.tsx`
  - `app/parent/agent/page.tsx`
  - `app/parent/storybook/page.tsx`
  - `components/parent/ParentStructuredFeedbackComposer.tsx`
  - `app/api/ai/suggestions/route.ts`
  - `app/api/ai/follow-up/route.ts`
  - `app/api/ai/parent-storybook/route.ts`
  - `app/api/ai/parent-message-reflexion/route.ts`
  - `lib/agent/parent-copy.ts`

## 结果文件

- F40-result.md：已写入。
- F40-result.json：已写入。

## 检查结果

- lint：通过，`npm run lint`。
- build：通过，`npm run build`。

