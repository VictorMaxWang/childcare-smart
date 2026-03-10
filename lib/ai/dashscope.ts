import type { AiSuggestionResponse, ChildSuggestionSnapshot } from "@/lib/ai/types";

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

function normalizeAiOutput(raw: unknown): Omit<AiSuggestionResponse, "source"> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const riskLevel = normalizeRiskLevel(obj.riskLevel);
  const highlights = normalizeArray(obj.highlights);
  const concerns = normalizeArray(obj.concerns);
  const actions = normalizeArray(obj.actions);
  const disclaimer = String(obj.disclaimer ?? "").trim();

  if (highlights.length === 0 && concerns.length === 0 && actions.length === 0) {
    return null;
  }

  return {
    riskLevel,
    highlights: highlights.length > 0 ? highlights : ["建议继续观察关键指标变化。"],
    concerns: concerns.length > 0 ? concerns : ["暂无显著高风险信号。"],
    actions: actions.length > 0 ? actions : ["保持晨检、膳食、成长记录的连续性。"],
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
  };

  return [
    "你是托育机构的风险归纳与建议助手。",
    "你只能做托育建议和风险归纳，不做医疗诊断，不修改业务数据，不触发任何通知。",
    "请根据输入的7天聚合summary输出严格JSON，不要输出任何额外文本。",
    "JSON字段必须为: riskLevel, highlights, concerns, actions, disclaimer。",
    "riskLevel只能是low|medium|high。",
    "highlights、concerns、actions必须是字符串数组。",
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
