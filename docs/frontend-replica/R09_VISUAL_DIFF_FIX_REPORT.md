# FRONTEND-REPLICA-R09 视觉差异修复报告

生成时间：2026-05-12

## 对照范围

- PAGE_SPEC 对照项：247
- 当前截图唯一页面状态：53
- 当前截图成功：247
- 当前截图失败：0
- 目标图归一化与 diff：247
- skipped：0
- viewport：mobile 390x844（87）、tablet 768x1024（51）、desktop 1440x900（109）
- 覆盖角色/页面：登录页、园长端、教师端、家长端、AI 助手、图表/报表、固定绘本、mobile/tablet/desktop

## Diff 摘要

- 最终平均视觉贴近度：76.95
- P0：131 项，平均 79.67，最低 23.00
- P1：61 项，平均 75.70，最低 6.13
- P2：55 项，平均 71.88，最低 16.57
- desktop：109 项，平均 76.13
- mobile：87 项，平均 74.86
- tablet：51 项，平均 82.29

## 主要差异

- `/admin` 的若干目标图是删除确认、权限态、弹窗叠层或不同信息架构，当前路由可触达状态主要是园长工作台和反馈详情弹窗，低分项集中在这些 route/spec 语义不完全一致的截图。
- `/login` 注册目标更偏“普通账号/验证码/身份选择”表单，当前实现是机构/家长注册流程，弹窗层级已对齐但字段结构仍不同。
- 部分 `/children` PAGE_SPEC 实际目标是餐食/批量确认界面，当前 route map 仍落到儿童档案页，因此出现结构级差异。
- mobile 目标存在普通 dashboard、侧边菜单打开、权限提示等多种状态；已补充精确状态捕获，但仍有素材密度、顶部信息块与卡片节奏差异。
- 图表/AI 面板整体可用并接近，但精确图表造型、空白节奏、文案密度和 provider fallback 展示仍与目标图存在差距。

## 已修复差异

- 新增 `tests/frontend-replica/visual-capture.spec.ts`，按全部 PAGE_SPECS 解析 route/query/hash、priority、viewport、role，并输出 current manifest 与截图。
- 新增 `scripts/frontend-replica-visual-diff.mjs`，读取设计 PNG，按当前截图尺寸 top-aligned cover 归一化 target，并生成 pixelmatch diff、JSON 和 `VISUAL_DIFF_REPORT.md`。
- 登录注册弹窗、儿童归档确认、园长反馈弹窗、指定 mobile drawer 状态已纳入 capture state，减少“默认页面对弹窗设计图”的错误对照。
- 收紧 mobile 园长页面和 topbar 的首屏 spacing/header/actions/card padding，使 390x844 下更接近目标的信息密度。
- Playwright product/feature/bugbash webServer 命令改为直接启动 Next CLI，减少 Windows 上 npm wrapper 子进程导致的测试退出不稳定。

## 剩余差异

- Route map 中仍有少量目标图与实际路由状态不是一一对应，例如 `/admin` 删除确认类目标、`/children` 餐食类目标。
- 登录注册业务表单与目标图账号注册字段不同，未为了视觉分数改动业务流程。
- mobile dashboard 的插画/媒体、侧边抽屉内容密度、个别权限态仍与目标图有差异。
- chart 精确配色、线条形态、图例位置和卡片阴影仍是 P1/P2 可继续细调项。
- AI 面板在真实 provider/fallback 状态下与静态设计目标仍有文案和状态块差异。

## 验收结果

- `npm run lint`：通过
- `npm run build`：通过
- `npm run product:ai`：通过；沙箱网络首次阻断 provider，按权限规则以外部网络重跑后 vivo chat/OCR/ASR live-pass，6 条 Playwright 通过
- `npm run product:voice`：通过；使用项目支持的 `PRODUCT_SKIP_WEBSERVER=1` 外部本地服务模式避免 Windows 托管 dev server 退出挂起，13 条 parser + 20 条 Playwright 通过
- `npm run product:journey`：通过；外部本地服务模式，1 条 Playwright 通过
- `npm run feature:smoke`：通过；外部本地服务模式，19 条 Playwright 通过
- `npm run bugbash:smoke`：通过；沙箱网络首次产生 503/ERR_NETWORK_ACCESS_DENIED，按权限规则重跑后 B26 `ok: true`、issueCount 0
- `npm run demo-media:test`：通过；3 条 Playwright 通过
- `npm run growth-media:test`：通过；3 条 Playwright 通过
- `npx tsc --noEmit`：通过
- R09 capture：通过；247/247，0 failure
- R09 diff：通过；247 compared，0 skipped，平均视觉贴近度 76.95

## Commit / Push

- Commit message：`fix visual gaps against frontend design targets`
- Commit hash：待提交后在最终回复中记录
- Push：待提交后在最终回复中记录
