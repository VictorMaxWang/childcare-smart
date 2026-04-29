# Bug Bash Bug Ledger

Updated: 2026-04-29

All bug bash threads must write every confirmed or suspected issue here and mirror the same entry in `BUGS.json`.

## Canonical Fields

Every bug entry must use exactly these fields:

- `bugId`
- `title`
- `severity`: `P0 | P1 | P2 | P3 | P4`
- `status`: `open | confirmed | duplicate | fixed | wontfix | needs-info`
- `foundByThread`
- `role`: `login | director | teacher | parent | shared | unknown`
- `demoAccount`: `闄堝洯闀?| 鏉庤€佸笀 | 鍛ㄨ€佸笀 | 鏋楀濡?| none`
- `route`
- `viewport`: `desktop | tablet | mobile | unknown`
- `browser`
- `reproSteps`
- `expected`
- `actual`
- `consoleErrors`
- `networkErrors`
- `screenshotBefore`
- `screenshotAfter`
- `videoOrTrace`
- `sourceFilesSuspected`
- `likelyCause`
- `suggestedFix`
- `ownerSuggested`
- `blocksRelease`: `true | false`
- `notes`

## Initial Baseline

- `npm run lint`: passed on 2026-04-29.
- `npm run build`: passed on 2026-04-29.
- No P0 startup, lint, or build bug is recorded at B00 initialization.

## Entry Template

```md
### BUG-000

- bugId:
- title:
- severity:
- status:
- foundByThread:
- role:
- demoAccount:
- route:
- viewport:
- browser:
- reproSteps:
- expected:
- actual:
- consoleErrors:
- networkErrors:
- screenshotBefore:
- screenshotAfter:
- videoOrTrace:
- sourceFilesSuspected:
- likelyCause:
- suggestedFix:
- ownerSuggested:
- blocksRelease:
- notes:
```

## Bugs

### BUG-B12-001

- bugId: BUG-B12-001
- title: 鏁欏笀宸ヤ綔鍙扳€滀粖鏃ュ緟鍔炩€濅换鍔¤鍛堢幇涓哄彲鐐瑰嚮浣嗙偣鍑绘棤鍙嶉
- severity: P2
- status: confirmed
- foundByThread: B12
- role: teacher
- demoAccount: 鏉庤€佸笀锛涘懆鑰佸笀
- route: /teacher
- viewport: desktop
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Open `http://localhost:3000/login`; click demo account `鏉庤€佸笀`; wait for `/teacher`; in the `浠婃棩寰呭姙` card click the checkbox-like square or the `鏅ㄦ鐧昏` task row; repeat visual comparison with `鍛ㄨ€佸笀`.
- expected: 浠婃棩浠诲姟濡傛灉鍙搷浣滐紝搴旀墦寮€瀵瑰簲浠诲姟/璁板綍鍏ュ彛銆佹洿鏂扮姸鎬佹垨缁欏嚭鍙嶉锛涘鏋滃彧鏄睍绀猴紝搴旀槑纭爣璇嗕负浠呭睍绀哄苟閬垮厤 checkbox-like 鍙偣鍑绘殫绀恒€?- actual: 娴忚鍣ㄧ偣鍑诲懡涓换鍔¤锛屼絾 URL 浠嶄负 `/teacher`锛岄〉闈富浣撴棤鍙樺寲锛屾棤寮圭獥銆乼oast銆佸嬀閫夌姸鎬佹垨瀵艰埅鍙嶉锛涘悓涓€宸ヤ綔鍙扮粍浠跺湪鍛ㄨ€佸笀璐﹀彿涓嬩篃鍛堢幇鐩稿悓浜や簰鏆楃ず銆?- consoleErrors: No task-click-specific console error. Session also logged an unauthenticated `/api/auth/session` 401 before login and a Next.js scroll-behavior warning.
- networkErrors: No task-click-specific network error. Initial unauthenticated `GET /api/auth/session` -> 401 was observed before login.
- screenshotBefore: artifacts/bug-bash/B12/BUG-B12-001-before-task-row.png
- screenshotAfter: artifacts/bug-bash/B12/BUG-B12-001-after-task-row.png
- videoOrTrace: artifacts/bug-bash/B12/targeted-checks.json
- sourceFilesSuspected: components/teacher/TeacherWorkbenchPage.tsx; components/teacher/TeacherPixelReplicaPrimitives.tsx
- likelyCause: `PixelTaskRow` renders a static row with a checkbox-like marker but no link/button/onClick behavior and no display-only label.
- suggestedFix: Convert task rows to real buttons/links for the relevant teacher routes, or restyle and label them as non-interactive display rows.
- ownerSuggested: teacher/workbench
- blocksRelease: false
- notes: Targeted check captured before/after screenshots; `beforeUrl` and `afterUrl` both stayed `http://localhost:3000/teacher`, and body text was unchanged after click.

### BUG-B12-002

- bugId: BUG-B12-002
- title: 鏅ㄦ/鎴愰暱璁板綍椤甸潰姝ｅ父瀵艰埅鏃跺弽澶嶈緭鍑?Recharts 灏哄 warning
- severity: P3
- status: confirmed
- foundByThread: B12
- role: teacher
- demoAccount: 鏉庤€佸笀锛涘懆鑰佸笀
- route: /health; /growth
- viewport: desktop
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Open `http://localhost:3000/login`; click demo account `鏉庤€佸笀`; navigate to `/health`; then navigate to `/growth`; repeat the same core route check with `鍛ㄨ€佸笀`; inspect browser console during page render.
- expected: 鏁欏笀绔櫒妫€涓庢垚闀胯褰曢〉搴旂ǔ瀹氭覆鏌撳浘琛紝涓嶅湪姝ｅ父鐢ㄦ埛瀵艰埅璺緞涓寔缁緭鍑?invalid-size warnings銆?- actual: 椤甸潰鏈€缁堝彲瑙佷笖鏈穿婧冿紝浣?`/health` 涓?`/growth` 鍦ㄦ潕鑰佸笀銆佸懆鑰佸笀妗岄潰涓庣Щ鍔ㄦ牳蹇冨娴嬩腑閮藉弽澶嶈緭鍑?`The width(-1) and height(-1) of chart should be greater than 0...`銆?- consoleErrors: Recharts warning repeated: `The width(-1) and height(-1) of chart should be greater than 0, please check the style of container...`
- networkErrors: No blocking 4xx/5xx for the affected routes. Rapid route changes also produced some `net::ERR_ABORTED` requests for in-flight RSC/API requests, and local analytics script requests were blocked by ORB.
- screenshotBefore: artifacts/bug-bash/B12/li-desktop-health-r2.png
- screenshotAfter: artifacts/bug-bash/B12/li-desktop-growth-r2.png
- videoOrTrace: artifacts/bug-bash/B12/li-desktop-result-r2.json; artifacts/bug-bash/B12/zhou-mobile-result-r2.json
- sourceFilesSuspected: app/health/page.tsx; app/growth/page.tsx; shared Recharts chart components
- likelyCause: Recharts responsive containers are mounted before their parent containers have a positive measured width/height.
- suggestedFix: Give chart containers stable min dimensions or defer chart rendering until the container has measurable dimensions.
- ownerSuggested: shared-records/ui
- blocksRelease: false
- notes: Tracked as P3 because the pages remain usable, but the warning is reproducible across both teacher accounts and mobile/desktop core checks.

### BUG-001

- bugId: BUG-001
- title: 鍥暱棣栭〉姝ｅ父杩涘叆鍚庨€氱煡浜嬩欢鎺ュ彛杩斿洖 503
- severity: P2
- status: confirmed
- foundByThread: B10
- role: director
- demoAccount: 闄堝洯闀?- route: /admin
- viewport: desktop
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Open `http://localhost:3000/login`; click demo account `闄堝洯闀縛; wait for `/admin`; observe browser console and network log.
- expected: 鍥暱棣栭〉搴斿姞杞藉畬鎴愶紝閫氱煡浜嬩欢鎺ュ彛搴旀垚鍔熻繑鍥烇紝鎴栧湪鏈湴/婕旂ず鐜涓互鍙楁帶 fallback 澶勭悊锛屼笉浜х敓 503 console/network error銆?- actual: 棣栭〉鍙锛屼絾 `GET /api/admin/notification-events` 杩斿洖 503锛宑onsole 鍑虹幇 `Failed to load resource: the server responded with a status of 503 (Service Unavailable)`銆?- consoleErrors: `Failed to load resource: the server responded with a status of 503 (Service Unavailable)` on `/admin`
- networkErrors: `GET /api/admin/notification-events` -> 503
- screenshotBefore: artifacts/bug-bash/B10/desktop-1440x900-u-admin-before-demo-click.png
- screenshotAfter: artifacts/bug-bash/B10/desktop-1440x900-u-admin-home.png
- videoOrTrace: artifacts/bug-bash/B10/b10-smoke-results.json
- sourceFilesSuspected: app/api/admin/notification-events/route.ts; lib/db/notification-events.ts
- likelyCause: 鏈湴婕旂ず鐜缂哄皯閫氱煡浜嬩欢鎸佷箙鍖栭厤缃椂锛屽洯闀块椤典粛鐩存帴璇锋眰璇ユ帴鍙ｅ苟鍚戞祻瑙堝櫒鏆撮湶 503銆?- suggestedFix: 涓烘紨绀?鏈湴鐜鎻愪緵绌哄垪琛?fallback锛屾垨璁╅椤佃瘑鍒?`available:false` 绫荤姸鎬佸苟閬垮厤鏈鐞?503銆?- ownerSuggested: admin/dashboard
- blocksRelease: false
- notes: Also reproduced on mobile 390x844. Login, page render, navigation, and logout still complete.

### BUG-002

- bugId: BUG-002
- title: 瀹堕暱棣栭〉 AI 寤鸿鎺ュ彛鍦ㄦ甯哥櫥褰曡矾寰勮繑鍥?500
- severity: P2
- status: confirmed
- foundByThread: B10
- role: parent
- demoAccount: 鏋楀濡?- route: /parent
- viewport: desktop
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Open `http://localhost:3000/login`; click demo account `鏋楀濡坄; wait for `/parent`; observe browser console and network log.
- expected: 瀹堕暱棣栭〉鐨?AI 寤鸿璇锋眰搴旀垚鍔燂紝鎴栫ǔ瀹氫娇鐢ㄨ鍒?mock fallback锛屼笉浜х敓 500 console/network error銆?- actual: 瀹堕暱棣栭〉鍙锛屼絾 `POST /api/ai/suggestions` 杩斿洖 500锛宑onsole 鍑虹幇 `Failed to load resource: the server responded with a status of 500 (Internal Server Error)`銆?- consoleErrors: `Failed to load resource: the server responded with a status of 500 (Internal Server Error)` on `/parent`
- networkErrors: `POST /api/ai/suggestions` -> 500
- screenshotBefore: artifacts/bug-bash/B10/desktop-1440x900-u-parent-before-demo-click.png
- screenshotAfter: artifacts/bug-bash/B10/desktop-1440x900-u-parent-home.png
- videoOrTrace: artifacts/bug-bash/B10/b10-smoke-results.json
- sourceFilesSuspected: app/api/ai/suggestions/route.ts; lib/ai/server.ts; lib/server/brain-client.ts
- likelyCause: 瀹堕暱寤鸿璇锋眰鍦?brain/AI provider 涓嶅彲鐢ㄦ垨 fallback 閾捐矾寮傚父鏃舵病鏈夌ǔ瀹氳繑鍥?200 fallback銆?- suggestedFix: 鎹曡幏 suggestions 鐢熸垚閾捐矾寮傚父骞惰繑鍥炲彲杩借釜鐨?fallback payload锛岄伩鍏嶉椤垫甯告祻瑙堟椂鍑虹幇 500銆?- ownerSuggested: parent/ai
- blocksRelease: false
- notes: Also reproduced on mobile 390x844. Page is not blank, but normal user path emits a visible devtools error.

### BUG-003

- bugId: BUG-003
- title: 瀹堕暱鎴愰暱缁樻湰鐢熸垚鎺ュ彛杩斿洖 503 骞舵樉绀衡€滄垚闀跨粯鏈殏鏃朵笉鍙敤鈥?- severity: P2
- status: confirmed
- foundByThread: B10
- role: parent
- demoAccount: 鏋楀濡?- route: /parent/storybook?child=c-1
- viewport: desktop
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Open `http://localhost:3000/login`; click demo account `鏋楀濡坄; click the visible `鎴愰暱缁樻湰` navigation entry; wait on `/parent/storybook?child=c-1`; observe the generation panel and console/network log.
- expected: 鎴愰暱缁樻湰 demo path should generate or load a usable fallback storybook without showing an unavailable error during the normal demo path.
- actual: Page shell and static story cards load, but the storybook generation panel shows `鎴愰暱缁樻湰鏆傛椂涓嶅彲鐢╜ and `鎴愰暱缁樻湰璇锋眰澶辫触锛?03锛塦; console/network report `POST /api/ai/parent-storybook` -> 503.
- consoleErrors: `Failed to load resource: the server responded with a status of 503 (Service Unavailable)` on `/parent/storybook?child=c-1&demoSeed=recording-c1-bedtime`
- networkErrors: `POST /api/ai/parent-storybook` -> 503
- screenshotBefore: artifacts/bug-bash/B10/desktop-1440x900-u-parent-before-demo-click.png
- screenshotAfter: artifacts/bug-bash/B10/desktop-parent-storybook-retest-after-20s.png
- videoOrTrace: artifacts/bug-bash/B10/b10-smoke-results.json
- sourceFilesSuspected: app/api/ai/parent-storybook/route.ts; lib/server/brain-client.ts; lib/server/parent-storybook-cache.ts
- likelyCause: parent storybook route returns `brain-proxy-unavailable` 503 instead of a demo-safe cached/mock storybook response when the brain service is unavailable.
- suggestedFix: Add a local/demo fallback response for parent storybook generation, or degrade the generation panel without surfacing a failed demo path.
- ownerSuggested: parent/storybook
- blocksRelease: false
- notes: Also reproduced on mobile 390x844. Retested after 20 seconds; the error panel remains visible.

### BUG-004

- bugId: BUG-004
- title: 鏁欏笀鍋ュ悍/鎴愰暱椤甸潰姝ｅ父瀵艰埅鏃堕噸澶嶅嚭鐜?Recharts 灏哄 warning
- severity: P3
- status: confirmed
- foundByThread: B10
- role: shared
- demoAccount: 鏉庤€佸笀
- route: /health; /growth
- viewport: desktop
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Open `http://localhost:3000/login`; click `鏉庤€佸笀`; click navigation `鏅ㄦ涓庡仴搴穈; repeat with `鍛ㄨ€佸笀` and click `鎴愰暱琛屼负`; observe console warnings while pages render.
- expected: Shared health/growth pages should render charts without Recharts invalid dimension warnings.
- actual: Pages eventually render, but console repeatedly logs `The width(-1) and height(-1) of chart should be greater than 0...`.
- consoleErrors: Recharts warning `The width(-1) and height(-1) of chart should be greater than 0...`
- networkErrors: none observed for the retest beyond expected unauthenticated `/api/auth/session` probe before login
- screenshotBefore: artifacts/bug-bash/B10/desktop-1440x900-u-teacher-home.png
- screenshotAfter: artifacts/bug-bash/B10/desktop-u-teacher-health-retest-after-20s.png
- videoOrTrace: artifacts/bug-bash/B10/b10-smoke-results.json
- sourceFilesSuspected: app/health/page.tsx; app/growth/page.tsx; shared chart components using Recharts
- likelyCause: One or more responsive chart containers mount with zero/negative dimensions before layout stabilizes.
- suggestedFix: Give chart containers stable min width/height or defer chart rendering until the container has measurable dimensions.
- ownerSuggested: shared-records/ui
- blocksRelease: false
- notes: Also reproduced with 鍛ㄨ€佸笀 on `/growth`. Initial B10 screenshot caught the route loading state; targeted retest confirmed pages render after 1s, so this is tracked as console warning rather than navigation failure.

### BUG-B11-001

- bugId: BUG-B11-001
- title: 园长 AI 助手展示输入框但没有可编辑输入控件，发送按钮不可用
- severity: P1
- status: confirmed
- foundByThread: B11
- role: director
- demoAccount: 陈园长
- route: /admin/agent
- viewport: desktop
- browser: Chromium via Playwright fallback; Browser Use Node REPL unavailable because local Node is v22.20.0 and requires >= v22.22.0
- reproSteps: 1. 打开 http://localhost:3000/login。 2. 点击陈园长进入系统。 3. 进入 AI 助手。 4. 在“AI 解释与对话”区域尝试点击“输入问题，如：饮水量低的原因有哪些？”并发送自定义问题。
- expected: 输入区域应是真实 input/textarea/contenteditable，用户输入文本后“发送”按钮可用并提交问题。
- actual: 页面只有视觉上的输入胶囊，DOM 中没有可填写的 input/textarea；发送按钮保持 disabled，Playwright 真实点击等待启用后超时。快捷问题在生成后可点，但自定义输入路径不可用。
- consoleErrors: no page exception; interaction error: Send button remained disabled
- networkErrors: repeated director-side /api/admin/notification-events 503 also observed; existing BUG-001 already tracks it
- screenshotBefore: artifacts/bug-bash/B11/B11-04-admin-agent.png
- screenshotAfter: artifacts/bug-bash/B11/B11-05-admin-agent-after-input.png
- videoOrTrace: artifacts/bug-bash/B11/B11-exploration-results.json
- sourceFilesSuspected: app/admin/agent/page.tsx; components/admin/*
- likelyCause: AI composer was implemented as a visual-only placeholder/button group instead of a real controlled input.
- suggestedFix: Render a real text input or textarea, bind local prompt state, enable send when trimmed text is present, and keep quick-question chips separate from free-text entry.
- ownerSuggested: frontend
- blocksRelease: true
- notes: This blocks a core 园长 AI assistant workflow.

### BUG-B11-002

- bugId: BUG-B11-002
- title: /admin/agent 菜单和面包屑误显示为周报分析，AI 助手与周报分析同时高亮
- severity: P2
- status: confirmed
- foundByThread: B11
- role: director
- demoAccount: 陈园长
- route: /admin/agent
- viewport: desktop
- browser: Chromium via Playwright fallback
- reproSteps: 1. 以陈园长登录。 2. 从园长首页点击“查看完整 AI 分析”或侧边栏“AI 助手”。 3. 观察顶部面包屑和侧边栏高亮状态。
- expected: /admin/agent 应只高亮“AI 助手”，顶部面包屑应显示 AI 助手。
- actual: URL 为 /admin/agent 时，顶部面包屑显示“周报分析”，侧边栏“AI 助手”和“周报分析”两个入口同时呈紫色高亮。
- consoleErrors: none specific to highlight state
- networkErrors: repeated /api/admin/notification-events 503 also observed; existing BUG-001 already tracks it
- screenshotBefore: artifacts/bug-bash/B11/B11-04-admin-agent.png
- screenshotAfter: artifacts/bug-bash/B11/B11-04-admin-agent.png
- videoOrTrace: artifacts/bug-bash/B11/B11-exploration-results.json
- sourceFilesSuspected: components/Navbar.tsx; lib/navigation/primary-nav.ts; app/admin/agent/page.tsx
- likelyCause: Active-route matching treats /admin/agent and /admin/agent?action=weekly-report as the same menu branch or derives breadcrumb from the weekly-report variant.
- suggestedFix: Make active-state and breadcrumb matching query-aware for weekly report mode, and use exact path matching for the AI assistant base route.
- ownerSuggested: frontend
- blocksRelease: false
- notes: Matches the bug bash focus area “菜单高亮错乱”.

### BUG-B11-003

- bugId: BUG-B11-003
- title: 园长首页“刷新数据”实际跳转到周报页面
- severity: P2
- status: confirmed
- foundByThread: B11
- role: director
- demoAccount: 陈园长
- route: /admin
- viewport: desktop
- browser: Chromium via Playwright fallback
- reproSteps: 1. 以陈园长登录进入 /admin。 2. 点击页面顶部的“刷新数据”。 3. 观察 URL 和页面内容。
- expected: “刷新数据”应留在 /admin 并触发当前看板数据刷新、loading、toast 或明确反馈。
- actual: 该入口是 href=/admin/agent?action=weekly-report，点击后跳转到“园长周报工作区”，不是刷新当前看板。
- consoleErrors: none specific to click
- networkErrors: repeated /api/admin/notification-events 503 also observed; existing BUG-001 already tracks it
- screenshotBefore: artifacts/bug-bash/B11/B11-01-admin-home.png
- screenshotAfter: artifacts/bug-bash/B11/B11-03-after-refresh-data-link.png
- videoOrTrace: artifacts/bug-bash/B11/B11-exploration-results.json
- sourceFilesSuspected: app/admin/page.tsx; components/admin/*
- likelyCause: Refresh CTA is wired to the weekly-report href instead of a dashboard refresh handler.
- suggestedFix: Convert the CTA to a button that refetches dashboard data, or rename it if the intended action is opening weekly report.
- ownerSuggested: frontend
- blocksRelease: false
- notes: This is a misleading primary action on the director dashboard.

### BUG-B11-004

- bugId: BUG-B11-004
- title: mobile 园长首页闭环进度表格列过窄，长文本被挤成逐字竖排
- severity: P2
- status: confirmed
- foundByThread: B11
- role: director
- demoAccount: 陈园长
- route: /admin
- viewport: mobile
- browser: Chromium via Playwright fallback, 390x844
- reproSteps: 1. 在 390x844 mobile viewport 打开 /login。 2. 点击陈园长进入 /admin。 3. 向下滚动到“闭环进度总览”的事项表格。
- expected: mobile 下应使用卡片列表、横向可滚动表格或压缩后的摘要布局，事项内容和状态应可读。
- actual: 表格继续按多列布局展示，事项内容、关联对象、状态等被挤成窄列，中文长句逐字换行，严重影响阅读和操作。
- consoleErrors: none specific to layout
- networkErrors: repeated /api/admin/notification-events 503 also observed; existing BUG-001 already tracks it
- screenshotBefore: artifacts/bug-bash/B11/B11-26-mobile-admin.png
- screenshotAfter: artifacts/bug-bash/B11/B11-26-mobile-admin.png
- videoOrTrace: artifacts/bug-bash/B11/B11-responsive-results.json
- sourceFilesSuspected: app/admin/page.tsx; components/weekly-report/*; components/admin/*
- likelyCause: Desktop table layout is reused on mobile without a card/table-responsive breakpoint.
- suggestedFix: Replace this table with mobile cards below the tablet breakpoint, or introduce horizontal table scrolling with minimum column widths.
- ownerSuggested: frontend
- blocksRelease: false
- notes: No horizontal document overflow was detected, but visual readability is still broken.

### BUG-B11-005

- bugId: BUG-B11-005
- title: 园长首页核心数据卡点击没有反馈或下钻
- severity: P3
- status: confirmed
- foundByThread: B11
- role: director
- demoAccount: 陈园长
- route: /admin
- viewport: desktop
- browser: Chromium via Playwright fallback
- reproSteps: 1. 以陈园长登录 /admin。 2. 点击“出勤率”核心数据卡。 3. 观察 URL、页面状态和可见反馈。
- expected: 如果数据卡作为运营看板入口，应打开下钻、筛选相关趋势或显示明确反馈；如果只是静态指标，应降低可点击感并避免作为真实用户路径入口。
- actual: 点击“出勤率”后 URL 仍为 /admin，页面无高亮、toast、drawer、筛选或其他反馈。
- consoleErrors: none specific to click
- networkErrors: no request triggered by the click
- screenshotBefore: artifacts/bug-bash/B11/B11-01-admin-home.png
- screenshotAfter: artifacts/bug-bash/B11/B11-02-admin-after-attendance-click.png
- videoOrTrace: artifacts/bug-bash/B11/B11-exploration-results.json
- sourceFilesSuspected: app/admin/page.tsx; components/admin/*
- likelyCause: Metric cards are visual-only cards without an onClick/drill-down affordance.
- suggestedFix: Either wire metric cards to relevant drill-down filters/routes, or make them visually non-interactive and provide separate explicit links.
- ownerSuggested: frontend/product
- blocksRelease: false
- notes: Matches the bug bash focus area “园长首页数据卡片点击无反应 / visual-only 指标看起来可点但没有反馈”.

### BUG-B11-006

- bugId: BUG-B11-006
- title: 儿童档案台账缺少明显详情/编辑入口，点击儿童姓名只选中行不打开详情
- severity: P3
- status: confirmed
- foundByThread: B11
- role: director
- demoAccount: 陈园长
- route: /children
- viewport: desktop
- browser: Chromium via Playwright fallback
- reproSteps: 1. 以陈园长登录。 2. 打开“幼儿档案”。 3. 在搜索或台账列表中点击儿童姓名“林小雨”。 4. 观察是否打开详情或编辑抽屉。
- expected: 园长应能从儿童档案台账打开详情/编辑入口，查看完整档案并进行安全编辑前置操作。
- actual: 点击儿童姓名/行后仅出现行选中样式，右侧或弹窗没有详情内容；操作列只有“切换出勤”和“删除”，缺少清晰的详情/编辑入口。
- consoleErrors: none specific to click
- networkErrors: no request triggered by the click
- screenshotBefore: artifacts/bug-bash/B11/B11-07-children.png
- screenshotAfter: artifacts/bug-bash/B11/B11-17-children-click-name.png
- videoOrTrace: artifacts/bug-bash/B11/B11-targeted-interactions.json
- sourceFilesSuspected: app/children/page.tsx
- likelyCause: Row selection state is implemented without rendering a detail drawer/panel or the detail action was omitted from the operation column.
- suggestedFix: Add a clear “详情/编辑” action or render the selected child detail drawer when a row/card is selected.
- ownerSuggested: frontend
- blocksRelease: false
- notes: 新增档案和删除确认弹窗可打开，最终提交/确认未执行。
### BUG-011

- bugId: BUG-011
- title: Director account can directly open teacher and parent workspaces
- severity: P1
- status: confirmed
- foundByThread: B15
- role: director
- demoAccount: 陈园长
- route: /teacher; /parent
- viewport: desktop
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Open /login; Click the director demo account; Verify landing on /admin; Directly navigate to /teacher; Directly navigate to /parent; Use browser back/forward
- expected: Director should be blocked from teacher and parent role workspaces, either by redirecting to /admin or by showing a clear permission-denied state.
- actual: /teacher renders the teacher workbench personalized as the director; /parent redirects to /parent?child=c-1 and renders parent content personalized as the director. Back/forward preserves those unauthorized pages.
- consoleErrors: none on /teacher; /parent later logged a 403 resource error while still rendering the parent page
- networkErrors: FAILED POST /api/ai/weekly-report net::ERR_ABORTED; 403 POST /api/ai/suggestions; FAILED GET https://va.vercel-scripts.com/v1/script.debug.js net::ERR_BLOCKED_BY_ORB
- screenshotBefore: 
- screenshotAfter: artifacts/bug-bash/B15/BUG-011-admin-cross-role.png
- videoOrTrace: artifacts/bug-bash/B15/b15-run-results.json
- sourceFilesSuspected: app/teacher/page.tsx; app/parent/page.tsx; components/Navbar.tsx; lib/navigation/primary-nav.ts; lib/store.tsx
- likelyCause: Navigation is role-filtered, but direct route access is not guarded by role at the route/page boundary.
- suggestedFix: Add a shared authenticated role guard for role-owned routes and redirect or render a permission state before the page body mounts.
- ownerSuggested: frontend/auth
- blocksRelease: true
- notes: B15 route checks: /teacher -> /teacher and /parent -> /parent?child=c-1 under the director session.

### BUG-012

- bugId: BUG-012
- title: Teacher account can directly open director and parent workspaces
- severity: P1
- status: confirmed
- foundByThread: B15
- role: teacher
- demoAccount: u-teacher
- route: /admin; /parent
- viewport: desktop
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Open /login; Click the Li teacher demo account; Verify landing on /teacher; Directly navigate to /admin; Directly navigate to /parent; Use browser back/forward
- expected: Teacher should be blocked from director and parent workspaces, either by redirecting to /teacher or by showing a clear permission-denied state.
- actual: /admin renders the director dashboard personalized as Li teacher; /parent redirects to /parent?child=c-1 and renders parent content personalized as Li teacher. Back/forward preserves those unauthorized pages.
- consoleErrors: ERROR: Failed to load resource: the server responded with a status of 403 (Forbidden)
- networkErrors: 403 GET /api/admin/notification-events; FAILED GET /api/ai/high-risk-consultation/feed?limit=4&escalated_only=true net::ERR_ABORTED; FAILED POST /api/ai/weekly-report net::ERR_ABORTED; FAILED GET https://va.vercel-scripts.com/v1/script.debug.js net::ERR_BLOCKED_BY_ORB
- screenshotBefore: 
- screenshotAfter: artifacts/bug-bash/B15/BUG-012-teacher-cross-role.png
- videoOrTrace: artifacts/bug-bash/B15/b15-run-results.json
- sourceFilesSuspected: app/admin/page.tsx; app/parent/page.tsx; components/Navbar.tsx; lib/navigation/primary-nav.ts; lib/store.tsx
- likelyCause: Route pages trust the current session but do not enforce allowed role ownership before rendering.
- suggestedFix: Add route-level role checks for /admin and /parent and provide a consistent permission-denied or role-home redirect behavior.
- ownerSuggested: frontend/auth
- blocksRelease: true
- notes: B15 route checks: /admin -> /admin and /parent -> /parent?child=c-1 under the teacher session.

### BUG-013

- bugId: BUG-013
- title: Parent account can directly open director and teacher workspaces
- severity: P1
- status: confirmed
- foundByThread: B15
- role: parent
- demoAccount: 林妈妈
- route: /admin; /teacher
- viewport: desktop
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Open /login; Click the Lin parent demo account; Verify landing on /parent; Directly navigate to /admin; Directly navigate to /teacher
- expected: Parent should be blocked from director and teacher workspaces, either by redirecting to /parent?child=c-1 or by showing a clear permission-denied state.
- actual: /admin renders the director dashboard personalized as Lin parent; /teacher renders the teacher workbench personalized as Lin parent.
- consoleErrors: ERROR: Failed to load resource: the server responded with a status of 403 (Forbidden) on /admin
- networkErrors: 403 GET /api/admin/notification-events; FAILED POST /api/ai/weekly-report net::ERR_ABORTED; FAILED GET /api/ai/high-risk-consultation/feed?limit=4&escalated_only=true net::ERR_ABORTED; FAILED GET https://va.vercel-scripts.com/v1/script.debug.js net::ERR_BLOCKED_BY_ORB
- screenshotBefore: 
- screenshotAfter: artifacts/bug-bash/B15/BUG-013-parent-cross-role.png
- videoOrTrace: artifacts/bug-bash/B15/b15-run-results.json
- sourceFilesSuspected: app/admin/page.tsx; app/teacher/page.tsx; components/Navbar.tsx; lib/navigation/primary-nav.ts; lib/store.tsx
- likelyCause: Role-specific nav availability does not prevent direct URL access to role-owned pages.
- suggestedFix: Centralize route authorization and deny parent sessions before rendering /admin or /teacher content.
- ownerSuggested: frontend/auth
- blocksRelease: true
- notes: B15 route checks: /admin -> /admin and /teacher -> /teacher under the parent session.

### BUG-014

- bugId: BUG-014
- title: Parent feedback hash does not land on the feedback section
- severity: P2
- status: confirmed
- foundByThread: B15
- role: parent
- demoAccount: 林妈妈
- route: /parent/agent?child=c-1#feedback
- viewport: desktop
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Open /login; Click the Lin parent demo account; Directly navigate to /parent/agent?child=c-1#feedback on desktop viewport
- expected: The URL hash should scroll the page to the feedback composer/section and make it visible after load.
- actual: The URL keeps #feedback and the feedback element exists, but scrollY remains 0 and the feedback section is far below the viewport, around top: 8153px.
- consoleErrors: ERROR: Failed to load resource: the server responded with a status of 500 (Internal Server Error); ERROR: Failed to load resource: the server responded with a status of 503 (Service Unavailable)
- networkErrors: 500 POST /api/ai/suggestions; 503 POST /api/ai/parent-message-reflexion; FAILED POST /api/ai/parent-storybook net::ERR_ABORTED; FAILED POST /api/ai/suggestions net::ERR_ABORTED; FAILED GET https://va.vercel-scripts.com/v1/script.debug.js net::ERR_BLOCKED_BY_ORB
- screenshotBefore: 
- screenshotAfter: artifacts/bug-bash/B15/BUG-014-parent-feedback-hash.png
- videoOrTrace: artifacts/bug-bash/B15/b15-run-results.json
- sourceFilesSuspected: app/parent/agent/page.tsx; components/parent/ParentStructuredFeedbackComposer.tsx
- likelyCause: The target section is rendered after the browser initial hash scroll, with no post-render scroll/focus handling for #feedback.
- suggestedFix: On parent agent load, detect hash === "#feedback" after content hydration and call scrollIntoView/focus on the feedback section.
- ownerSuggested: parent/frontend
- blocksRelease: false
- notes: Child query is preserved; the failure is the hash landing behavior.

### BUG-015

- bugId: BUG-015
- title: Parent feedback hash fails on mobile viewport
- severity: P2
- status: confirmed
- foundByThread: B15
- role: parent
- demoAccount: 林妈妈
- route: /parent/agent?child=c-1#feedback
- viewport: mobile
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Open /login at 390x844; Click the Lin parent demo account; Directly navigate to /parent/agent?child=c-1#feedback
- expected: The mobile parent agent deep link should preserve child=c-1 and scroll to the feedback composer/section.
- actual: The URL keeps #feedback and the feedback element exists, but scrollY remains 0 and the feedback section is far below the viewport, around top: 13950px.
- consoleErrors: ERROR: Failed to load resource: the server responded with a status of 500 (Internal Server Error); ERROR: Failed to load resource: the server responded with a status of 503 (Service Unavailable)
- networkErrors: 500 POST /api/ai/suggestions; 503 POST /api/ai/parent-message-reflexion; FAILED POST /api/ai/weekly-report net::ERR_ABORTED; FAILED POST /api/ai/suggestions net::ERR_ABORTED; FAILED GET https://va.vercel-scripts.com/v1/script.debug.js net::ERR_BLOCKED_BY_ORB
- screenshotBefore: 
- screenshotAfter: artifacts/bug-bash/B15/BUG-015-parent-feedback-hash-mobile.png
- videoOrTrace: artifacts/bug-bash/B15/b15-run-results.json
- sourceFilesSuspected: app/parent/agent/page.tsx; components/parent/ParentStructuredFeedbackComposer.tsx; components/MobileNav.tsx
- likelyCause: Mobile layout height and async content push the hash target after the browser initial hash scroll, with no post-render correction.
- suggestedFix: Re-run hash scrolling after parent agent content settles on mobile, accounting for fixed top/bottom navigation.
- ownerSuggested: parent/frontend
- blocksRelease: false
- notes: Mobile child route /parent?child=c-1 preserved the child query and rendered correctly.

### BUG-016

- bugId: BUG-016
- title: Parent AI follow-up suggestion click returns 500 and leaves the page unchanged
- severity: P2
- status: confirmed
- foundByThread: B13
- role: parent
- demoAccount: 林妈妈
- route: /parent/agent?child=c-1
- viewport: desktop
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Open /login; click the 林妈妈 demo account; open /parent/agent?child=c-1; click the recommended follow-up question “为什么最近不愿意去园？”.
- expected: The AI care follow-up should show a visible answer, update the conversation area, or show a handled fallback state.
- actual: The button click leaves the visible page text unchanged and the browser records a 500 from /api/ai/follow-up.
- consoleErrors: Failed to load resource: the server responded with a status of 500 (Internal Server Error)
- networkErrors: 500 POST /api/ai/follow-up; also observed 500 POST /api/ai/suggestions and 503 POST /api/ai/parent-message-reflexion on the same page
- screenshotBefore: artifacts/bug-bash/B13/B13-desktop-ai-before-question.png
- screenshotAfter: artifacts/bug-bash/B13/BUG-016-desktop-ai-question-after-click.png
- videoOrTrace: artifacts/bug-bash/B13/B13-link-observations.json
- sourceFilesSuspected: app/parent/agent/page.tsx; app/api/ai/follow-up/route.ts; lib/server/brain-client.ts
- likelyCause: Parent AI follow-up requests do not fall back cleanly when the AI/brain service is unavailable.
- suggestedFix: Return a stable demo-safe fallback for follow-up failures and surface a visible handled error state instead of leaving the interaction unchanged.
- ownerSuggested: parent/ai
- blocksRelease: false
- notes: Reproduced during the B13 required AI care suggestion path. No feedback form was submitted.

### BUG-017

- bugId: BUG-017
- title: Parent feedback deep link keeps #feedback but lands at the top of a long AI page
- severity: P2
- status: duplicate
- foundByThread: B13
- role: parent
- demoAccount: 林妈妈
- route: /parent/agent?child=c-1#feedback
- viewport: desktop
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Open /login; click the 林妈妈 demo account; open /parent/agent?child=c-1#feedback from the feedback entry or direct route; observe the first viewport.
- expected: The feedback entry should scroll/focus the feedback section or composer so the parent can immediately leave feedback.
- actual: The URL contains #feedback and the target exists, but scrollY remains 0; the feedback target is far below the first viewport, so the parent sees the AI advice top section instead.
- consoleErrors: Failed to load resource: the server responded with a status of 500 (Internal Server Error); Failed to load resource: the server responded with a status of 503 (Service Unavailable)
- networkErrors: 500 POST /api/ai/suggestions; 503 POST /api/ai/parent-message-reflexion
- screenshotBefore: artifacts/bug-bash/B13/B13-desktop-auth-agent-visible.png
- screenshotAfter: artifacts/bug-bash/B13/BUG-017-desktop-feedback-anchor-top.png
- videoOrTrace: artifacts/bug-bash/B13/B13-observations.json
- sourceFilesSuspected: app/parent/agent/page.tsx; components/parent/ParentStructuredFeedbackComposer.tsx
- likelyCause: The feedback target renders after initial hash handling and the page does not re-run scrollIntoView after hydration/content expansion.
- suggestedFix: Handle #feedback after client render and add scroll-margin for sticky headers/bottom tabs.
- ownerSuggested: parent/feedback
- blocksRelease: false
- notes: Duplicate/confirmation of the existing parent feedback hash issue already recorded by B15 as BUG-014/BUG-015.

### BUG-018

- bugId: BUG-018
- title: Parent storybook generation shows unavailable state after /api/ai/parent-storybook returns 503
- severity: P2
- status: duplicate
- foundByThread: B13
- role: parent
- demoAccount: 林妈妈
- route: /parent/storybook?child=c-1
- viewport: mobile
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Set viewport to 390x844; open /login; click the 林妈妈 demo account; open /parent/storybook?child=c-1; scroll to the storybook generation panel; click refresh/regenerate or wait for generation.
- expected: Growth storybook should load generated or demo fallback pages and provide a usable viewing/flip experience.
- actual: The generation panel displays “成长绘本暂时不可用” and “成长绘本请求失败（503）”; no usable generated storybook pages or flip controls appear.
- consoleErrors: Failed to load resource: the server responded with a status of 503 (Service Unavailable)
- networkErrors: 503 POST /api/ai/parent-storybook
- screenshotBefore: artifacts/bug-bash/B13/B13-mobile-auth-storybook-visible.png
- screenshotAfter: artifacts/bug-bash/B13/BUG-018-mobile-storybook-503.png
- videoOrTrace: artifacts/bug-bash/B13/B13-observations.json
- sourceFilesSuspected: app/parent/storybook/page.tsx; app/api/ai/parent-storybook/route.ts; lib/server/parent-storybook-cache.ts
- likelyCause: Storybook generation depends on an unavailable AI service and does not provide a complete local/demo fallback.
- suggestedFix: Provide cached/demo storybook content when the AI endpoint is unavailable and keep flip/view controls usable.
- ownerSuggested: parent/storybook
- blocksRelease: false
- notes: Duplicate/confirmation of existing BUG-003, reproduced again in B13 on the required parent mobile path.

### BUG-019

- bugId: BUG-019
- title: Parent home AI recommendation exposes internal demo copy and route names
- severity: P3
- status: confirmed
- foundByThread: B13
- role: parent
- demoAccount: 林妈妈
- route: /parent?child=c-1
- viewport: desktop
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Open /login; click the 林妈妈 demo account; review the “今晚建议怎么做” AI recommendation card on the parent home page.
- expected: Parent-facing recommendation copy should explain the child-specific reason in natural language and avoid implementation/demo notes.
- actual: The recommendation reason says the sample “专门服务 Parent 端录屏” and includes route names like `/parent` and `/parent/agent`, exposing internal demo/route wording to parents.
- consoleErrors: Failed to load resource: the server responded with a status of 500 (Internal Server Error)
- networkErrors: 500 POST /api/ai/suggestions
- screenshotBefore: artifacts/bug-bash/B13/B13-desktop-login-before.png
- screenshotAfter: artifacts/bug-bash/B13/BUG-019-desktop-internal-ai-copy.png
- videoOrTrace: artifacts/bug-bash/B13/B13-observations.json
- sourceFilesSuspected: app/parent/page.tsx; components/parent/*; app/api/ai/suggestions/route.ts
- likelyCause: Fallback/demo AI recommendation content is using implementation-facing seed text after the suggestions API fails.
- suggestedFix: Replace parent fallback copy with polished parent-facing language and keep route/demo metadata out of visible recommendation text.
- ownerSuggested: parent/content
- blocksRelease: false
- notes: This appeared on both desktop and mobile parent home after logging in as 林妈妈.

### BUG-020

- bugId: BUG-020
- title: Mobile storybook bottom navigation overlaps the summary card content
- severity: P3
- status: confirmed
- foundByThread: B13
- role: parent
- demoAccount: 林妈妈
- route: /parent/storybook?child=c-1
- viewport: mobile
- browser: Playwright Chromium fallback; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Set viewport to 390x844; open /login; click the 林妈妈 demo account; open /parent/storybook?child=c-1; observe the first storybook viewport.
- expected: Fixed bottom navigation should not cover content cards; the first viewport should leave enough bottom safe area for the fourth summary card.
- actual: The fixed bottom tab bar overlays the lower part of the “精彩瞬间” summary card in the first mobile storybook viewport.
- consoleErrors: none specific to the overlap
- networkErrors: 503 POST /api/ai/parent-storybook also observed on the same route
- screenshotBefore: artifacts/bug-bash/B13/B13-mobile-auth-storybook-visible.png
- screenshotAfter: artifacts/bug-bash/B13/BUG-020-mobile-storybook-bottomnav-overlap.png
- videoOrTrace: artifacts/bug-bash/B13/B13-observations.json
- sourceFilesSuspected: app/parent/storybook/page.tsx; components/MobileNav.tsx
- likelyCause: The storybook summary section does not reserve enough bottom safe area for the fixed mobile tab bar.
- suggestedFix: Add bottom padding/scroll padding around mobile storybook sections that can sit under the fixed bottom navigation.
- ownerSuggested: parent/mobile-ui
- blocksRelease: false
- notes: No document-level horizontal overflow was detected at 390x844.

### BUG-021

- bugId: BUG-021
- title: Tablet 家长反馈控件被底部导航覆盖
- severity: P2
- status: open
- foundByThread: B14
- role: parent
- demoAccount: 林妈妈
- route: /parent/agent?child=c-1#feedback
- viewport: tablet
- browser: Playwright Chromium real browser automation; Browser Use node_repl blocked by system Node 22.20.0 < 22.22.0
- reproSteps: Set viewport to 768x1024; open `http://localhost:3000/login`; click demo account `林妈妈`; open `/parent/agent?child=c-1#feedback`; observe the `您完成后的反馈` controls near the bottom of the viewport.
- expected: Fixed bottom navigation should not cover feedback option buttons or the submit CTA on tablet/mobile viewports.
- actual: The bottom Tab bar overlaps the feedback option row and submit area. Measured overlap included `完成得很好`, `部分完成`, `有一些挑战`, `没来得及`, and `提交反馈给老师` while the bottom nav occupied y=938-1012.
- consoleErrors: `Failed to load resource: the server responded with a status of 401 (Unauthorized)`; `Failed to load resource: the server responded with a status of 500 (Internal Server Error)`; `Failed to load resource: the server responded with a status of 503 (Service Unavailable)`
- networkErrors: `503 http://localhost:3000/api/ai/parent-message-reflexion`; several route-transition chunk/image requests were aborted during navigation
- screenshotBefore: artifacts/bug-bash/B14/check-tablet-parent-home.png
- screenshotAfter: artifacts/bug-bash/B14/BUG-021-tablet-768x1024-parent-feedback-bottom-overlap.png
- videoOrTrace: artifacts/bug-bash/B14/candidate-bugs.json
- sourceFilesSuspected: components/Navbar.tsx; app/parent/agent/page.tsx; components/parent/ParentStructuredFeedbackComposer.tsx
- likelyCause: The feedback section and anchor position do not reserve enough bottom safe area for `.pixel-bottom-tabs` on tablet/mobile layouts.
- suggestedFix: Increase bottom padding/scroll padding for feedback sections under `lg:hidden` bottom tabs and verify `#feedback` scroll positioning leaves controls above the fixed nav.
- ownerSuggested: parent/feedback
- blocksRelease: false
- notes: The page has no document-level horizontal overflow, but the fixed bottom navigation blocks a core parent feedback action. B15 already separately tracks the feedback hash landing issue as BUG-014/BUG-015.

### BUG-B22-001

- bugId: BUG-B22-001
- title: 晨检弹窗允许空/非法体温保存为 NaN
- severity: P2
- status: confirmed
- foundByThread: B22
- role: shared
- demoAccount: none
- route: /health
- viewport: unknown
- browser: Static code scan
- reproSteps: 打开 `/health`；进入晨检编辑弹窗；清空体温输入后点击保存；记录仍会被提交并关闭弹窗。
- expected: 体温为空、非数字或超出合理范围时应阻止保存，保留弹窗并显示字段错误或 toast。
- actual: 保存逻辑直接对输入执行 `parseFloat` 并提交，空值会变成 `NaN`，弹窗仍关闭。
- consoleErrors: not run; static scan only
- networkErrors: not run; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B22/forms-modals-buttons-scan.md
- sourceFilesSuspected: app/health/page.tsx
- likelyCause: `parseFloat(temperature)` 后没有校验 `Number.isFinite`、必填状态或合理范围。
- suggestedFix: 保存前校验体温必填、数值合法和合理范围；失败时保留弹窗并显示表单错误。
- ownerSuggested: shared-records/ui
- blocksRelease: false
- notes: B22 表单校验问题；同时会影响后续 `toFixed`、图表聚合等依赖数值的展示路径。

### BUG-B22-002

- bugId: BUG-B22-002
- title: 高风险会诊生成按钮在流式生成期间仍可重复点击
- severity: P2
- status: confirmed
- foundByThread: B22
- role: teacher
- demoAccount: none
- route: /teacher/high-risk-consultation
- viewport: unknown
- browser: Static code scan
- reproSteps: 进入 `/teacher/high-risk-consultation`；点击“一键生成会诊”；在流式响应未结束时连续再次点击该按钮。
- expected: 生成中按钮应进入 loading/disabled 状态，重复点击应被阻止。
- actual: `ConsultationInputCard` 未接收 `isStreaming` 状态，`runConsultation` 没有活动流 early return，按钮可重复触发。
- consoleErrors: not run; static scan only
- networkErrors: not run; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B22/forms-modals-buttons-scan.md
- sourceFilesSuspected: app/teacher/high-risk-consultation/page.tsx; lib/bridge/use-agent-stream.ts
- likelyCause: 会诊输入卡片和提交 handler 没有把流式生成状态作为按钮禁用条件。
- suggestedFix: 将 `isStreaming` 传入 `ConsultationInputCard`，生成期间禁用按钮，并在 `runConsultation` 开头增加活动流保护。
- ownerSuggested: teacher/ai
- blocksRelease: false
- notes: B22 loading/repeated-click 问题；高风险会诊属于核心教师工作流，建议优先修复。

### BUG-B22-003

- bugId: BUG-B22-003
- title: 顶部栏搜索、通知、消息图标按钮没有行为
- severity: P3
- status: confirmed
- foundByThread: B22
- role: shared
- demoAccount: none
- route: shared authenticated routes
- viewport: unknown
- browser: Static code scan
- reproSteps: 登录任意角色；点击顶部栏搜索、通知或消息图标按钮；观察没有弹层、路由变化、toast 或 disabled 提示。
- expected: 图标按钮应打开对应搜索/通知/消息面板，或在暂未实现时显示禁用态。
- actual: 多个 Shell 图标按钮渲染为真实 `<button>`，但没有 `onClick` 或其它可见反馈。
- consoleErrors: not run; static scan only
- networkErrors: not run; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B22/forms-modals-buttons-scan.md
- sourceFilesSuspected: components/Navbar.tsx
- likelyCause: Shell 图标按钮保留了视觉稿形态，未接入面板、路由或禁用态。
- suggestedFix: 接入对应弹层/页面，或改为 disabled/非按钮视觉元素。
- ownerSuggested: shared-navigation
- blocksRelease: false
- notes: B22 visual-only button 问题；不重复记录既有导航高亮或角色权限问题。

### BUG-B22-004

- bugId: BUG-B22-004
- title: 园长端导出、分享和使用说明按钮无点击行为
- severity: P3
- status: confirmed
- foundByThread: B22
- role: director
- demoAccount: 陈园长
- route: /admin; /admin/agent?action=weekly-report
- viewport: unknown
- browser: Static code scan
- reproSteps: 以园长进入 `/admin` 或周报页；点击“导出周报”“分享周报”或“使用说明”；观察无响应。
- expected: 导出/分享/help 按钮应触发下载、分享面板或说明弹窗；未实现时应明确禁用。
- actual: 这些控件使用 `ReplicaButton` 渲染为真实按钮，但没有绑定 `onClick` 行为。
- consoleErrors: not run; static scan only
- networkErrors: not run; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B22/forms-modals-buttons-scan.md
- sourceFilesSuspected: components/admin/pixel-replica/DirectorDashboardReplica.tsx; components/admin/pixel-replica/DirectorWeeklyReportReplica.tsx; components/admin/pixel-replica/DirectorAgentReplica.tsx
- likelyCause: `ReplicaButton` 用于像素还原，但导出、分享和 help 操作没有接入实际 handler。
- suggestedFix: 实现导出、分享、说明弹窗，或明确渲染为 disabled/说明性控件。
- ownerSuggested: director/frontend
- blocksRelease: false
- notes: 与既有 `BUG-B11-003` 的“刷新数据”错误跳转不同，本条只覆盖无 handler 的导出/分享/help 按钮。

### BUG-B22-005

- bugId: BUG-B22-005
- title: 教师 AI 沟通模式多个控件无行为且发送按钮语义错误
- severity: P2
- status: confirmed
- foundByThread: B22
- role: teacher
- demoAccount: none
- route: /teacher/agent
- viewport: unknown
- browser: Static code scan
- reproSteps: 进入 `/teacher/agent` 的沟通模式；点击班级下拉、Tab、筛选、展开或发送按钮；观察界面状态不符合按钮语义。
- expected: 班级、Tab、筛选和展开控件应更新本地状态或打开对应面板；发送按钮应提交真实消息并校验输入。
- actual: 班级下拉、Tab、筛选、展开按钮没有状态逻辑；发送按钮复用 `runWorkflow("communication")`，不是实际消息发送。
- consoleErrors: not run; static scan only
- networkErrors: not run; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B22/forms-modals-buttons-scan.md
- sourceFilesSuspected: app/teacher/agent/page.tsx
- likelyCause: 像素稿沟通面板未接入 stateful filter/tab/composer，按钮复用了通用 AI workflow action。
- suggestedFix: 接入真实 tab/filter/dropdown/reply composer，发送前校验输入；未实现项改 disabled 或非交互样式。
- ownerSuggested: teacher/ai
- blocksRelease: false
- notes: B22 重点按钮语义问题；不重复记录既有教师工作台待办 visual-only 问题。

### BUG-B22-006

- bugId: BUG-B22-006
- title: 健康材料解析顶部文件和幼儿操作按钮无行为
- severity: P3
- status: confirmed
- foundByThread: B22
- role: teacher
- demoAccount: none
- route: /teacher/health-file-bridge
- viewport: unknown
- browser: Static code scan
- reproSteps: 进入 `/teacher/health-file-bridge`；点击顶部“全部文件”或“更换关联幼儿”；观察无响应。
- expected: “全部文件”应打开/筛选文件列表，“更换关联幼儿”应聚焦或打开幼儿选择控件；未实现时不应呈现为可点击按钮。
- actual: 顶部摘要区按钮渲染为可操作控件，但没有绑定 `onClick`。
- consoleErrors: not run; static scan only
- networkErrors: not run; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B22/forms-modals-buttons-scan.md
- sourceFilesSuspected: app/teacher/health-file-bridge/page.tsx
- likelyCause: 顶部摘要操作与下方真实上传/幼儿选择表单控件脱节。
- suggestedFix: 绑定到文件列表/幼儿选择控件，或移除按钮样式并改为展示文本。
- ownerSuggested: teacher/health-files
- blocksRelease: false
- notes: 下方真实上传表单有提交保护；本条仅覆盖顶部 visual-only 操作。

### BUG-B22-007

- bugId: BUG-B22-007
- title: 高风险会诊侧栏筛选、行动和讨论控件为 visual-only
- severity: P3
- status: confirmed
- foundByThread: B22
- role: teacher
- demoAccount: none
- route: /teacher/high-risk-consultation
- viewport: unknown
- browser: Static code scan
- reproSteps: 打开 `/teacher/high-risk-consultation`；点击筛选、查看完整档案、下一步行动或讨论发送控件；观察没有状态变化、导航或提交。
- expected: 筛选应更新列表状态，档案/行动应进入对应业务路径，讨论发送应校验并提交输入。
- actual: 侧栏和讨论区多个控件按视觉稿渲染，但缺少状态更新、导航或提交逻辑。
- consoleErrors: not run; static scan only
- networkErrors: not run; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B22/forms-modals-buttons-scan.md
- sourceFilesSuspected: app/teacher/high-risk-consultation/page.tsx
- likelyCause: 侧栏和讨论区按视觉稿实现，缺少筛选、档案跳转、行动入口和讨论发送逻辑。
- suggestedFix: 接入筛选状态、档案跳转、行动入口和讨论输入提交；暂未支持的控件禁用或改为非交互样式。
- ownerSuggested: teacher/consultation
- blocksRelease: false
- notes: 与 `BUG-B22-002` 不同，本条覆盖会诊页非生成按钮的 visual-only 交互。

### BUG-B23-001

- bugId: BUG-B23-001
- title: 教师主导航暴露“数据总览”入口并可进入全园数据总览页
- severity: P1
- status: open
- foundByThread: B23
- role: teacher
- demoAccount: 李老师
- route: /
- viewport: unknown
- browser: Static code scan; no browser run
- reproSteps: 以教师示例账号登录；在教师主导航点击“数据总览”或直接打开 `/`；观察是否留在教师权限内的工作台/班级数据视图。
- expected: 教师不应看到或进入园长/全园数据总览入口；如访问 `/`，应重定向到 `/teacher` 或展示教师授权范围内的数据。
- actual: `TEACHER_NAV_ITEMS` 包含 `OVERVIEW_ITEM` 指向 `/`；`/` 只重定向未登录、家长和园长，不会将教师重定向回 `/teacher`；页面调用 `getAdminBoardData()`，该数据源按 `institutionId` 从 `childrenList` 汇总全园儿童。
- consoleErrors: none; static scan only
- networkErrors: none; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B23/routing-auth-permission-scan.md
- sourceFilesSuspected: lib/navigation/primary-nav.ts; app/page.tsx; lib/store.tsx; lib/persistence/state-scope.ts
- likelyCause: 菜单按角色过滤了大部分入口，但教师菜单仍复用了全局 `OVERVIEW_ITEM`；根路由和管理看板数据计算没有对教师角色做路由级和数据级隔离。
- suggestedFix: 从教师菜单移除 `/` 数据总览入口，或将 `/` 对教师重定向到 `/teacher`；同时让管理看板数据源使用 `visibleChildren`/班级 scope，避免教师看到全园聚合。
- ownerSuggested: frontend/auth
- blocksRelease: true
- notes: B15 已记录直接跨角色访问 BUG-012；本条补充的是菜单本身暴露园长/全园入口并配合根路由漏拦截。

### BUG-B23-002

- bugId: BUG-B23-002
- title: 登录 next 参数未做路由白名单和角色校验，示例账号可被带到越权页面
- severity: P1
- status: open
- foundByThread: B23
- role: login
- demoAccount: none
- route: /login?next=...
- viewport: unknown
- browser: Static code scan; no browser run
- reproSteps: 打开 `/login?next=/admin`；点击家长或教师示例账号；观察登录成功后是否仍跳转到 `next` 指定的非本角色页面。
- expected: `next` 只能接受安全的站内相对路径，并且必须与登录后的角色可访问范围匹配；不匹配时应回到该角色默认首页。
- actual: `/login` 只过滤空值、`/login` 和 `/auth/login`，随后 `resolveLandingPath()` 直接返回 `nextPath`；普通登录、示例账号登录和注册成功都会 `router.replace(resolveLandingPath(role))`。`proxy.ts` 会把原始受保护路径写入 `next`，但没有角色白名单。
- consoleErrors: none; static scan only
- networkErrors: none; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B23/routing-auth-permission-scan.md
- sourceFilesSuspected: app/login/page.tsx; proxy.ts
- likelyCause: 登录页把 `next` 当作可信目标使用，只做了极少的特殊路径过滤；角色授权只存在于菜单层和部分页面数据层，没有在登录跳转目标处兜底。
- suggestedFix: 解析并校验 `next`：仅允许以单个 `/` 开头的站内路径，拒绝 scheme、`//` 和 `javascript:`；登录后按角色校验目标路由，否则回退到 `getDefaultLandingPath(role)`。
- ownerSuggested: frontend/auth
- blocksRelease: true
- notes: B15 已记录跨角色直达 BUG-011/012/013；本条关注示例账号和普通登录流程如何通过 `next` 参数复现/放大该问题。

### BUG-B23-003

- bugId: BUG-B23-003
- title: 家长成长绘本缺失或非法 child 参数时静默选首个孩子但 URL 不回写
- severity: P2
- status: open
- foundByThread: B23
- role: parent
- demoAccount: 林妈妈
- route: /parent/storybook
- viewport: unknown
- browser: Static code scan; no browser run
- reproSteps: 以家长账号打开 `/parent/storybook`；再打开 `/parent/storybook?child=bad`；观察页面是否展示首个授权孩子但地址栏仍缺少/保留非法 `child`。
- expected: 成长绘本路由应像 `/parent` 和 `/parent/agent` 一样将缺失或非法 `child` canonicalize 为授权孩子 ID，或展示明确权限/空状态。
- actual: `selectedFeed` 在 `childFromQuery` 缺失或找不到时回退到 `feeds[0]`；后续 `replaceState` 只维护 `preset` 和 `demoSeed`，不会把实际使用的 `selectedFeed.child.id` 写回 `child` 参数。
- consoleErrors: none; static scan only
- networkErrors: none; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B23/routing-auth-permission-scan.md
- sourceFilesSuspected: app/parent/storybook/page.tsx
- likelyCause: storybook 页实现了 child fallback，但没有复用 parent home/agent 的 URL 规范化逻辑。
- suggestedFix: 在 `selectedFeed` 解析后补齐/替换 `child` query；非法 child 应替换为首个授权 child，或在无授权 child 时显示明确空状态并禁止生成。
- ownerSuggested: parent/storybook
- blocksRelease: false
- notes: `/parent` 和 `/parent/agent` 已有 `nextParams.set("child", ...)` 的 canonicalization；storybook 当前缺失同等行为。

### BUG-B25-001

- bugId: BUG-B25-001
- title: 教师工作台真实空数据被设计稿默认统计和兜底幼儿覆盖
- severity: P2
- status: open
- foundByThread: B25
- role: teacher
- demoAccount: 李老师；周老师
- route: /teacher
- viewport: unknown
- browser: Static code scan; no browser run
- reproSteps: 以教师账号打开 `/teacher`；切换到真实班级人数较少、无异常儿童、无待沟通家长或无待审核记录的数据状态；观察班级人数、出勤、异常、待沟通、待审核和重点关注儿童列表是否仍展示设计稿默认数量/姓名。
- expected: 教师工作台应展示当前教师班级的真实统计；无异常、无待沟通或无待审核时应展示空状态，不应伪造默认人数或儿童姓名。
- actual: `TeacherWorkbenchPage` 使用 `Math.max` 将班级人数、出勤、异常、待沟通、待审核强制抬到 21/19/3/7/18 等默认值，并在无真实记录时显示“乐乐”“小然”“豆豆”等兜底儿童。
- consoleErrors: none; static scan only
- networkErrors: none; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B25/data-state-empty-error-scan.md
- sourceFilesSuspected: components/teacher/TeacherWorkbenchPage.tsx
- likelyCause: P30 像素复刻阶段保留了 visual-only mock 统计和兜底儿童名称，并直接接入教师生产工作台。
- suggestedFix: 所有统计从 `viewModel`/`useApp` 真实数据派生；无真实记录时渲染空状态或隐藏对应行。若仍需设计稿演示数据，应放入显式 demo/visual mode 并清晰标识。
- ownerSuggested: teacher/workbench
- blocksRelease: false
- notes: Static evidence: `visualClassSize`、`visualAttendance`、`abnormalCount`、`waitingMessages`、`pendingRecords` 使用 `Math.max`；`highPriorityChildren` 使用硬编码兜底姓名。

### BUG-B25-002

- bugId: BUG-B25-002
- title: 园长看板真实 state 与静态 KPI/趋势/档案 mock 混用
- severity: P2
- status: open
- foundByThread: B25
- role: director
- demoAccount: 王园长
- route: /admin
- viewport: unknown
- browser: Static code scan; no browser run
- reproSteps: 以园长账号打开 `/admin`；准备或模拟 `healthAbnormalCount`、`pendingDispatchCount`、`feedbackCompletionRate`、`priorityTopItems` 等为 0/空的数据状态；观察 KPI、风险预警、闭环待办、儿童档案和本周反馈是否仍展示非零或静态设计稿数据。
- expected: 园长看板应展示 `adminContext`/`home` 的真实数据；真实 0 值应保留为 0，空列表应展示空状态，不应回退为设计稿默认 KPI 或儿童档案。
- actual: `DirectorDashboardReplica` 同时使用真实 `scope`/`home` 与静态 `weeklyTrendSeries`、`classDistribution`、`weeklyPendingRows`、`childArchiveRows`，并通过 `||` 或 `Math.max` 将 0/空状态替换为 1.2%、1、3、5、100% 等默认值。
- consoleErrors: none; static scan only
- networkErrors: none; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B25/data-state-empty-error-scan.md
- sourceFilesSuspected: components/admin/pixel-replica/DirectorDashboardReplica.tsx; components/admin/pixel-replica/directorReplicaData.ts
- likelyCause: P20 像素复刻的静态图表、分布、闭环和儿童档案数据未从真实仪表盘路径剥离，零值又被 truthy fallback 覆盖。
- suggestedFix: 从 `home`/`adminContext` 派生 KPI、图表、档案和待办行；使用 `??` 保留合法 0 值；当真实数组为空时接入设计好的空状态，不使用静态 mock 代替真实业务数据。
- ownerSuggested: admin/dashboard
- blocksRelease: false
- notes: Static evidence: `healthAbnormalCount || 1.2`、`scope.visibleChildren || 108`、`Math.max(..., 5)`、`weeklyPendingRows`、`childArchiveRows`、`feedbackCompletionRate || 100`。

### BUG-B25-003

- bugId: BUG-B25-003
- title: 家长反馈表单硬编码孩子姓名和班级，忽略当前 child 参数
- severity: P2
- status: open
- foundByThread: B25
- role: parent
- demoAccount: 林妈妈
- route: /parent/agent?child=c-1#feedback
- viewport: unknown
- browser: Static code scan; no browser run
- reproSteps: 以家长账号打开 `/parent/agent?child=c-1#feedback`；切换或构造另一个授权 `child` 参数后再次打开反馈区；观察反馈卡片标题中的孩子姓名和班级是否仍为“小宇 / 小一班”。
- expected: 反馈表单展示的孩子姓名和班级应与 `selectedFeed.child` 及 URL `child` 参数一致，提交 payload 的 `childId` 与页面文案不能错配。
- actual: `ParentStructuredFeedbackComposer` 只接收 `childId`，却在 UI 中硬编码“小宇”和“小一班”；父页面传入的是 `selectedFeed.child.id`，导致显示身份可能和实际提交 `childId` 不一致。
- consoleErrors: none; static scan only
- networkErrors: none; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B25/data-state-empty-error-scan.md
- sourceFilesSuspected: components/parent/ParentStructuredFeedbackComposer.tsx; app/parent/agent/page.tsx
- likelyCause: P40 家长反馈复刻把设计稿里的儿童身份文案保留为组件内常量，但组件提交逻辑已经使用真实 `childId`。
- suggestedFix: 从 `selectedFeed.child` 向 `ParentStructuredFeedbackComposer` 传入 `childName`/`className` 并渲染；保留 `key` by `childId` 的重置逻辑，移除硬编码姓名和班级。
- ownerSuggested: parent/feedback
- blocksRelease: false
- notes: Static evidence: `ParentStructuredFeedbackComposer` header render literal 小宇/小一班 while parent page only passes `childId`.

### BUG-B21-001

- bugId: BUG-B21-001
- title: 家长成长绘本自动注入 demoSeed 并把演示种子内容发送到真实生成接口
- severity: P1
- status: confirmed
- foundByThread: B21
- role: parent
- demoAccount: 林妈妈
- route: /parent; /parent/agent?child=c-1; /parent/storybook?child=c-1&demoSeed=recording-c1-bedtime
- viewport: unknown
- browser: Static code scan; no browser run
- reproSteps: 以家长示例账号登录；从 `/parent` 或 `/parent/agent?child=c-1` 点击成长绘本入口；观察 URL 自动带上 `demoSeed=recording-c1-bedtime`；触发生成后检查 `/api/ai/parent-storybook` 请求体。
- expected: visual-only/demo seed 只应用于显式录屏或开发场景，不应在普通家长路径里改写 URL、请求体或缓存数据。
- actual: 普通家长路径会解析默认 demo seed，并在构建 `ParentStoryBookRequest` 时用 demo seed 覆盖/合并 `highlightCandidates`、`latestInterventionCard`、`latestConsultation` 等字段，再 POST 到 `/api/ai/parent-storybook`。
- consoleErrors: none; static scan only
- networkErrors: none; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B21/visual-only-mock-scan.md
- sourceFilesSuspected: app/parent/page.tsx; app/parent/agent/page.tsx; app/parent/storybook/page.tsx; lib/agent/parent-storybook-demo-seeds.ts
- likelyCause: Pixel/demo recording seed was wired into normal parent navigation and storybook request construction.
- suggestedFix: Keep demo seed behind an explicit screenshot/dev flag, do not auto-inject `demoSeed` in normal parent navigation, and prevent seeded demo fields from entering real API/cache calls.
- ownerSuggested: parent/storybook
- blocksRelease: true
- notes: This is distinct from existing parent storybook 503 records; it tracks mock/demo data entering the real request path.

### BUG-B21-002

- bugId: BUG-B21-002
- title: 教师 AI 页语音/OCR 入口创建 mock 草稿并可进入真实持久化队列
- severity: P1
- status: confirmed
- foundByThread: B21
- role: teacher
- demoAccount: 李老师；周老师
- route: /teacher/agent
- viewport: unknown
- browser: Static code scan; no browser run
- reproSteps: 打开教师 AI 页；点击“语音速记”“OCR 草稿”或 mock-understanding 预设入口；确认草稿；检查 `mobileDrafts` 快照和 `/api/state` 同步 payload。
- expected: mock 语音/OCR 草稿只应在明确 demo/dev 模式下出现，且不得混入真实移动端协同草稿队列或远程状态同步。
- actual: UI 入口直接调用 `buildMockVoiceDraft`、`buildMockOcrDraft` 和 mock ASR fallback，并通过 `saveMobileDraft`、`TeacherDraftConfirmationPanel`、`persistAppSnapshotNow` 进入真实 app snapshot/remote sync 路径。
- consoleErrors: none; static scan only
- networkErrors: none; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B21/visual-only-mock-scan.md
- sourceFilesSuspected: app/teacher/agent/page.tsx; lib/mobile/voice-input.ts; lib/mobile/ocr-input.ts; lib/mobile/teacher-draft-records.ts; lib/store.tsx
- likelyCause: Design/demo draft builders are connected to production persistence adapters.
- suggestedFix: Gate mock draft creation to demo/dev mode, visibly label it as demo-only, and block `source: mock-*` drafts from remote sync unless explicitly running a demo flow.
- ownerSuggested: teacher/agent
- blocksRelease: true
- notes: This matches B21 mock-data risk: mock data can be saved as if it were teacher-created business data.

### BUG-B21-003

- bugId: BUG-B21-003
- title: 园长 replica 看板和周报展示静态 mock 数据及过期日期但缺少一致占位标识
- severity: P2
- status: confirmed
- foundByThread: B21
- role: director
- demoAccount: 陈园长
- route: /admin; /admin/agent; /admin/agent?action=weekly-report
- viewport: unknown
- browser: Static code scan; no browser run
- reproSteps: 打开园长首页、园长 AI 助手和周报页；检查趋势图、班级分布、儿童档案抽屉、本周反馈和待办闭环列表；对照当前日期和真实 scope 数据。
- expected: visual-only/static fallback 数据在核心业务页面中应有明确“演示/视觉占位”标识，或从真实 view model 派生，不应展示过期日期和硬编码完成数。
- actual: `directorReplicaData` 中的趋势、班级分布、儿童档案、assigned objects、weekly pending rows 等静态数据直接渲染到核心页面；部分日期仍为 2025，反馈完成数硬编码为 `96 / 96`。
- consoleErrors: none; static scan only
- networkErrors: none; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B21/visual-only-mock-scan.md
- sourceFilesSuspected: components/admin/pixel-replica/directorReplicaData.ts; components/admin/pixel-replica/DirectorDashboardReplica.tsx; components/admin/pixel-replica/DirectorWeeklyReportReplica.tsx; components/admin/pixel-replica/DirectorAgentReplica.tsx
- likelyCause: Pixel replica fallback data is rendered inside core dashboard/report surfaces without consistent display-only affordance.
- suggestedFix: Derive data from the real view model where available; otherwise add visible “演示/视觉占位” labels and avoid stale dates or hard-coded totals.
- ownerSuggested: admin/pixel-replica
- blocksRelease: false
- notes: Existing B11 records cover some individual director interactions; this record groups the static/mock data contamination risk.

### BUG-B21-004

- bugId: BUG-B21-004
- title: 园长导出/分享/使用说明按钮启用但没有处理逻辑或不可用反馈
- severity: P2
- status: confirmed
- foundByThread: B21
- role: director
- demoAccount: 陈园长
- route: /admin; /admin/agent; /admin/agent?action=weekly-report
- viewport: unknown
- browser: Static code scan; no browser run
- reproSteps: 打开园长首页、周报页和 AI 助手；点击“导出周报”“分享周报”“使用说明”；观察是否有下载、分享、弹窗、toast 或禁用提示。
- expected: 看起来可点击的业务按钮应连接真实功能；无真实功能时应 disabled 或显示“暂未开放/视觉占位”。
- actual: 多个 `ReplicaButton` 以启用态渲染但没有 `onClick`、链接、disabled 状态或不可用反馈。
- consoleErrors: none; static scan only
- networkErrors: none; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B21/visual-only-mock-scan.md
- sourceFilesSuspected: components/admin/pixel-replica/DirectorDashboardReplica.tsx; components/admin/pixel-replica/DirectorWeeklyReportReplica.tsx; components/admin/pixel-replica/DirectorAgentReplica.tsx; components/admin/pixel-replica/DirectorReplicaPrimitives.tsx
- likelyCause: Visual-only action buttons were left enabled after pixel replication.
- suggestedFix: Wire real export/share/help actions, or mark them disabled with “暂未开放/视觉占位” feedback.
- ownerSuggested: admin/pixel-replica
- blocksRelease: false
- notes: Existing BUG-B11-003 tracks the mislabeled refresh CTA separately; this record covers other enabled no-op replica buttons.

### BUG-B21-005

- bugId: BUG-B21-005
- title: 教师工作台移动端铃铛和“自定义”入口看似可交互但无逻辑反馈
- severity: P3
- status: confirmed
- foundByThread: B21
- role: teacher
- demoAccount: 李老师；周老师
- route: /teacher
- viewport: mobile
- browser: Static code scan; no browser run
- reproSteps: 在移动端视口打开教师工作台；点击顶部通知铃铛和“快速入口”区域的“自定义”；观察是否打开通知、设置、toast 或禁用说明。
- expected: 移动端通知和快捷入口自定义控件应有真实逻辑；若仅为视觉复刻，应降级为非交互元素或明确标注暂未开放。
- actual: 通知铃铛是无处理逻辑的 `<button>`，`自定义` 只是视觉文本；两者都没有可见反馈。
- consoleErrors: none; static scan only
- networkErrors: none; static scan only
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B21/visual-only-mock-scan.md
- sourceFilesSuspected: components/teacher/TeacherWorkbenchPage.tsx
- likelyCause: Decorative pixel-replica controls were implemented with active-looking UI affordances.
- suggestedFix: Connect them to real notification/settings flows, or render them as non-interactive/disabled with clear unavailable state.
- ownerSuggested: teacher/workbench
- blocksRelease: false
- notes: Teacher task-row no-op behavior is already tracked by BUG-B12-001; this entry covers additional mobile visual-only controls.

### BUG-B20-001

- bugId: BUG-B20-001
- title: 全仓 TypeScript 检查失败，测试与截图脚本类型已偏离当前契约
- severity: P2
- status: confirmed
- foundByThread: B20
- role: shared
- demoAccount: none
- route: shared
- viewport: unknown
- browser: CLI on Windows PowerShell; Node v22.20.0; Next.js 16.1.6
- reproSteps: Run `.\node_modules\.bin\tsc.cmd --noEmit --pretty false --incremental false`.
- expected: 全仓 TypeScript 检查应通过，测试、截图脚本和生产契约保持一致，并能作为独立质量门禁运行。
- actual: TypeScript exits with code 2 and reports 91 errors across 18 test/capture files, mostly stale fixtures, literal union mismatches, readonly array mismatches, missing required fields, non-exported imports, and `ManifestEntry` not assignable to `Record<string, unknown>`.
- consoleErrors: n/a; CLI TypeScript errors
- networkErrors: none; command does not use network
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B20/command-results.json
- sourceFilesSuspected: lib/agent/parent-weekly-report.test.ts; lib/tasks/task-model.test.ts; lib/agent/parent-message-reflexion.test.ts; tests/visual/capture-ui-screenshots.spec.ts; related AI/storybook/admin test fixtures
- likelyCause: Production contracts evolved, but unit/visual test fixtures and helper typings were not updated; no package `typecheck` script catches whole-repo drift.
- suggestedFix: Update stale test fixtures to current domain types, narrow union snapshots before property access, avoid `as const` where mutable arrays are required, export or stop importing non-public helpers, then add a `typecheck` script.
- ownerSuggested: shared/test-infra
- blocksRelease: false
- notes: `npm run build` still passes because Next's production type phase does not typecheck all included test fixtures the same way this direct whole-repo `tsc` command does.

### BUG-B20-002

- bugId: BUG-B20-002
- title: `npm run test:parent-message-mapper` 无法解析 `@/lib` 路径别名
- severity: P2
- status: confirmed
- foundByThread: B20
- role: shared
- demoAccount: none
- route: shared
- viewport: unknown
- browser: CLI on Windows PowerShell; Node v22.20.0
- reproSteps: Run `npm run test:parent-message-mapper`.
- expected: Declared npm test script should execute the parent message mapper tests without module resolution failures.
- actual: Node exits with `ERR_MODULE_NOT_FOUND: Cannot find package '@/lib' imported from lib/agent/parent-message-reflexion.ts`.
- consoleErrors: `ERR_MODULE_NOT_FOUND` from Node native test runner
- networkErrors: none; command does not use network
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B20/command-results.json
- sourceFilesSuspected: package.json; lib/agent/parent-message-reflexion.ts; lib/agent/parent-message-reflexion.test.ts; tsconfig.json
- likelyCause: The script uses `node --test` directly, but Node does not honor TypeScript `paths` aliases such as `@/*`.
- suggestedFix: Run tests through a loader/runtime that supports TS path aliases, precompile tests before execution, or replace runtime `@/` imports in directly executed test targets with resolvable relative/package imports.
- ownerSuggested: shared/test-infra
- blocksRelease: false
- notes: This is the only `test`-like script in `package.json`; there is no root `test`, `typecheck`, or `preview` script.

### BUG-B24-001

- bugId: BUG-B24-001
- title: 登录页移动端仍下载 857KB 桌面裁剪大图
- severity: P2
- status: confirmed
- foundByThread: B24
- role: guest
- demoAccount: none
- route: /login
- viewport: mobile 390x844
- browser: Playwright Chromium mobile 390x844; static code scan
- reproSteps: 在 390x844 移动端视口打开 `/login`；观察网络请求；确认页面仍请求 `/_next/static/media/login-left-replica.*.png`。
- expected: 移动端登录页不应下载仅桌面断点展示的裁剪大图；隐藏图片不应被 `priority` 预加载。
- actual: 移动端仍下载 `login-left-replica.26ef4a3b.png`，传输约 857.4KB；CSS 仅用 `display: none` 隐藏该图片。
- consoleErrors: none observed
- networkErrors: none; image request returns 200 but is unnecessary mobile payload
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B24/css-assets-responsive-scan.md
- sourceFilesSuspected: app/login/page.tsx; app/login/login-pixel.module.css
- likelyCause: `app/login/page.tsx` 始终渲染带 `priority` 和 `unoptimized` 的 `loginLeftReplica` Image，移动端只在 CSS 中隐藏，浏览器仍会下载资源。
- suggestedFix: 只在桌面断点渲染该图片，或移除移动端 preload/priority；可改为响应式 picture/media、客户端断点条件渲染，或把桌面装饰图延迟到 901px 以上加载。
- ownerSuggested: login/ui
- blocksRelease: false
- notes: `app/login/page.tsx:261` 渲染图片；`app/login/login-pixel.module.css:42` 默认隐藏，`app/login/login-pixel.module.css:773` 仅桌面显示。

### BUG-B24-002

- bugId: BUG-B24-002
- title: 绘本查看器所有场景图固定 eager loading，长绘本首屏加载过重
- severity: P3
- status: confirmed
- foundByThread: B24
- role: parent
- demoAccount: 林妈妈
- route: /parent/storybook?child=c-1
- viewport: desktop and mobile
- browser: Static code scan; Playwright route smoke at mobile 390x844
- reproSteps: 打开 `/parent/storybook?child=c-1`；选择含多页场景的绘本；观察每个 `StoryBookImage` 都以 eager 方式参与加载。
- expected: 首屏或当前页图片可以 eager，其余未展示场景图应 lazy loading，避免一次性加载多页大图。
- actual: `StoryBookImage` 固定输出 `loading="eager"`，所有传入的场景图都按 eager 处理。
- consoleErrors: none; static scan only
- networkErrors: none; loading strategy issue, not 404
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B24/css-assets-responsive-scan.md
- sourceFilesSuspected: components/parent/StoryBookViewer.tsx
- likelyCause: 通用图片组件没有根据当前页、首屏状态或图片可见性区分 eager/lazy，导致多页绘本场景图共享同一个 eager 策略。
- suggestedFix: 给 `StoryBookImage` 增加 loading 参数；当前页或首屏图使用 eager，其余页使用 lazy，并保留 `decoding="async"`。
- ownerSuggested: parent/storybook
- blocksRelease: false
- notes: `components/parent/StoryBookViewer.tsx:309` 定义 `StoryBookImage`，`components/parent/StoryBookViewer.tsx:315` 固定 `loading="eager"`。

### BUG-B24-003

- bugId: BUG-B24-003
- title: Pixel replica 运行时数据保留 Windows 中文绝对源路径
- severity: P3
- status: confirmed
- foundByThread: B24
- role: shared
- demoAccount: none
- route: shared/assets
- viewport: unknown
- browser: Static asset scan; Windows PowerShell path inspection
- reproSteps: 打开 `public/pixel-replica/manifest.json` 或查看 `components/admin/pixel-replica/directorReplicaData.ts`；搜索 `C:\\Users\\12804\\Desktop\\childcare-smart源代码\\前端重构`；确认运行时可访问文件中包含本机绝对路径。
- expected: 生产可访问的 public manifest 和运行时代码只包含 public URL、basename 或相对路径；本机绝对源路径只应存在于 artifacts-only 报告或本地脚本输入中。
- actual: `public/pixel-replica/manifest.json` 暴露 `sourceRoot`、`sourceAbsolutePath`；`directorReplicaData.ts` 暴露多个 `C:\\Users\\...\\前端重构\\...png` 源路径。
- consoleErrors: none; static scan only
- networkErrors: none; path hygiene and deploy portability issue
- screenshotBefore:
- screenshotAfter:
- videoOrTrace: artifacts/bug-bash/B24/css-assets-responsive-scan.md
- sourceFilesSuspected: public/pixel-replica/manifest.json; components/admin/pixel-replica/directorReplicaData.ts; scripts/extract-pixel-assets.mjs
- likelyCause: 裁剪素材提取脚本把本机设计图源路径写入 public manifest，同时 admin replica runtime 数据保留了调试用 `sourceReferences`。
- suggestedFix: public/runtime 数据只保留 `publicPath`、basename 或相对设计标识；将 `sourceRoot`、`sourceAbsolutePath` 和 `sourceReferences` 移到 artifacts-only 报告，或在构建前剥离这些字段。
- ownerSuggested: pixel-replica/assets
- blocksRelease: false
- notes: 该问题不表现为 404，但会泄露本机路径并降低 Windows 中文路径以外环境的可移植性。

### BUG-B26-001

- bugId: BUG-B26-001
- title: B26 smoke confirms director notification-events 503 on /admin and /admin/agent
- severity: P2
- status: duplicate
- foundByThread: B26
- role: director
- demoAccount: 陈园长
- route: /admin; /admin/agent
- viewport: desktop
- browser: Playwright Chromium via npm run bugbash:smoke against BUGBASH_BASE_URL=http://127.0.0.1:3000
- reproSteps: Set `BUGBASH_BASE_URL=http://127.0.0.1:3000`; run `npm run bugbash:smoke`; let the test click 陈园长, load `/admin`, refresh `/admin`, open `/admin/agent`, and refresh `/admin/agent`; inspect `artifacts/bug-bash/B26/b26-smoke-results.json`.
- expected: Director home and AI assistant routes should not emit same-origin 5xx API failures or console resource errors during normal demo navigation and refresh.
- actual: B26 smoke recorded repeated `GET /api/admin/notification-events` -> 503 on `/admin` and `/admin/agent`, with matching console resource errors. Pages did not white-screen and refresh checks passed.
- consoleErrors: `Failed to load resource: the server responded with a status of 503 (Service Unavailable)`
- networkErrors: `GET /api/admin/notification-events` -> 503, observed 8 times in the B26 smoke run
- screenshotBefore:
- screenshotAfter: artifacts/bug-bash/B26/failures/u-admin-scenario-final-1777425339469.png
- videoOrTrace: artifacts/bug-bash/B26/b26-smoke-results.json; artifacts/bug-bash/B26/playwright-output/tests-bug-bash-real-user-smoke-B26-real-user-smoke-chromium/trace.zip
- sourceFilesSuspected: app/api/admin/notification-events/route.ts; lib/db/notification-events.ts; app/admin/page.tsx; app/admin/agent/page.tsx
- likelyCause: Same as BUG-001: the local/demo notification event dependency returns 503 instead of a stable empty/fallback response, and both director routes request it during normal navigation.
- suggestedFix: Reuse the BUG-001 fix: provide a demo-safe fallback or handle unavailable notification-events without surfacing 503 console/network errors.
- ownerSuggested: admin/dashboard
- blocksRelease: false
- notes: Duplicate confirmation of BUG-001 from the new B26 regression suite. Login, menu click, nonblank checks, and refresh checks all passed for 陈园长.

### BUG-B26-002

- bugId: BUG-B26-002
- title: B26 smoke confirms parent home suggestions API 500 on desktop and mobile
- severity: P2
- status: duplicate
- foundByThread: B26
- role: parent
- demoAccount: 林妈妈
- route: /parent; /parent?child=c-1
- viewport: desktop; mobile
- browser: Playwright Chromium via npm run bugbash:smoke against BUGBASH_BASE_URL=http://127.0.0.1:3000
- reproSteps: Set `BUGBASH_BASE_URL=http://127.0.0.1:3000`; run `npm run bugbash:smoke`; let the test click 林妈妈, load `/parent`, refresh it, and check mobile `/parent?child=c-1`; inspect `artifacts/bug-bash/B26/b26-smoke-results.json`.
- expected: Parent home should render AI suggestions through a successful response or a handled demo fallback, without 500 console/network errors on desktop or mobile.
- actual: B26 smoke recorded `POST /api/ai/suggestions` -> 500 on `/parent` and `/parent?child=c-1`, with matching console resource errors. Pages did not white-screen; mobile `scrollWidth` equaled `clientWidth`, so no horizontal overflow was detected.
- consoleErrors: `Failed to load resource: the server responded with a status of 500 (Internal Server Error)`
- networkErrors: `POST /api/ai/suggestions` -> 500, observed 5 times in the B26 smoke run
- screenshotBefore:
- screenshotAfter: artifacts/bug-bash/B26/failures/u-parent-scenario-final-1777425382183.png; artifacts/bug-bash/B26/failures/mobile-parent-child-c-1-failure-1777425398932.png
- videoOrTrace: artifacts/bug-bash/B26/b26-smoke-results.json; artifacts/bug-bash/B26/playwright-output/tests-bug-bash-real-user-smoke-B26-real-user-smoke-chromium/trace.zip
- sourceFilesSuspected: app/api/ai/suggestions/route.ts; lib/ai/server.ts; lib/server/brain-client.ts; app/parent/page.tsx
- likelyCause: Same as BUG-002: parent suggestions do not return a stable demo-safe fallback when the AI/brain provider path fails.
- suggestedFix: Reuse the BUG-002 fix: catch suggestions generation/provider failures and return a traceable fallback payload instead of a 500.
- ownerSuggested: parent/ai
- blocksRelease: false
- notes: Duplicate confirmation of BUG-002 from the new B26 regression suite. Login, parent menu click, nonblank checks, route refresh, and mobile horizontal overflow checks passed.

### BUG-B26-003

- bugId: BUG-B26-003
- title: B26 smoke confirms parent storybook generation API 503 from main menu path
- severity: P2
- status: duplicate
- foundByThread: B26
- role: parent
- demoAccount: 林妈妈
- route: /parent/storybook?child=c-1&demoSeed=recording-c1-bedtime
- viewport: desktop
- browser: Playwright Chromium via npm run bugbash:smoke against BUGBASH_BASE_URL=http://127.0.0.1:3000
- reproSteps: Set `BUGBASH_BASE_URL=http://127.0.0.1:3000`; run `npm run bugbash:smoke`; let the test click 林妈妈 and open the parent storybook main menu entry; inspect `artifacts/bug-bash/B26/b26-smoke-results.json`.
- expected: Parent storybook menu route should load generated or demo fallback storybook content without surfacing a 503 during the normal demo path.
- actual: B26 smoke opened the storybook route successfully and it did not white-screen, but recorded `POST /api/ai/parent-storybook` -> 503 with matching console resource errors.
- consoleErrors: `Failed to load resource: the server responded with a status of 503 (Service Unavailable)`
- networkErrors: `POST /api/ai/parent-storybook` -> 503, observed 2 times in the B26 smoke run
- screenshotBefore:
- screenshotAfter: artifacts/bug-bash/B26/failures/u-parent-scenario-final-1777425382183.png
- videoOrTrace: artifacts/bug-bash/B26/b26-smoke-results.json; artifacts/bug-bash/B26/playwright-output/tests-bug-bash-real-user-smoke-B26-real-user-smoke-chromium/trace.zip
- sourceFilesSuspected: app/api/ai/parent-storybook/route.ts; lib/server/brain-client.ts; lib/server/parent-storybook-cache.ts; components/parent/StoryBookViewer.tsx
- likelyCause: Same as BUG-003: the storybook route returns brain-proxy-unavailable 503 instead of a complete demo-safe cached/mock response when the service is unavailable.
- suggestedFix: Reuse the BUG-003 fix: provide cached/demo storybook content or a handled fallback response for unavailable storybook generation.
- ownerSuggested: parent/storybook
- blocksRelease: false
- notes: Duplicate confirmation of BUG-003 from the new B26 regression suite. The storybook page and refresh remained nonblank; the failure is the API/console error path.

