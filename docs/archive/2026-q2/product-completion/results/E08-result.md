# E08 教师端语音助手技能结果

状态：partial

E08 教师语音技能已接入 E06 command bus，执行器只通过 E01 `AppDataService` 和 E01 API/service 写入，不直接调用 vivo，不新建 vivo client，不让教师语音命令直接写 localStorage。

## 已完成

- 晨检：支持“小明”昵称、体温三十六点八、咳嗽/提醒家长等语义，确认后 upsert 健康记录。
- 饮食：支持单儿童午餐记录和班级批量午餐记录，班级批量受 teacher class scope 限制。
- 成长：支持新增成长记录并在家长端可读记录摘要。
- 回复家长：按 messageId 或 scoped child 最新家长消息定位，确认后发送真实回复。
- 健康材料：支持打开解析页和创建 pending 解析任务；真实解析仍走 E05 provider/page。
- 会诊：支持确认后创建高风险会诊。
- 派单：将园长派单映射为会诊 director decision card，支持跟进中和已完成状态。
- 查询/跳转：支持今日任务、未回复家长消息、儿童档案、儿童/班级状态查询。
- 权限：李老师仅操作向阳班/负责儿童；周老师操作小明返回 forbidden_scope 且不落库。

## 验收

- `npm run test:voice-assistant-parser`：13/13 passed（在最终 `product:voice` 中）。
- E08 targeted Playwright：4/4 passed。
- 截图目录：`artifacts/product-completion/E08/`
  - `teacher-voice-morning-check-preview.png`
  - `teacher-voice-morning-check-executed.png`
  - `teacher-voice-open-communication.png`
  - `teacher-voice-open-health-file-bridge.png`
  - `teacher-mobile-voice-orb.png`

## 检查

- `npm run lint`：passed。
- `npm run build`：passed。
- `npm run feature:smoke`：failed。先失败在旧 D08 communication/localStorage 断言，随后 dev server 掉线导致后续多项 `ECONNREFUSED`。
- `npm run product:voice`：partial/failed。parser 13/13 passed；Playwright 在 E07 director suite 中遇到 dev-server `ECONNRESET`/brain proxy fallback，未完整跑完所有 voice suites。E08 targeted suite 已单独通过。

## 遗留

- 全量 `feature:smoke` 和 `product:voice` 需要单独处理非 E08 的旧 D08/E07 稳定性问题。
- 同名儿童/同家长称呼的选择器 UI 仍建议产品化；当前已优先儿童姓名/昵称匹配并保留 scope 拦截。
