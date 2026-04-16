import type {
  AiFollowUpPayload,
  AiFollowUpResponse,
  AiSuggestionResponse,
  ChildSuggestionSnapshot,
  InstitutionSuggestionSnapshot,
  RuleFallbackItem,
  WeeklyReportRole,
  WeeklyReportResponse,
  WeeklyReportSnapshot,
} from "@/lib/ai/types";
import { describeAgeBandActionGuidance, describeAgeBandWeeklyGuidance } from "@/lib/age-band/policy";
import { buildActionizedWeeklyReportResponse, normalizeWeeklyReportRole } from "@/lib/ai/weekly-report";
import { getHydrationDisplayState } from "@/lib/hydration-display";

const DEFAULT_DISCLAIMER =
  "本建议仅用于托育观察与家园沟通参考，不构成医疗诊断；如出现持续发热或明显异常，请及时就医。";

function pickRiskLevel(items: RuleFallbackItem[]): "low" | "medium" | "high" {
  const warningCount = items.filter((i) => i.level === "warning").length;
  if (warningCount >= 2) return "high";
  if (warningCount >= 1) return "medium";
  return "low";
}

function uniqueTexts(items: Array<string | undefined>, limit = 4) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

export function buildFallbackSuggestion(snapshot: ChildSuggestionSnapshot): AiSuggestionResponse {
  const items = snapshot.ruleFallback;
  const top = items.slice(0, 3);
  const concerns = top.filter((i) => i.level === "warning").map((i) => i.title);
  const highlights = top.filter((i) => i.level !== "warning").map((i) => i.title);
  const summaryBase = top
    .map((item) => item.title)
    .filter(Boolean)
    .slice(0, 3)
    .join("；");
  const childName = snapshot.child.name;
  const ageBandGuidance = describeAgeBandActionGuidance(snapshot.child.ageBandContext);

  return {
    riskLevel: pickRiskLevel(items),
    summary:
      (ageBandGuidance
        ? `${childName} 当前处于${ageBandGuidance.label}阶段，更适合围绕${ageBandGuidance.careFocusText}做连续观察，家长动作建议${ageBandGuidance.parentActionTone}`
        : undefined) ||
      summaryBase ||
      "近 7 天暂无明显高风险异常，建议继续保持晨检、饮食、成长记录与家长反馈的连续性，便于系统持续输出更贴合孩子状态的建议。",
    highlights:
      uniqueTexts(
        ageBandGuidance
          ? [`${ageBandGuidance.label}阶段重点先看${ageBandGuidance.careFocusText}`, ...highlights]
          : highlights,
        3
      ).length > 0
        ? uniqueTexts(
            ageBandGuidance
              ? [`${ageBandGuidance.label}阶段重点先看${ageBandGuidance.careFocusText}`, ...highlights]
              : highlights,
            3
          )
        : ["今日数据已同步，可继续观察趋势变化。"],
    concerns:
      uniqueTexts(
        ageBandGuidance
          ? [ageBandGuidance.teacherObservationFocus[0], ageBandGuidance.cautionText, ...concerns]
          : concerns,
        3
      ).length > 0
        ? uniqueTexts(
            ageBandGuidance
              ? [ageBandGuidance.teacherObservationFocus[0], ageBandGuidance.cautionText, ...concerns]
              : concerns,
            3
          )
        : ["暂未发现明显高风险信号，建议维持日常观察。"],
    actions:
      uniqueTexts(
        ageBandGuidance
          ? [
              `今天先${ageBandGuidance.defaultInterventionFocus[0] ?? `围绕${ageBandGuidance.careFocusText}补一条观察`}`,
              `今晚先${ageBandGuidance.defaultInterventionFocus[1] ?? `围绕${ageBandGuidance.careFocusText}做一条小动作`}`,
              `48小时内回看${ageBandGuidance.defaultInterventionFocus[2] ?? ageBandGuidance.careFocusText}`,
              ...top.map((i) => i.description).filter(Boolean),
            ]
          : top.length > 0
            ? top.map((i) => i.description).filter(Boolean)
            : ["继续完成晨检、饮食与成长记录，确保每日数据完整。"],
        4
      ),
    actionPlan: {
      schoolActions:
        uniqueTexts(
          ageBandGuidance
            ? [
                `今天园内重点记录：${ageBandGuidance.teacherObservationFocus[0]}`,
                ageBandGuidance.teacherObservationFocus[1]
                  ? `今天园内继续看：${ageBandGuidance.teacherObservationFocus[1]}`
                  : undefined,
              ]
            : top.length > 0
              ? top.slice(0, 2).map((i) => `今天园内先做：${i.description}`)
              : ["今天园内保持晨检、饮食和成长观察记录连续，及时标注异常变化。"],
          2
        ),
      familyActions: uniqueTexts(
        ageBandGuidance
          ? [
              `今晚先${ageBandGuidance.defaultInterventionFocus[1] ?? `围绕${ageBandGuidance.careFocusText}做一条小动作`}`,
              `如果出现变化，请重点反馈：${ageBandGuidance.teacherObservationFocus[0]}`,
            ]
          : ["今晚家庭继续反馈作息、饮食和情绪表现，帮助系统判断建议是否有效。"],
        2
      ),
      reviewActions: uniqueTexts(
        ageBandGuidance
          ? [`48小时内回看${ageBandGuidance.defaultInterventionFocus[2] ?? ageBandGuidance.careFocusText}。${ageBandGuidance.cautionText}`]
          : ["48小时内结合新记录再次复盘，如异常持续或加重请及时联系专业人员。"],
        2
      ),
    },
    trendPrediction: pickRiskLevel(items) === "high" ? "up" : pickRiskLevel(items) === "medium" ? "stable" : "down",
    disclaimer: DEFAULT_DISCLAIMER,
    source: "fallback",
  };
}

export function buildFallbackInstitutionSuggestion(snapshot: InstitutionSuggestionSnapshot): AiSuggestionResponse {
  const topItems = snapshot.priorityTopItems.slice(0, 3);
  const primary = topItems[0];

  return {
    riskLevel:
      topItems.some((item) => item.priorityLevel === "P1")
        ? "high"
        : topItems.some((item) => item.priorityLevel === "P2")
          ? "medium"
          : "low",
    summary:
      primary
        ? `今天园所最应优先推动的是${primary.targetName}相关问题，原因是${primary.reason}。当前还需同步关注${snapshot.riskChildren.length}名重点儿童、${snapshot.riskClasses.length}个高风险班级和${snapshot.pendingDispatches.length}条待处理事项，先把最高优先级动作在今天完成。`
        : `今天园所整体运行较平稳，但仍建议围绕晨检、待复查和家长反馈闭环持续跟进。当前可优先看${snapshot.pendingDispatches.length}条待处理通知事件，保证机构级动作及时落地。`,
    highlights: [
      snapshot.sevenDayOverview.feedbackCompletionRate > 0
        ? `近7天家长反馈完成率 ${snapshot.sevenDayOverview.feedbackCompletionRate}%`
        : "",
      snapshot.riskChildren[0]
        ? `重点儿童：${snapshot.riskChildren[0].childName}（${snapshot.riskChildren[0].className}）`
        : "",
      snapshot.riskClasses[0]
        ? `高风险班级：${snapshot.riskClasses[0].className}`
        : "",
    ].filter(Boolean),
    concerns:
      topItems.length > 0
        ? topItems.map((item) => `${item.targetName}：${item.reason}`)
        : ["当前暂无进入TOP列表的机构级风险事项，建议继续保持日常巡检与闭环复盘。"],
    actions:
      topItems.length > 0
        ? topItems.map((item) => `${item.recommendedAction}，建议由${item.recommendedOwnerName ?? item.recommendedOwnerRole ?? "责任人"}在${item.recommendedDeadline}前完成。`)
        : ["优先核对今日晨检与待复查台账，再检查家长反馈是否按时回流。"],
    actionPlan: {
      schoolActions: topItems.slice(0, 2).map((item) => item.recommendedAction),
      familyActions: snapshot.feedbackRiskItems.slice(0, 2).map((item) => `提醒${item.childName}家长今晚补充反馈，说明孩子在家状态与执行情况。`),
      reviewActions: [
        "今日放学前复盘TOP3优先事项是否形成负责人、动作和时限。",
        "本周五前回看高风险班级的整改进度与反馈闭环情况。",
      ],
    },
    trendPrediction:
      snapshot.priorityTopItems.some((item) => item.priorityLevel === "P1")
        ? "up"
        : snapshot.pendingDispatches.length > 0
          ? "stable"
          : "down",
    disclaimer: DEFAULT_DISCLAIMER,
    source: "fallback",
  };
}

export function buildFallbackFollowUp(payload: AiFollowUpPayload): AiFollowUpResponse {
  if ("institutionName" in payload.snapshot) {
    return buildFallbackInstitutionFollowUp(payload, payload.snapshot);
  }

  const childName = payload.snapshot.child.name;
  const hydrationAvg = payload.snapshot.summary.meals.hydrationAvg;
  const pendingReviewCount = payload.snapshot.summary.growth.pendingReviewCount;
  const latestFeedback = payload.latestFeedback;
  const hydrationDisplay = getHydrationDisplayState(hydrationAvg);
  const ageBandGuidance = describeAgeBandActionGuidance(payload.snapshot.child.ageBandContext);

  return {
    answer:
      `关于“${payload.suggestionTitle}”，更稳妥的做法是先把它拆成可执行的小动作。` +
      `${childName} 当前${hydrationDisplay.tone === "warning" ? `${hydrationDisplay.statusLabel}，` : "补水记录较连续，"}` +
      `${pendingReviewCount > 0 ? `且仍有${pendingReviewCount}项待复查，` : "当前重点项相对集中，"}` +
      `${
        ageBandGuidance
          ? `这个阶段更适合${ageBandGuidance.parentActionTone}，所以建议优先围绕${ageBandGuidance.careFocusText}验证是否有效。`
          : "所以建议先从最容易当天落实的一项园内动作和一项家庭动作开始，再用48小时连续记录验证是否有效。"
      }`,
    keyPoints: uniqueTexts(
      [
        ageBandGuidance?.teacherObservationFocus[0],
        ageBandGuidance?.teacherObservationFocus[1],
        "先确认这条建议对应的是哪个具体场景，比如晨起、午睡前、进餐中或离园后。",
        "一次只调整一到两个变量，避免同时改太多导致无法判断是否有效。",
        "家长反馈尽量写清执行时间、孩子反应和是否比前一天改善。",
      ],
      4
    ),
    nextSteps: uniqueTexts(
      [
        ageBandGuidance?.defaultInterventionFocus[0]
          ? `今天园内先${ageBandGuidance.defaultInterventionFocus[0]}`
          : "今天园内先补充一次对应场景的观察记录，写明触发因素和处理结果。",
        ageBandGuidance?.defaultInterventionFocus[1]
          ? `今晚家庭先${ageBandGuidance.defaultInterventionFocus[1]}`
          : "今晚家庭按当前建议执行一次，并记录孩子的情绪、饮水或作息变化。",
        ageBandGuidance?.defaultInterventionFocus[2]
          ? `48小时内回看${ageBandGuidance.defaultInterventionFocus[2]}`
          : "48小时内回看连续记录，如果仍无改善，再升级为重点跟踪事项。",
      ],
      4
    ),
    tonightTopAction:
      payload.currentInterventionCard?.tonightHomeAction ??
      (ageBandGuidance
        ? `今晚先${ageBandGuidance.defaultInterventionFocus[1] ?? `围绕${ageBandGuidance.careFocusText}做一条小动作`}。`
        : "今晚先做一项最容易执行的家庭动作，并记录孩子当下反应。"),
    whyNow:
      latestFeedback?.improved === false
        ? ageBandGuidance
          ? `因为上一轮家庭动作效果还不稳定，${ageBandGuidance.label}阶段更适合${ageBandGuidance.parentActionTone}，需要今晚继续验证哪一步真正有效。`
          : "因为上一轮家庭动作效果还不稳定，需要今晚继续验证哪一步真正有效。"
        : ageBandGuidance
          ? `因为${ageBandGuidance.label}阶段更适合围绕${ageBandGuidance.careFocusText}做连续观察，今晚的执行情况会直接影响老师明天如何继续观察和调整建议。`
          : "因为今晚的执行情况会直接影响老师明天如何继续观察和调整建议。",
    homeSteps: [
      payload.currentInterventionCard?.tonightHomeAction ??
        (ageBandGuidance
          ? `先按“${ageBandGuidance.defaultInterventionFocus[1] ?? `围绕${ageBandGuidance.careFocusText}做一条小动作`}”完成一次家庭动作。`
          : "先按当前建议完成一项家庭动作。"),
      ageBandGuidance?.teacherObservationFocus[0]
        ? `执行时重点记录：${ageBandGuidance.teacherObservationFocus[0]}`
        : "执行时记录孩子的情绪、饮水或入睡反应。",
      "明早把结果反馈给老师，形成下一轮调整依据。",
    ],
    observationPoints:
      payload.currentInterventionCard?.observationPoints ??
      uniqueTexts(
        ageBandGuidance
          ? ageBandGuidance.teacherObservationFocus.slice(0, 3)
          : ["孩子情绪是否更稳定", "饮水或进食是否更配合", "入睡和晨起是否比前一天更顺"],
        3
      ),
    teacherObservation:
      payload.currentInterventionCard?.tomorrowObservationPoint ??
      (ageBandGuidance?.teacherObservationFocus[0]
        ? `明天继续观察${ageBandGuidance.teacherObservationFocus[0]}，并核对今晚家庭动作后的变化。`
        : `${childName} 明日入园后的情绪、晨检状态和家庭反馈是否一致。`),
    reviewIn48h:
      payload.currentInterventionCard?.reviewIn48h ??
      (ageBandGuidance
        ? `48 小时内回看${ageBandGuidance.defaultInterventionFocus[2] ?? ageBandGuidance.careFocusText}。${ageBandGuidance.cautionText}`.trim()
        : "48 小时内结合今晚反馈和明早入园状态复查一次。"),
    recommendedQuestions: [
      "我做完之后应该怎么反馈？",
      "明天老师会继续看什么？",
      "如果今晚没有改善，下一步怎么调？",
    ],
    disclaimer: DEFAULT_DISCLAIMER,
    source: "fallback",
  };
}

export function buildFallbackInstitutionFollowUp(
  payload: AiFollowUpPayload,
  snapshot: InstitutionSuggestionSnapshot
): AiFollowUpResponse {
  const topItems = snapshot.priorityTopItems.slice(0, 3);
  const focusText = payload.question.trim();
  const focusedItems =
    focusText.includes("儿童")
      ? snapshot.priorityTopItems.filter((item) => item.targetType === "child").slice(0, 3)
      : focusText.includes("班级")
        ? snapshot.priorityTopItems.filter((item) => item.targetType === "class").slice(0, 3)
        : focusText.includes("家长")
          ? snapshot.priorityTopItems.filter((item) => item.targetType === "family").slice(0, 3)
          : topItems;
  const primary = focusedItems[0] ?? topItems[0];

  return {
    answer:
      primary
        ? `围绕“${focusText}”，当前最值得园长先推动的是${primary.targetName}。它排在前面的原因是${primary.reason}，建议先锁定责任人、截止时间和复盘节点，再决定是否扩展到更多班级或家庭。`
        : `围绕“${focusText}”，当前更适合先把机构级闭环做扎实：先看待处理派单，再看家长反馈和待复查积压，避免同时推动过多事项导致执行分散。`,
    keyPoints:
      focusedItems.length > 0
        ? focusedItems.map((item) => `${item.targetName}｜${item.priorityLevel}｜${item.recommendedAction}`)
        : [
            `待处理通知事件 ${snapshot.pendingDispatches.length} 条`,
            `重点儿童 ${snapshot.riskChildren.length} 名`,
            `高风险班级 ${snapshot.riskClasses.length} 个`,
          ],
    nextSteps: [
      primary
        ? `先由${primary.recommendedOwnerName ?? primary.recommendedOwnerRole ?? "责任人"}在${primary.recommendedDeadline}前处理${primary.targetName}。`
        : "先确认今天最高优先级事项的责任人与完成时点。",
      snapshot.feedbackRiskItems[0]
        ? `今晚补齐${snapshot.feedbackRiskItems[0].childName}相关家庭的反馈回传，避免闭环继续变弱。`
        : "今晚检查家长反馈回流情况，保证重点儿童链路不断点。",
      "放学前复盘TOP3事项是否已经形成派单、跟进和状态更新。",
    ],
    disclaimer: DEFAULT_DISCLAIMER,
    source: "fallback",
  };
}

export function buildFallbackWeeklyReport(
  snapshot: WeeklyReportSnapshot,
  role?: WeeklyReportRole
): WeeklyReportResponse {
  const resolvedRole = role ?? normalizeWeeklyReportRole(snapshot.role) ?? "admin";
  const ageBandGuidance = resolvedRole === "parent" ? describeAgeBandWeeklyGuidance(snapshot.ageBandContext) : null;
  if (ageBandGuidance) {
    const trendPrediction =
      snapshot.overview.healthAbnormalCount > 0 || snapshot.overview.pendingReviewCount > 2
        ? "up"
        : snapshot.diet.balancedRate >= 70 && snapshot.diet.hydrationAvg >= 150
          ? "down"
          : "stable";

    return buildActionizedWeeklyReportResponse({
      role: resolvedRole,
      snapshot,
      summary: `${snapshot.periodLabel}内更建议围绕${ageBandGuidance.focusText}做一周复盘，家长动作以${ageBandGuidance.parentActionTone}为主。`,
      highlights: [
        `${ageBandGuidance.label}阶段本周更看${ageBandGuidance.focusText}这些连续变化。`,
        ...(snapshot.highlights.length > 0
          ? snapshot.highlights.slice(0, 2)
          : [`家长配合建议保持${ageBandGuidance.parentActionTone}`]),
      ].slice(0, 3),
      risks: [
        ageBandGuidance.cautionText,
        ...(snapshot.risks.length > 0
          ? snapshot.risks.slice(0, 2)
          : ["如缺少家庭回传，老师很难判断这些变化是否稳定。"]),
      ].slice(0, 3),
      nextWeekActions: [
        `下周先围绕${ageBandGuidance.actionText}做一个稳定、容易复现的小动作。`,
        `如果你观察到${ageBandGuidance.focusText}有变化，请尽量在当天回传给老师。`,
        ageBandGuidance.cautionText,
      ],
      trendPrediction,
      disclaimer: DEFAULT_DISCLAIMER,
      source: "fallback",
    });
  }
  const trendPrediction =
    snapshot.overview.healthAbnormalCount > 0 || snapshot.overview.pendingReviewCount > 2
      ? "up"
      : snapshot.diet.balancedRate >= 70 && snapshot.diet.hydrationAvg >= 150
      ? "down"
      : "stable";

  return buildActionizedWeeklyReportResponse({
    role: resolvedRole,
    snapshot,
    summary:
      `${snapshot.periodLabel}内共覆盖${snapshot.overview.visibleChildren}名幼儿，出勤率约${snapshot.overview.attendanceRate}%，` +
      `${snapshot.diet.balancedRate >= 70 ? "膳食结构总体较稳，" : "膳食均衡度仍需提升，"}` +
      `${snapshot.overview.pendingReviewCount > 0 ? `当前仍有${snapshot.overview.pendingReviewCount}项待复查，` : "重点事项已基本闭环，"}` +
      "建议下周继续围绕饮水、蔬果摄入和重点幼儿跟踪做精细化管理。",
    highlights:
      snapshot.highlights.length > 0
        ? snapshot.highlights.slice(0, 3)
        : ["本周核心业务数据已形成连续记录，可支持持续复盘。"],
    risks:
      snapshot.risks.length > 0
        ? snapshot.risks.slice(0, 3)
        : ["当前暂无显著集中性高风险，但仍需保持复查节奏。"],
    nextWeekActions: [
      "下周优先跟进待复查幼儿，明确到人、到时间节点。",
      "对饮水偏低和蔬果不足儿童继续做分层提醒与记录复盘。",
      "家园双方保持每日反馈，确保AI建议能基于连续数据更新。",
    ],
    trendPrediction,
    disclaimer: DEFAULT_DISCLAIMER,
    source: "fallback",
  });
}
