# Voice Assistant Spec

## Architecture

三端共用语音球：

```text
VoiceAssistantLayer
  -> Input Adapter
  -> Intent Router
  -> Command Planner
  -> Permission Gate
  -> Confirmation Controller
  -> Executor
  -> Result Presenter
```

## Input Adapter

- 优先使用浏览器 `SpeechRecognition`。
- 可录音时使用 `MediaRecorder` + ASR provider。
- 没有语音能力时显示文本输入 fallback。
- 输出统一为 `AssistantUtterance`。

## Command Shape

```ts
interface AssistantCommand {
  commandId: string;
  role: "director" | "teacher" | "parent";
  intent: "navigate" | "query" | "draft" | "write" | "dispatch" | "generate" | "confirm" | "cancel";
  skill: string;
  targetPage?: string;
  deeplink?: string;
  entities: Record<string, unknown>;
  riskLevel: "safe" | "confirm" | "restricted";
  requiredPermission: string;
  confirmationCopy?: string;
  executorPayload?: Record<string, unknown>;
}
```

## Confirmation

无需确认：

- 页面跳转
- 只读查询
- TTS 朗读

轻确认：

- 保存草稿
- 生成未发送话术
- 生成周报草稿

强确认：

- 发送消息
- 保存正式晨检/饮食/成长记录
- 创建或派发任务
- 发起会诊
- 更新会诊状态
- 归档/恢复
- 导出/分享

## Execution

执行器必须调用真实 store/API action。无法执行时返回明确失败或暂未开放，不能 toast 成功。

