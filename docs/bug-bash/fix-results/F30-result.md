# F30 修复结果

## 分配 bugId

- BUG-B12-001
- BUG-B21-002
- BUG-B21-005
- BUG-B22-002
- BUG-B22-005
- BUG-B22-006
- BUG-B22-007
- BUG-B25-001

## 已修复 bugId

- BUG-B12-001：教师工作台今日待办改为真实链接或明确禁用状态。
- BUG-B21-002：教师 mock 语音/OCR/understanding draft 标记为仅本地演示，远端 `/api/state` payload 过滤 local/mock draft。
- BUG-B21-005：教师移动端通知铃铛接入真实入口，自定义入口改为明确暂未开放。
- BUG-B22-002：高风险会诊生成中禁用按钮，并增加重复启动保护。
- BUG-B22-005：教师家园沟通页改为真实数据派生、可切换 tab/筛选/本地回复，不再显示硬编码家长消息。
- BUG-B22-006：健康材料解析页无文件时不再显示样例上传/解析完成记录，保留真实上传校验和兜底标识。
- BUG-B22-007：高风险会诊筛选、档案入口、下一步动作和讨论输入都有真实行为或本地反馈。
- BUG-B25-001：教师工作台移除 `Math.max` 和兜底儿童，真实展示 0/空状态。

## 未修复 bugId

- 无。

## 教师端修复摘要

- 教师工作台统计、待办、重点儿童、移动端提醒均改为从当前教师可见数据派生。
- mock draft 增加 `persistenceScope`，本地演示草稿只留在本地 UI 和 local storage，远端同步前统一过滤。
- 教师 AI / 家园沟通、健康材料解析、高风险会诊补齐误导性按钮的行为与空状态。

## 复测

- 李老师：Playwright 通过，`/teacher` 可加载，今日待办“晨检登记”可导航到 `/health`。
- 周老师：Playwright 通过，`/teacher` 可加载，今日待办“晨检登记”可导航到 `/health`。
- mock draft：Playwright 通过，点击“语音速记”后显示“仅本地演示”；捕获到的 `/api/state` PUT 中未出现 mock draft 内容。
- 空/零状态：教师工作台和沟通页不再用硬编码数量/姓名覆盖真实状态。
- 健康材料解析：Playwright 通过，无文件提交显示校验错误；无文件时不显示样例“解析完成”；上传 PDF 后展示解析/兜底结果区域。
- 高风险会诊：Playwright 通过，筛选和讨论输入可用；双击生成最多触发 1 次 stream 请求。

## 检查结果

- lint：通过，`npm run lint`。
- build：未通过。首次 `npm run build` 停在非 F30 范围的 `app/api/ai/follow-up/route.ts` union narrowing 类型错误；再次执行时被现有 `.next/lock` 阻塞。

