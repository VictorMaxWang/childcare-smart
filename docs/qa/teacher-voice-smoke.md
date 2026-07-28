# Teacher Voice Smoke Checklist

更新时间：`2026-04-04`

本清单只覆盖 Teacher 端语音入口 `T2.5` 的真机 / 浏览器硬化验收，不覆盖 T5 真接线、T4 contract 重构、staging/TLS 修复或 vivo transport 改造。

## 1. 适用范围

- 页面入口：Teacher 端任意页面右下角 `VoiceAssistantFAB`
- 目标链路：`长按录音 -> 上传 -> understand -> 结果弹层 -> 保存草稿 / 继续流转`
- 当前口径：
  - 上传与理解链路允许进入 `best effort fallback`
  - fallback 适合比赛演示与草稿，不代表 live upstream 已完成验收
  - vivo 相关最终格式与上游能力，仍以官方文档为准：[vivo 官方文档](https://aigc.vivo.com.cn/#/document/index?id=1746)

## 2. 测试前准备

- 使用 Teacher 账号登录，并确认当前账号有可见幼儿数据。
- 建议优先准备两台设备：
  - Android Chrome
  - iPhone / iPad Safari
- 测试前清空浏览器对本站的麦克风权限，至少完整验证一次首次授权流程。
- 不要在代码、日志、截图、录屏里展示真实 `VIVO_APP_ID` / `VIVO_APP_KEY`。

## 3. MIME / 格式口径

当前实现是 `best effort`：

- Android Chrome：优先 `audio/webm;codecs=opus`，其次 `audio/webm` / `audio/ogg`
- iOS Safari：优先 `audio/mp4`，文件扩展名按 `.m4a` 归一
- 其他格式映射：
  - `.wav` -> `audio/wav`
  - `.mp3` -> `audio/mpeg`
  - `.pcm` -> `audio/pcm`
- 当浏览器不给出明确 MIME 时：
  - iOS 走 `audio/mp4`
  - 非 iOS 走 `audio/webm`

注意：

- 这不是对 vivo 上游可消费格式的最终认证，只是当前浏览器录音侧和仓库现状下的最稳妥策略。
- 录音结果页里应检查文件名、MIME、录音时长、fallback badge 是否和设备实际行为一致。

## 4. Android Chrome 手工 smoke

1. 打开 Teacher 端任意页面，确认右下角语音球可见。
2. 首次测试时长按语音球，触发麦克风授权。
3. 允许权限后再次长按，连续说 3 到 5 秒。
4. 保持手指在按钮安全区内，松手结束。
5. 验证状态流转：
   - `继续按住`
   - `请求权限中`
   - `录音中`
   - `正在收尾`
   - `上传中`
   - `识别中`
   - `上传完成` 或 `已进入演示回退`
6. 在结果弹层检查：
   - 文件扩展名通常是 `.webm`
   - MIME 通常是 `audio/webm`
   - 时长和文件大小非空
   - 有转写文本
   - 有结构化理解或明确 fallback 提示
7. 点击“保存为教师语音草稿”，确认草稿保存成功。
8. 再做一次“保存并前往教师 AI 助手”或“保存并前往高风险会诊”。

## 5. iOS Safari 手工 smoke

1. 打开 Teacher 端任意页面，确认语音球可见。
2. 首次测试时长按语音球，触发麦克风授权。
3. 授权后再次长按，连续说 3 到 5 秒。
4. 保持手指在按钮安全区内，松手结束。
5. 在结果弹层检查：
   - 文件扩展名优先看是否为 `.m4a`
   - MIME 优先看是否为 `audio/mp4`
   - 若 Safari / WebKit 新版本返回 `.webm`，记录设备系统版本和浏览器版本，不要直接判失败
6. 验证 fallback 提示是否清楚：
   - Upload fallback
   - T4 fallback
   - 双 fallback
7. 完成一次草稿保存。

## 6. 手势与异常态检查

每个平台至少验证一次以下场景：

- 短按后立即松手：
  - 不应误开始录音
- 长按进入录音后滑出按钮安全区：
  - 状态文案变为“松手将取消”
  - 松手后应取消录音，不应上传
- 录音少于 0.6 秒：
  - 应出现“录音太短”
  - 自动回到 idle
- 权限拒绝：
  - 应出现“需要麦克风权限”而不是泛化失败
- 麦克风被其他 App 占用：
  - 应出现“麦克风被占用”或“录音已中断”
- 录音时切后台 / 锁屏 / 来电话：
  - 应中断本次录音
  - 返回页面后不应卡在 `recording` / `stopping`
- 上传或理解 fallback：
  - 结果前应看到 warning toast 或状态提示
  - 结果页应看到 fallback badge / 说明

## 7. 录屏建议路径

比赛录屏建议按这条路径走：

1. Teacher 首页进入，镜头先给到右下角语音球。
2. 长按开始录音，录一条 3 到 5 秒的清晰教师观察语句。
3. 结果弹层里停留 2 到 3 秒，给到：
   - 文件名 / MIME
   - 转写文本
   - 结构化理解
   - fallback badge（如果出现）
4. 点击“保存为教师语音草稿”。
5. 再演示一次“保存并前往教师 AI 助手”或“保存并前往高风险会诊”。

建议话术：

- 正常链路：`老师可以像手机语音助手一样长按录音，系统会把语音变成可保存、可继续流转的教师草稿。`
- fallback 链路：`当前这个版本为了比赛演示做了 best-effort fallback，能保证录音入口稳定可演示，但不把它描述成 live upstream 已完全验收。`

## 8. 当前仍需人工确认的风险

- iOS 不同 WebKit 版本的最终录音 MIME 和扩展名可能不同。
- 真机蓝牙耳机、外接麦克风、电话中断等系统级中断仍需多机型验证。
- 当前 upload 本地 fallback 仍是 demo-safe 的 mock shaped response，不等于真实远端持久化。
- vivo 官方文档页面在当前环境里无法直接机器抽取格式说明，所以最终上游格式兼容仍需人工对照官方文档确认。
