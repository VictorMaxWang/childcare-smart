import { NextResponse } from "next/server";

type SuggestionInput = {
  childName?: string;
  ageBand?: string;
  weeklyTrend?: {
    balancedRate?: number;
    vegetableDays?: number;
    hydrationAvg?: number;
    monotonyDays?: number;
  };
  health?: {
    isAbnormal?: boolean;
    temperature?: number;
    mood?: string;
  };
};

export async function POST(request: Request) {
  const payload = (await request.json()) as SuggestionInput;

  const fallback = {
    id: `ai-fallback-${Date.now()}`,
    level: "info",
    title: `${payload.childName ?? "幼儿"} 的托育建议`,
    description:
      "建议保持规律作息，保证每日足量饮水与蔬果摄入，并持续记录晨检与成长观察数据以便连续评估。",
    source: "fallback-rule",
  };

  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL ?? "gpt-4o-mini";
  const baseUrl = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";

  if (!apiKey) {
    return NextResponse.json({ suggestions: [fallback], using: "fallback" });
  }

  try {
    const prompt = `你是托育机构AI助理。请基于以下数据生成1-3条中文、可执行、简洁的托育建议，返回纯JSON数组，每项包含title,description,level(info|warning|success)。数据：${JSON.stringify(
      payload
    )}`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "你是专业托育建议助手，只返回JSON。" },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ suggestions: [fallback], using: "fallback" });
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";

    let parsed: Array<{ title: string; description: string; level: "info" | "warning" | "success" }> = [];
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = [];
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return NextResponse.json({ suggestions: [fallback], using: "fallback" });
    }

    const suggestions = parsed.slice(0, 3).map((item, idx) => ({
      id: `ai-${Date.now()}-${idx}`,
      title: item.title,
      description: item.description,
      level: item.level,
      source: "model",
    }));

    return NextResponse.json({ suggestions, using: "model" });
  } catch {
    return NextResponse.json({ suggestions: [fallback], using: "fallback" });
  }
}
