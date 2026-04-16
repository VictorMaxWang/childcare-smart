import type {
  AdminAgentRunPayload,
  IntentRouterConfidence,
  IntentRouterDetectedRole,
  IntentRouterIntent,
  IntentRouterRequest,
  IntentRouterResult,
  ParentAgentRunPayload,
  ParentStorybookRunPayload,
  ParentTrendQueryRunPayload,
  SupportedIntent,
  TeacherAgentRunPayload,
  TeacherConsultationRunPayload,
  TeacherReactRunPayload,
} from "@/lib/ai/types";

const WEEKLY_REPORT_KEYWORDS = [
  "weekly report",
  "weekly summary",
  "ops report",
  "周报",
  "本周总结",
  "本周观察",
  "运营周报",
  "本周运营",
];
const STORYBOOK_KEYWORDS = ["storybook", "story book", "绘本", "故事", "睡前故事", "微绘本"];
const CONSULTATION_KEYWORDS = [
  "consultation",
  "high risk",
  "high-risk",
  "会诊",
  "高风险",
  "升级关注",
  "升级处理",
];
const PRIORITY_KEYWORDS = [
  "priority",
  "top 3",
  "top3",
  "p1",
  "最该先处理",
  "最该先处理什么",
  "最需要优先处理",
  "优先处理的孩子",
  "优先",
  "优先级",
  "最该处理",
  "机构重点",
  "园所重点",
];
const TREND_KEYWORDS = [
  "trend",
  "变化",
  "趋势",
  "最近",
  "这周",
  "本周",
  "上周",
  "一个月",
  "睡眠",
  "饮食",
  "情绪",
  "健康",
  "成长",
];
const PARENT_DRAFT_KEYWORDS = [
  "parent draft",
  "message to parent",
  "notify parent",
  "家长沟通",
  "家长消息",
  "家长草稿",
  "给家长",
];
const TONIGHT_ACTION_KEYWORDS = [
  "tonight",
  "home action",
  "今晚",
  "今晚上",
  "家庭行动",
  "今晚做什么",
  "今晚任务",
];
const OBSERVATION_KEYWORDS = [
  "observation",
  "record observation",
  "note",
  "记录观察",
  "观察记录",
  "记一下",
  "记录一下",
  "记个观察",
];
const ADMIN_ROLE_KEYWORDS = [
  "admin",
  "director",
  "institution",
  "ops",
  "园长",
  "管理端",
  "机构",
  "园所",
  "运营",
];
const PARENT_ROLE_KEYWORDS = [
  "parent",
  "family",
  "guardian",
  "家长",
  "家庭",
  "在家",
  "睡前",
];
const TEACHER_ROLE_KEYWORDS = [
  "teacher",
  "classroom",
  "observation",
  "follow up",
  "follow-up",
  "老师",
  "班级",
  "园内",
  "观察",
];

function normalizeMessage(value: string) {
  return value.trim().toLowerCase();
}

function containsAny(message: string, keywords: readonly string[]) {
  return keywords.filter((keyword) => message.includes(keyword));
}

function hasSourcePrefix(sourcePage: string | undefined, prefix: string) {
  return typeof sourcePage === "string" && sourcePage.startsWith(prefix);
}

function appendQuery(path: string, items: Array<[string, string | undefined]>) {
  const params = new URLSearchParams();
  items.forEach(([key, value]) => {
    if (value && value.trim()) {
      params.set(key, value);
    }
  });
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function isIntentRouterRequest(payload: unknown): payload is IntentRouterRequest {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.message !== "string" || candidate.message.trim().length === 0) return false;
  if (
    candidate.roleHint !== undefined &&
    candidate.roleHint !== "teacher" &&
    candidate.roleHint !== "parent" &&
    candidate.roleHint !== "admin"
  ) {
    return false;
  }
  return true;
}

export function isIntentRouterResult(payload: unknown): payload is IntentRouterResult {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.detectedRole === "string" &&
    typeof candidate.intent === "string" &&
    typeof candidate.targetWorkflow === "string" &&
    typeof candidate.targetPage === "string" &&
    typeof candidate.deeplink === "string" &&
    candidate.previewCard !== null &&
    typeof candidate.previewCard === "object" &&
    typeof (candidate.previewCard as Record<string, unknown>).title === "string" &&
    typeof (candidate.previewCard as Record<string, unknown>).summary === "string" &&
    typeof (candidate.previewCard as Record<string, unknown>).ctaLabel === "string" &&
    Array.isArray((candidate.previewCard as Record<string, unknown>).badges) &&
    typeof candidate.ruleId === "string" &&
    typeof candidate.confidence === "string" &&
    Array.isArray(candidate.matchedSignals)
  );
}

type Detection = {
  role: IntentRouterDetectedRole;
  confidence: IntentRouterConfidence;
  matchedSignals: string[];
};

function detectRole(payload: IntentRouterRequest, intentSignals: string[]): Detection {
  if (payload.roleHint) {
    return {
      role: payload.roleHint,
      confidence: "high",
      matchedSignals: [`roleHint:${payload.roleHint}`, ...intentSignals],
    };
  }

  const sourceSignals: string[] = [];
  if (hasSourcePrefix(payload.sourcePage, "/teacher")) sourceSignals.push("sourcePage:/teacher");
  if (hasSourcePrefix(payload.sourcePage, "/parent")) sourceSignals.push("sourcePage:/parent");
  if (hasSourcePrefix(payload.sourcePage, "/admin")) sourceSignals.push("sourcePage:/admin");
  if (sourceSignals.length > 0) {
    const pageRole = sourceSignals[0]?.endsWith("/teacher")
      ? "teacher"
      : sourceSignals[0]?.endsWith("/parent")
        ? "parent"
        : "admin";
    return {
      role: pageRole,
      confidence: "medium",
      matchedSignals: [...sourceSignals, ...intentSignals],
    };
  }

  const normalized = normalizeMessage(payload.message);
  const adminSignals = containsAny(normalized, ADMIN_ROLE_KEYWORDS);
  const parentSignals = containsAny(normalized, PARENT_ROLE_KEYWORDS);
  const teacherSignals = containsAny(normalized, TEACHER_ROLE_KEYWORDS);

  if (adminSignals.length > 0) {
    return {
      role: "admin",
      confidence: "medium",
      matchedSignals: [...adminSignals.map((item) => `role:${item}`), ...intentSignals],
    };
  }
  if (parentSignals.length > 0) {
    return {
      role: "parent",
      confidence: "medium",
      matchedSignals: [...parentSignals.map((item) => `role:${item}`), ...intentSignals],
    };
  }
  if (teacherSignals.length > 0) {
    return {
      role: "teacher",
      confidence: "medium",
      matchedSignals: [...teacherSignals.map((item) => `role:${item}`), ...intentSignals],
    };
  }

  return {
    role: "unknown",
    confidence: "low",
    matchedSignals: intentSignals,
  };
}

function detectIntent(payload: IntentRouterRequest): {
  intent: IntentRouterIntent;
  matchedSignals: string[];
} {
  const normalized = normalizeMessage(payload.message);

  const checks: Array<[SupportedIntent, readonly string[]]> = [
    ["ask_storybook", STORYBOOK_KEYWORDS],
    ["start_consultation", CONSULTATION_KEYWORDS],
    ["view_priority", PRIORITY_KEYWORDS],
    ["ask_weekly_report", WEEKLY_REPORT_KEYWORDS],
    ["query_trend", TREND_KEYWORDS],
    ["generate_parent_draft", PARENT_DRAFT_KEYWORDS],
    ["view_tonight_action", TONIGHT_ACTION_KEYWORDS],
    ["record_observation", OBSERVATION_KEYWORDS],
  ];

  for (const [intent, keywords] of checks) {
    const hits = containsAny(normalized, keywords);
    if (hits.length > 0) {
      return {
        intent,
        matchedSignals: hits.map((item) => `intent:${item}`),
      };
    }
  }

  return {
    intent: "unknown",
    matchedSignals: [],
  };
}

type RouteShape = Pick<
  IntentRouterResult,
  "targetWorkflow" | "targetPage" | "deeplink" | "previewCard" | "optionalPayload" | "ruleId"
>;

function buildUnknownResult(detectedRole: IntentRouterDetectedRole, matchedSignals: string[]): IntentRouterResult {
  return {
    detectedRole,
    intent: "unknown",
    targetWorkflow: "",
    targetPage: "/",
    deeplink: "/",
    previewCard: {
      title: "需要人工确认意图",
      summary: "当前路由规则无法稳定判断应进入哪个工作流，先回到通用入口确认角色与目标。",
      ctaLabel: "回到入口",
      badges: detectedRole === "unknown" ? ["unknown-role", "unknown-intent"] : [detectedRole, "unknown-intent"],
    },
    optionalPayload: null,
    ruleId: "intent-router:unknown:v1",
    confidence: "low",
    matchedSignals,
  };
}

function buildTeacherObservationRoute(payload: IntentRouterRequest): RouteShape {
  const optionalPayload: TeacherReactRunPayload = {
    kind: "teacher-react-run",
    task: payload.message,
    message: payload.message,
    ...(payload.childId ? { childId: payload.childId } : {}),
  };
  return {
    targetWorkflow: "teacher.react.run",
    targetPage: "/teacher/agent",
    deeplink: appendQuery("/teacher/agent", [
      ["childId", payload.childId],
      ["intent", "record_observation"],
    ]),
    previewCard: {
      title: "记录老师观察并进入后续动作",
      summary: "将自然语言观察路由到 teacher ReAct 链路，用于生成结构化记录和后续动作建议。",
      ctaLabel: "打开教师助手",
      badges: ["teacher", "record_observation"],
    },
    optionalPayload,
    ruleId: "intent-router:teacher:record_observation:v1",
  };
}

function buildTeacherParentDraftRoute(payload: IntentRouterRequest): RouteShape {
  const optionalPayload: TeacherAgentRunPayload = {
    kind: "teacher-agent-run",
    workflow: "communication",
    message: payload.message,
    ...(payload.childId ? { childId: payload.childId } : {}),
  };
  return {
    targetWorkflow: "teacher.agent.communication",
    targetPage: "/teacher/agent",
    deeplink: appendQuery("/teacher/agent", [
      ["action", "communication"],
      ["childId", payload.childId],
    ]),
    previewCard: {
      title: "生成家长沟通草稿",
      summary: "将当前诉求路由到教师家长沟通工作流，复用已有 communication 输出。",
      ctaLabel: "生成沟通建议",
      badges: ["teacher", "generate_parent_draft"],
    },
    optionalPayload,
    ruleId: "intent-router:teacher:generate_parent_draft:v1",
  };
}

function buildTeacherConsultationRoute(payload: IntentRouterRequest): RouteShape {
  const optionalPayload: TeacherConsultationRunPayload = {
    kind: "teacher-consultation-run",
    message: payload.message,
    ...(payload.childId ? { childId: payload.childId } : {}),
  };
  return {
    targetWorkflow: "teacher.consultation.high-risk",
    targetPage: "/teacher/high-risk-consultation",
    deeplink: appendQuery("/teacher/high-risk-consultation", [
      ["intent", "start_consultation"],
      ["childId", payload.childId],
    ]),
    previewCard: {
      title: "升级到高风险会诊",
      summary: "将当前诉求路由到教师高风险会诊入口，保留 childId 和原始 message 供后续执行。",
      ctaLabel: "打开高风险会诊",
      badges: ["teacher", "start_consultation"],
    },
    optionalPayload,
    ruleId: "intent-router:teacher:start_consultation:v1",
  };
}

function buildTeacherPriorityRoute(payload: IntentRouterRequest): RouteShape {
  const optionalPayload: TeacherAgentRunPayload = {
    kind: "teacher-agent-run",
    workflow: "follow-up",
    message: payload.message,
    ...(payload.childId ? { childId: payload.childId } : {}),
  };
  return {
    targetWorkflow: "teacher.agent.follow-up",
    targetPage: "/teacher/agent",
    deeplink: appendQuery("/teacher/agent", [
      ["action", "follow-up"],
      ["childId", payload.childId],
    ]),
    previewCard: {
      title: "查看今日优先处理孩子",
      summary: "将当前诉求路由到教师今日跟进工作流，优先打开最需要先处理的孩子与后续动作。",
      ctaLabel: "打开今日跟进",
      badges: ["teacher", "view_priority"],
    },
    optionalPayload,
    ruleId: "intent-router:teacher:view_priority:v1",
  };
}

function buildTeacherWeeklyRoute(payload: IntentRouterRequest): RouteShape {
  const optionalPayload: TeacherAgentRunPayload = {
    kind: "teacher-agent-run",
    workflow: "weekly-summary",
    message: payload.message,
    ...(payload.childId ? { childId: payload.childId } : {}),
  };
  return {
    targetWorkflow: "teacher.agent.weekly-summary",
    targetPage: "/teacher/agent",
    deeplink: appendQuery("/teacher/agent", [["action", "weekly-summary"]]),
    previewCard: {
      title: "生成教师周观察总结",
      summary: "将请求路由到教师 weekly-summary 工作流，不依赖首页入口即可测试。",
      ctaLabel: "打开教师周总结",
      badges: ["teacher", "ask_weekly_report"],
    },
    optionalPayload,
    ruleId: "intent-router:teacher:ask_weekly_report:v1",
  };
}

function buildParentTrendRoute(payload: IntentRouterRequest): RouteShape {
  const optionalPayload: ParentTrendQueryRunPayload = {
    kind: "parent-trend-query",
    question: payload.message,
    message: payload.message,
    ...(payload.childId ? { childId: payload.childId } : {}),
  };
  return {
    targetWorkflow: "parent.trend.query",
    targetPage: "/parent/agent",
    deeplink: appendQuery("/parent/agent", [
      ["child", payload.childId],
      ["intent", "query_trend"],
    ]),
    previewCard: {
      title: "查看家长趋势问答",
      summary: "将问题路由到 parent trend query，后续可直接调用现有趋势查询接口。",
      ctaLabel: "打开趋势问答",
      badges: ["parent", "query_trend"],
    },
    optionalPayload,
    ruleId: "intent-router:parent:query_trend:v1",
  };
}

function buildParentTonightRoute(payload: IntentRouterRequest): RouteShape {
  const baseDeeplink = appendQuery("/parent/agent", [["child", payload.childId]]);
  const optionalPayload: ParentAgentRunPayload = {
    kind: "parent-agent-run",
    workflow: "suggestions",
    message: payload.message,
    anchor: "intervention",
    ...(payload.childId ? { childId: payload.childId } : {}),
  };
  return {
    targetWorkflow: "parent.agent.suggestions",
    targetPage: "/parent/agent",
    deeplink: `${baseDeeplink}#intervention`,
    previewCard: {
      title: "查看今晚家庭行动",
      summary: "将诉求路由到家长建议入口，并直接定位到 intervention 区域。",
      ctaLabel: "打开今晚行动",
      badges: ["parent", "view_tonight_action"],
    },
    optionalPayload,
    ruleId: "intent-router:parent:view_tonight_action:v1",
  };
}

function buildParentStorybookRoute(payload: IntentRouterRequest): RouteShape {
  const optionalPayload: ParentStorybookRunPayload = {
    kind: "parent-storybook-run",
    message: payload.message,
    ...(payload.childId ? { childId: payload.childId } : {}),
  };
  return {
    targetWorkflow: "parent.storybook",
    targetPage: "/parent/storybook",
    deeplink: appendQuery("/parent/storybook", [["child", payload.childId]]),
    previewCard: {
      title: "打开家长微绘本",
      summary: "将请求路由到 parent storybook，复用现有绘本生成页和后端接口。",
      ctaLabel: "打开微绘本",
      badges: ["parent", "ask_storybook"],
    },
    optionalPayload,
    ruleId: "intent-router:parent:ask_storybook:v1",
  };
}

function buildAdminPriorityRoute(payload: IntentRouterRequest): RouteShape {
  const optionalPayload: AdminAgentRunPayload = {
    kind: "admin-agent-run",
    workflow: "daily-priority",
    message: payload.message,
    ...(payload.institutionId ? { institutionId: payload.institutionId } : {}),
  };
  return {
    targetWorkflow: "admin.agent.daily-priority",
    targetPage: "/admin/agent",
    deeplink: "/admin/agent",
    previewCard: {
      title: "查看机构优先级",
      summary: "将请求路由到 admin daily-priority 工作流，便于直接定位机构级重点事项。",
      ctaLabel: "打开机构优先级",
      badges: ["admin", "view_priority"],
    },
    optionalPayload,
    ruleId: "intent-router:admin:view_priority:v1",
  };
}

function buildAdminWeeklyRoute(payload: IntentRouterRequest): RouteShape {
  const optionalPayload: AdminAgentRunPayload = {
    kind: "admin-agent-run",
    workflow: "weekly-ops-report",
    message: payload.message,
    ...(payload.institutionId ? { institutionId: payload.institutionId } : {}),
  };
  return {
    targetWorkflow: "admin.agent.weekly-ops-report",
    targetPage: "/admin/agent",
    deeplink: "/admin/agent?action=weekly-report",
    previewCard: {
      title: "生成机构周报",
      summary: "将请求路由到 admin weekly-ops-report 工作流，复用现有周报模式入口。",
      ctaLabel: "打开机构周报",
      badges: ["admin", "ask_weekly_report"],
    },
    optionalPayload,
    ruleId: "intent-router:admin:ask_weekly_report:v1",
  };
}

function buildRoute(
  payload: IntentRouterRequest,
  detectedRole: IntentRouterDetectedRole,
  intent: IntentRouterIntent,
  matchedSignals: string[]
): IntentRouterResult {
  if (intent === "unknown") {
    return buildUnknownResult(detectedRole, matchedSignals);
  }

  if (detectedRole === "teacher") {
    if (intent === "record_observation") {
      return { detectedRole, intent, confidence: "medium", matchedSignals, ...buildTeacherObservationRoute(payload) };
    }
    if (intent === "generate_parent_draft") {
      return { detectedRole, intent, confidence: "medium", matchedSignals, ...buildTeacherParentDraftRoute(payload) };
    }
    if (intent === "start_consultation") {
      return { detectedRole, intent, confidence: "medium", matchedSignals, ...buildTeacherConsultationRoute(payload) };
    }
    if (intent === "view_priority") {
      return { detectedRole, intent, confidence: "medium", matchedSignals, ...buildTeacherPriorityRoute(payload) };
    }
    if (intent === "ask_weekly_report") {
      return { detectedRole, intent, confidence: "medium", matchedSignals, ...buildTeacherWeeklyRoute(payload) };
    }
  }

  if (detectedRole === "parent") {
    if (intent === "query_trend") {
      return { detectedRole, intent, confidence: "medium", matchedSignals, ...buildParentTrendRoute(payload) };
    }
    if (intent === "view_tonight_action") {
      return { detectedRole, intent, confidence: "medium", matchedSignals, ...buildParentTonightRoute(payload) };
    }
    if (intent === "ask_storybook") {
      return { detectedRole, intent, confidence: "medium", matchedSignals, ...buildParentStorybookRoute(payload) };
    }
  }

  if (detectedRole === "admin") {
    if (intent === "view_priority") {
      return { detectedRole, intent, confidence: "medium", matchedSignals, ...buildAdminPriorityRoute(payload) };
    }
    if (intent === "ask_weekly_report") {
      return { detectedRole, intent, confidence: "medium", matchedSignals, ...buildAdminWeeklyRoute(payload) };
    }
  }

  return buildUnknownResult(detectedRole, matchedSignals);
}

function inferRoleFromIntent(intent: IntentRouterIntent): IntentRouterDetectedRole {
  if (intent === "record_observation" || intent === "generate_parent_draft" || intent === "start_consultation") {
    return "teacher";
  }
  if (intent === "query_trend" || intent === "view_tonight_action" || intent === "ask_storybook") {
    return "parent";
  }
  if (intent === "view_priority") {
    return "admin";
  }
  return "unknown";
}

export function routeIntentRequest(payload: IntentRouterRequest): IntentRouterResult {
  const intentDetection = detectIntent(payload);
  const roleDetection = detectRole(payload, intentDetection.matchedSignals);
  const inferredRole = roleDetection.role === "unknown" ? inferRoleFromIntent(intentDetection.intent) : roleDetection.role;
  const baseResult = buildRoute(payload, inferredRole, intentDetection.intent, roleDetection.matchedSignals);

  return {
    ...baseResult,
    confidence:
      payload.roleHint || baseResult.intent === "unknown"
        ? roleDetection.confidence
        : baseResult.confidence === "medium" && inferredRole !== "unknown"
          ? roleDetection.confidence === "low"
            ? "medium"
            : roleDetection.confidence
          : baseResult.confidence,
    matchedSignals: roleDetection.matchedSignals,
  };
}
