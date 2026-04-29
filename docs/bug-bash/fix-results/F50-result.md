# F50 修复结果

- 分配 bugId：`BUG-B11-006`、`BUG-B22-001`、`BUG-B22-003`
- 已修复 bugId：`BUG-B11-006`、`BUG-B22-001`、`BUG-B22-003`
- 未修复 bugId：无
- 共享组件修复摘要：
  - `/children` 桌面台账增加明确“详情”入口，儿童姓名也可打开档案详情抽屉；移动端儿童卡片增加“查看详情”按钮。
  - `/children` 详情抽屉展示基础档案、监护人、过敏/特殊关注、今日到离园信息；抽屉可关闭，“编辑档案”明确 disabled 并标注“暂未开放”。
  - `/health` 晨检弹窗保存前校验体温必填、数值合法和 `34.0-42.0°C` 范围；非法输入保留弹窗并显示字段错误，不调用保存逻辑。
  - `components/Navbar.tsx` 顶部搜索、通知、消息图标按钮接入“暂未开放”toast 反馈，并补充 title/aria；桌面补齐消息图标入口。

## 复测

- `/children`：Playwright 通过；页面非空，搜索空结果正常，详情抽屉可打开/关闭，删除确认弹窗可打开/取消且未确认删除。
- `/health`：Playwright 通过；页面非空，晨检弹窗可打开，清空体温后保存被阻止并保留弹窗。
- `/growth`：Playwright 通过；页面非空，典型维度筛选可切换。
- `/diet`：Playwright 通过；页面非空，添加食物后批量确认弹窗可打开/取消且未执行最终确认。
- 表单：晨检非法体温阻止提交；饮食批量确认只打开确认弹窗，未执行最终确认。
- 弹窗/抽屉：儿童详情抽屉、删除确认弹窗、饮食批量确认弹窗均可关闭。
- 空状态：`/children` 搜索无结果空状态正常显示。
- mobile：390x844 下 `/children`、`/health`、`/growth`、`/diet` 均无水平溢出；移动端儿童详情抽屉可打开/关闭，移动端通知/消息按钮有 toast 反馈。

## 修改文件

- 新增：
  - `docs/bug-bash/fix-results/F50-result.md`
  - `docs/bug-bash/fix-results/F50-result.json`
- 修改：
  - `app/children/page.tsx`
  - `app/health/page.tsx`
  - `components/Navbar.tsx`

## 结果文件

- F50-result.md：`docs/bug-bash/fix-results/F50-result.md`
- F50-result.json：`docs/bug-bash/fix-results/F50-result.json`

## 检查结果

- lint：通过，`npm run lint`
- build：通过，`npm run build`
- bugbash:smoke：已运行，失败于非 F50 残留；`artifacts/bug-bash/B26/b26-smoke-results.json` 记录 13 个 issues，主要为教师端重复 key console error 和家长 `/api/ai/suggestions` 500（duplicateOf `BUG-002`）。F50 专项 Playwright 复测通过，未发现 F50 路由 console/page/server error。

