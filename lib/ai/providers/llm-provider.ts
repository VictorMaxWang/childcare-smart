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
  mode: "mock" | "real";
  output: T;
}

export interface LlmProvider {
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
      `${input.childName} 当前已进入高风险闭环，建议先完成园内复核，再在今晚完成一次家庭配合，并在 48 小时内复查看风险是否下降。`,
      longTermTrait ? `这次判断还参考了长期特征：${longTermTrait}。` : "",
      recentSignal ? `近期连续信号是：${recentSignal}。` : "",
    ]
      .filter(Boolean)
      .join(" "),
    parentMessageDraft: [
      `${input.childName} 今天在园出现需要重点关注的连续信号。今晚请优先完成：${input.tonightAtHomeActions[0] ?? "一项家庭稳定动作"}。`,
      lastConsultation ? `上次会诊提醒过：${lastConsultation}。` : "",
      openLoop ? `这次也请继续观察：${openLoop}。` : "完成后请反馈孩子反应、是否改善，以及是否仍有异常。",
    ]
      .filter(Boolean)
      .join(" "),
    directorReason: [
      `${input.childName} 同时命中 ${input.triggerReasons.length} 类风险信号，需要老师、家长、园长在同一条闭环里协同处理。`,
      recentSignal ? `近期连续上下文显示：${recentSignal}。` : "",
      openLoop ? `且仍有未闭环事项：${openLoop}。` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

async function requestDashscopeNarrative(
  input: HighRiskConsultationLlmInput
): Promise<HighRiskConsultationLlmOutput | null> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return null;

  const prompt = [
    "你是移动端托育 AI 助手的高风险会诊文案引擎。",
    "请输出严格 JSON，字段只能是 summary、parentMessageDraft、directorReason。",
    "summary 适合教师端一屏展示，100 字以内。",
    "parentMessageDraft 适合家长任务卡，强调今晚动作与反馈。",
    "directorReason 适合园长优先级决策卡，强调为什么今天要优先盯住。",
    "如果输入里包含 longTermTraits、recentContinuitySignals、lastConsultationTakeaways、openLoops，请吸收真正相关的连续性上下文，但不要暴露原始字段名或技术术语。",
    JSON.stringify(input),
  ].join("\n");

  try {
    const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "qwen-turbo",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "你是托育高风险会诊文案助手，只输出 JSON。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const raw = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = raw.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as Partial<HighRiskConsultationLlmOutput>;
    if (!parsed.summary || !parsed.parentMessageDraft || !parsed.directorReason) {
      return null;
    }

    return {
      summary: parsed.summary,
      parentMessageDraft: parsed.parentMessageDraft,
      directorReason: parsed.directorReason,
    };
  } catch {
    return null;
  }
}

class MockLlmProvider implements LlmProvider {
  async generateHighRiskConsultationNarrative(input: HighRiskConsultationLlmInput) {
    return {
      provider: "mock-llm",
      mode: "mock" as const,
      output: buildMockNarrative(input),
    };
  }
}

class DashscopeLlmProvider implements LlmProvider {
  async generateHighRiskConsultationNarrative(input: HighRiskConsultationLlmInput) {
    const output = (await requestDashscopeNarrative(input)) ?? buildMockNarrative(input);

    return {
      provider: "dashscope-llm",
      mode: "real" as const,
      output,
    };
  }
}

export function resolveLlmProvider(): LlmProvider {
  return process.env.DASHSCOPE_API_KEY ? new DashscopeLlmProvider() : new MockLlmProvider();
}
