# OCR And ASR Provider Spec

## Provider Status

所有 OCR/ASR 结果必须暴露：

- `provider`
- `mode`: `real | mock`
- `source`: `provider | provided_transcript | fallback | mock`
- `confidence`
- `fallback`
- `raw`
- `meta`

## OCR

接口：

```ts
interface OcrProvider {
  extract(input: {
    attachmentName?: string;
    fallbackText?: string;
    mimeType?: string;
  }): Promise<OcrProviderResult>;
}
```

没有真实 key 时返回 mock/fallback，并在 UI 显示“演示识别/需人工确认”。OCR 文本不能直接变成正式健康结论，必须由教师确认后归档。

## ASR

接口：

```ts
interface AsrProvider {
  transcribe(input: {
    attachmentName?: string;
    transcript?: string;
    fallbackText?: string;
    mimeType?: string;
    durationMs?: number;
    scene?: string;
  }): Promise<AsrProviderResult>;
}
```

浏览器语音能力不可用时必须显示文本输入 fallback。ASR 低置信度、mock 或 fallback 结果只生成草稿，不直接发送或写正式记录。

