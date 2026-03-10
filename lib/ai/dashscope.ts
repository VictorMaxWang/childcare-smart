import type { AiActionPlan, AiSuggestionResponse, ChildSuggestionSnapshot } from "@/lib/ai/types";

const DASHSCOPE_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 12000;

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 5);
}

function normalizeRiskLevel(input: unknown): "low" | "medium" | "high" {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  return "low";
}

function normalizeActionPlan(input: unknown): AiActionPlan | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  const schoolActions = normalizeArray(obj.schoolActions);
  const familyActions = normalizeArray(obj.familyActions);
  const reviewActions = normalizeArray(obj.reviewActions);

  if (schoolActions.length === 0 && familyActions.length === 0 && reviewActions.length === 0) {
    return undefined;
  }

  return {
    schoolActions,
    familyActions,
    reviewActions,
  };
}

function normalizeAiOutput(raw: unknown): Omit<AiSuggestionResponse, "source"> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const riskLevel = normalizeRiskLevel(obj.riskLevel);
  const summary = String(obj.summary ?? "").trim();
  const highlights = normalizeArray(obj.highlights);
  const concerns = normalizeArray(obj.concerns);
  const actions = normalizeArray(obj.actions);
  const actionPlan = normalizeActionPlan(obj.actionPlan);
  const disclaimer = String(obj.disclaimer ?? "").trim();

  if (highlights.length === 0 && concerns.length === 0 && actions.length === 0) {
    return null;
  }

  return {
    riskLevel,
    summary:
      summary ||
      "这几天的记录已经显示出孩子在饮食、情绪和成长上的阶段性变化，建议家园双方围绕最突出的关注点持续配合，边记录边微调日常安排。",
    highlights: highlights.length > 0 ? highlights : ["建议继续观察关键指标变化。"],
    concerns: concerns.length > 0 ? concerns : ["暂无显著高风险信号。"],
    actions: actions.length > 0 ? actions : ["保持晨检、膳食、成长记录的连续性。"],
    actionPlan,
    disclaimer:
      disclaimer ||
      "本建议仅用于托育观察与家园沟通参考，不构成医疗诊断；如出现持续发热或明显异常，请及时就医。",
  };
}

function buildPrompt(snapshot: ChildSuggestionSnapshot): string {
  const modelInput = {
    child: {
      id: snapshot.child.id,
      name: snapshot.child.name,
      ageBand: snapshot.child.ageBand,
      className: snapshot.child.className,
      allergies: snapshot.child.allergies,
      specialNotes: snapshot.child.specialNotes,
    },
    summary: snapshot.summary,
    recentDetails: snapshot.recentDetails,
  };

  return [
    "你是托育机构的风险归纳与建议助手。",
    "你只能做托育建议和风险归纳，不做医疗诊断，不修改业务数据，不触发任何通知。",
    "请根据输入的7天聚合summary和recentDetails输出严格JSON，不要输出任何额外文本。",
    "先给出约100字的个性化总结，再给出带时间粒度的详细行动方案。",
    "JSON字段必须为: riskLevel, summary, highlights, concerns, actions, actionPlan, disclaimer。",
    "riskLevel只能是low|medium|high。",
    "summary必须是中文字符串，长度控制在80到120字之间，语气自然、家长友好、少用术语，像老师向家长做口头说明。",
    "highlights、concerns、actions必须是字符串数组。",
    "highlights写积极表现或稳定信号，concerns写需重点跟进的问题，actions写3到5条具体、可执行、个性化的家园协同方案。",
    "actionPlan必须是对象，包含schoolActions、familyActions、reviewActions三个字符串数组。",
    "schoolActions写今天园内教师或机构要做的动作，familyActions写今晚家庭配合动作，reviewActions写24到72小时内的复查节奏和观察节点。",
    "每一条尽量直接带上时间词，例如今天、今晚、明早、48小时内、本周末前，不要写成泛泛的长期建议。",
    "如果存在过敏、睡眠、情绪、饮水、饮食单一、家长反馈执行情况，请优先结合这些信息，不要空泛重复。",
    "disclaimer必须强调非医疗诊断。",
    "输入: ",
    JSON.stringify(modelInput),
  ].join("\n");
}

export async function requestDashscopeSuggestion(
  snapshot: ChildSuggestionSnapshot
): Promise<Omit<AiSuggestionResponse, "source"> | null> {
  const apiKey = process.env.DASHSCOPE_API_KEY || "";
  const model = process.env.AI_MODEL || "qwen-turbo";

  if (!apiKey) {
    console.warn("[AI] DASHSCOPE_API_KEY is missing, falling back to rules.");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(DASHSCOPE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "你是托育建议助手。输出固定JSON，不输出额外文本，不给医疗诊断。",
          },
          {
            role: "user",
            content: buildPrompt(snapshot),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[AI] DashScope request failed: ${response.status} ${response.statusText}`, errorText.slice(0, 300));
      return null;
    }

    const raw = (await response.json()) as Record<string, unknown>;
    const content = String(
      (raw.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message &&
        typeof (raw.choices as Array<Record<string, unknown>>)[0].message === "object"
        ? ((raw.choices as Array<Record<string, unknown>>)[0].message as Record<string, unknown>).content
        : ""
    );

    const parsed = safeJsonParse(content);
    const normalized = normalizeAiOutput(parsed);
    if (!normalized) {
      console.error("[AI] DashScope returned content that could not be normalized:", content.slice(0, 300));
    }
    return normalized;
  } catch (error) {
    console.error("[AI] DashScope request threw an exception:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
