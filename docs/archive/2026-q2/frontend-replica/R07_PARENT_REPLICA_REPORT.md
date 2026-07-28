# FRONTEND-REPLICA-R07 家长端复刻报告
生成时间：2026-05-11T16:22:50.7985461+08:00

## 复刻页面

- `/parent?child=c-1`：按家长端目标图复刻移动优先首页，保留 `useParentD01Data`、林妈妈 `u-parent` 作用域和默认孩子 `c-1`；孩子状态、饮食、健康、成长趋势、提醒、AI 今晚建议、成长照片和可点击入口均可见。
- `/parent/agent?child=c-1`：按目标图复刻家长 AI 助手表层，包含孩子上下文、趋势摘要、建议卡、对话流、输入区、语音入口、provider 状态和明确降级提示。
- `/parent/agent?child=c-1#feedback`：反馈区可通过 hash 定位，结构化反馈、附件/语音附件、消息列表、详情弹窗和提交后刷新链路可用。
- `/parent/storybook?child=c-1` 与 `/parent/storybook?child=lin-xiaoyu`：固定绘本《林小雨的一小步勇敢》标题、别名、6 页文本、真实图片、翻页、整本朗读和单页朗读控件稳定。
- `/parent/reminders?child=c-1`：提醒页使用孩子作用域数据，待办列表和确认动作可见可用，移动端底部控件不被遮挡。
- `/growth?child=c-1`：家长视角成长档案使用允许的 demo-media 真图路径，未授权孩子不会泄露数据。

## 家长 AI 助手

- AI 请求继续走服务端 `/api/ai/*` 和现有 provider 状态接口，未在前端伪造成功状态。
- 页面保留趋势图、快捷建议、输入发送、服务状态、降级提示和语音入口；本地 brain proxy 未启动时会出现 fallback 日志，但 UI 显示真实 provider/degraded 状态。
- 语音球在家长端首页、AI 页和移动端布局中保持可见可打开；未知或越权命令通过 `product:voice` 覆盖 fail-closed。

## 固定绘本

- 未修改 `lib/storybooks/lin-xiaoyu-bravery.ts` 的核心常量、标题、ID、别名、6 页内容、图片路径或 TTS fallback 路由。
- `c-1` 和 `lin-xiaoyu` 两条入口均指向同一本固定绘本；测试验证第一页图片路径仍为 `/demo-media/storybooks/lin-xiaoyu/images/page-01.webp`。
- 固定绘本 API scope 保持隔离，未生成或替换故事正文、图片或音频资产。

## 有声朗读

- 绘本朗读控件保留：整本播放/暂停、单页播放、重播和翻页后朗读状态均可见。
- 现有逻辑仍是静态 mp3 存在时优先使用；当前本地 `public/demo-media/storybooks/lin-xiaoyu/audio` 静态 mp3 不存在，因此验收覆盖 TTS 路由可返回音频或明确 `errorKind` 降级，不生成假音频。
- `product:voice` 与 R07 规格测试共同覆盖家长端语音球、文字 fallback、故事分享/导出入口和未知命令关闭边界。

## 家园沟通

- `/parent/agent#feedback` 保留结构化反馈表单、严重程度、分类、附件、语音附件、提交按钮和刷新后的消息列表。
- 提交反馈后可在消息列表中看到新增内容，并可打开详情弹窗查看标题、正文和状态。
- 反馈链路继续使用 E04 数据与现有 API，不改为纯前端假数据。

## 媒体与趋势

- 首页饮食/健康/成长趋势和提醒摘要均来自现有聚合数据，新增 R07 testid 仅用于验收定位，不改变业务数据。
- 成长档案图片只接受 `/demo-media/gpt-image2/growth/` 或 `/demo-media/growth/` 路径；`demo-media:test` 和 `growth-media:test` 均通过。
- 设计图移动端目标通过 Playwright 视口证据覆盖：390x844、941x1672、1086x1448、1448x1086，关键路由无横向溢出，底部控件不遮挡。

## 测试结果

| 命令 | 结果 |
| --- | --- |
| `npx playwright test tests/frontend-replica/parent-replica.spec.ts --config=playwright.feature.config.ts --project=chromium --reporter=line` | PASS，6 passed |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run product:api` | PASS，8 passed |
| `npm run product:ai` | PASS，live Chat/OCR/ASR passed，browser 6 passed |
| `npm run product:voice` | PASS，13 parser tests + 20 browser tests |
| `npm run product:journey` | PASS，1 passed |
| `npm run feature:smoke` | PASS |
| `npm run bugbash:smoke` | PASS |
| `npm run demo-media:test` | PASS，3 passed |
| `npm run growth-media:test` | PASS，3 passed |
| `npm run storybook:xiaoyu:test` | PASS，5 passed |
| `npx tsc --noEmit` | PASS |

## 已知说明

- 本地未启动 brain proxy `127.0.0.1:8010` 时，AI/建议接口会在日志中出现 fallback、ECONNREFUSED 或连接重置；页面保留真实 provider/degraded 状态，相关测试均通过。
- Browser skill 已读取；本次渲染证据使用项目 Playwright 配置收集，因为该配置会稳定管理 Next dev server、认证状态和测试 artifact。
- 固定绘本静态 mp3 当前不存在，本次没有生成假 mp3；朗读控件和 TTS/明确降级链路已通过 R07 与既有固定绘本测试覆盖。
