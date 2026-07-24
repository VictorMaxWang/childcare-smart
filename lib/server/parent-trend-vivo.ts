import "server-only";

import type { ParentTrendQueryResponse } from "@/lib/ai/types";
import { buildAiProviderTrace } from "@/lib/ai/provider-trace";
import { requestVivoChat } from "@/lib/providers/vivo";

type ParentTrendVivoDependencies = {
  requestChat: typeof requestVivoChat;
};

const defaultDependencies: ParentTrendVivoDependencies = {
  requestChat: requestVivoChat,
};

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      explanation?: unknown;
      warnings?: unknown;
    };
    const explanation =
      typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
    if (!explanation) return null;
    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];
    return { explanation, warnings };
  } catch {
    return null;
  }
}

function keepDataWarnings(warnings: string[]) {
  return warnings.filter(
    (warning) =>
      !/AI provider|远端趋势服务不可用|本地趋势解释|provider unavailable/iu.test(
        warning
      )
  );
}

/**
 * 趋势数值继续由服务端确定性聚合，Vivo 只负责解释已授权结果，
 * 防止模型改写原始记录或扩大幼儿数据范围。
 */
export async function enhanceParentTrendWithVivo(
  base: ParentTrendQueryResponse,
  dependencies: Partial<ParentTrendVivoDependencies> = {}
): Promise<ParentTrendQueryResponse | null> {
  try {
    const result = await (
      dependencies.requestChat ?? defaultDependencies.requestChat
    )({
      messages: [
        {
          role: "system",
          content:
            "你是托育家长端趋势解释助手。只输出 JSON，不要输出 Markdown。字段只能是 explanation 和 warnings。不要修改输入数值，不做医疗诊断，不承诺结果；数据稀疏时明确说明。",
        },
        {
          role: "user",
          content: [
            "请用简洁中文解释下面的服务端趋势聚合。explanation 控制在 120 到 220 字；warnings 最多 3 条，只保留家长需要知道的数据边界或后续观察点。",
            JSON.stringify({
              question: base.query.question,
              intent: base.intent,
              metric: base.metric,
              windowDays: base.windowDays,
              trendLabel: base.trendLabel,
              trendScore: base.trendScore,
              comparison: base.comparison,
              dataQuality: base.dataQuality,
              supportingSignals: base.supportingSignals.slice(0, 6),
            }),
          ].join("\n"),
        },
      ],
      taskType: "parent-trend-explanation",
      temperature: 0.2,
      maxTokens: 700,
    });
    const parsed = parseJsonObject(result.text);
    if (!parsed) return null;

    return {
      ...base,
      explanation: parsed.explanation,
      warnings: [
        ...new Set([...keepDataWarnings(base.warnings), ...parsed.warnings]),
      ],
      dataQuality: {
        ...base.dataQuality,
        fallbackUsed: false,
      },
      memoryMeta: {
        ...(base.memoryMeta ?? {}),
        mode: "next-vivo-live",
        fallbackReason: null,
      },
      mode: "live",
      provider: result.providerName,
      fallback: false,
      fallbackReason: null,
      providerTrace: buildAiProviderTrace({
        capability: "llm",
        provider: result.providerName,
        source: "ai",
        mode: "live",
        fallback: false,
        fallbackReason: null,
        realProvider: true,
        model: result.model,
        requestId: result.requestId,
        transport: "next-vivo-chat",
        transportSource: "next-server",
        providerStatus: result.status,
        extra: {
          dataSource: base.source,
          analyticsSource: "server-deterministic",
        },
      }),
    };
  } catch {
    return null;
  }
}
