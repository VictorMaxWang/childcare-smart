import {
  getVivoProviderStatus,
  requestVivoChat,
  type VivoProviderStatus,
} from "@/lib/providers/vivo";

export interface HighRiskConsultationLlmInput {
  childName: string;
  className: string;
  riskLevel: "low" | "medium" | "high";
  triggerReasons: string[];
  keyFindings: string[];
  todayInSchoolActions: string[];
  tonightAtHomeActions: string[];
  nextCheckpoints: string[];
  longTermTraits?: string[];
  recentContinuitySignals?: string[];
  lastConsultationTakeaways?: string[];
  openLoops?: string[];
}

export interface HighRiskConsultationLlmOutput {
  summary: string;
  parentMessageDraft: string;
  directorReason: string;
}

export interface LlmProviderResult<T> {
  provider: string;
  mode: "fallback" | "mock" | "real";
  model?: string;
  warnings?: string[];
  providerStatus?: VivoProviderStatus;
  output: T;
}

export interface LlmProvider {
  getStatus(): VivoProviderStatus;
  generateHighRiskConsultationNarrative(
    input: HighRiskConsultationLlmInput
  ): Promise<LlmProviderResult<HighRiskConsultationLlmOutput>>;
}

function buildMockNarrative(input: HighRiskConsultationLlmInput): HighRiskConsultationLlmOutput {
  const longTermTrait = input.longTermTraits?.[0];
  const recentSignal = input.recentContinuitySignals?.[0];
  const lastConsultation = input.lastConsultationTakeaways?.[0];
  const openLoop = input.openLoops?.[0];

  return {
    summary: [
      `${input.childName} 当前已进入${input.riskLevel === "high" ? "高" : "重点"}风险闭环，建议先完成园内复核，再在今晚完成一次家庭配合，并在 48 小时内复查看风险是否下降。`,
      longTermTrait ? `本次判断参考了长期特征：${longTermTrait}。` : "",
      recentSignal ? `近期连续信号：${recentSignal}。` : "",
    ]
      .filter(Boolean)
      .join(" "),
    parentMessageDraft: [
      `${input.childName} 今天在园出现需要重点关注的连续信号。今晚请优先完成：${input.tonightAtHomeActions[0] ?? "一项家庭稳定动作"}。`,
      lastConsultation ? `上次会诊提醒过：${lastConsultation}。` : "",
      openLoop ? `也请继续观察：${openLoop}。` : "完成后请反馈孩子反应、是否改善，以及是否仍有异常。",
    ]
      .filter(Boolean)
      .join(" "),
    directorReason: [
      `${input.childName} 同时命中 ${input.triggerReasons.length} 类风险信号，需要老师、家长、园长在同一闭环里协同处理。`,
      recentSignal ? `近期上下文显示：${recentSignal}。` : "",
      openLoop ? `仍有未闭环事项：${openLoop}。` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function parseNarrativeJson(content: string): HighRiskConsultationLlmOutput | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Partial<HighRiskConsultationLlmOutput>;
    if (!parsed.summary || !parsed.parentMessageDraft || !parsed.directorReason) return null;
    return {
      summary: parsed.summary,
      parentMessageDraft: parsed.parentMessageDraft,
      directorReason: parsed.directorReason,
    };
  } catch {
    return null;
  }
}

class LocalRulesLlmProvider implements LlmProvider {
  getStatus() {
    return {
      ...getVivoProviderStatus("chat"),
      configured: false,
      isRealProvider: false,
      warnings: ["未配置 vivo AIGC，当前使用本地规则建议。"],
    };
  }

  async generateHighRiskConsultationNarrative(input: HighRiskConsultationLlmInput) {
    const status = this.getStatus();
    return {
      provider: "local-rules-llm",
      mode: "fallback" as const,
      model: "local-health-rules",
      warnings: status.warnings,
      providerStatus: status,
      output: buildMockNarrative(input),
    };
  }
}

class VivoLlmProvider implements LlmProvider {
  getStatus() {
    return getVivoProviderStatus("chat");
  }

  async generateHighRiskConsultationNarrative(input: HighRiskConsultationLlmInput) {
    const status = this.getStatus();
    try {
      const result = await requestVivoChat({
        messages: [
          {
            role: "system",
            content:
              "你是托育高风险会诊文案助手。只输出 JSON，不要输出 Markdown。字段只能是 summary、parentMessageDraft、directorReason。",
          },
          {
            role: "system",
            content:
              "可信表达边界：这不是医疗诊断；不要把风险贴到儿童身份上；不要承诺改善结果；不要输出治疗、用药或诊断建议；需要时明确建议老师、园长或专业人员人工复核。家长文案必须温和、可执行、非评判。",
          },
          {
            role: "user",
            content: [
              "请根据输入生成会诊摘要、给家长的沟通草稿、园长介入理由。",
              "summary 控制在 100 字以内，parentMessageDraft 强调今晚家庭动作与反馈，directorReason 强调为何需要优先盯住。",
              JSON.stringify(input),
            ].join("\n"),
          },
        ],
        taskType: "high-risk-consultation",
        temperature: 0.2,
        maxTokens: 800,
      });
      const parsed = parseNarrativeJson(result.text);
      if (parsed) {
        return {
          provider: result.providerName,
          mode: "real" as const,
          model: result.model,
          warnings: result.warnings,
          providerStatus: result.status,
          output: parsed,
        };
      }

      return {
        provider: result.providerName,
        mode: "fallback" as const,
        model: result.model,
        warnings: [...result.warnings, "vivo chat 返回内容不是预期 JSON，已降级为本地规则建议。"],
        providerStatus: result.status,
        output: buildMockNarrative(input),
      };
    } catch (error) {
      return {
        provider: "vivo-chat",
        mode: "fallback" as const,
        model: "vivo-chat",
        warnings: [
          error instanceof Error ? error.message : "vivo chat provider 调用失败。",
          "已降级为本地规则建议。",
        ],
        providerStatus: {
          ...status,
          status: "provider-unavailable" as const,
          isRealProvider: false,
        },
        output: buildMockNarrative(input),
      };
    }
  }
}

export function resolveLlmProvider(): LlmProvider {
  const status = getVivoProviderStatus("chat");
  return status.status === "ready" ? new VivoLlmProvider() : new LocalRulesLlmProvider();
}
