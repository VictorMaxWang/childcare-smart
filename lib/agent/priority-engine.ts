import { getLocalToday, isDateWithinLastDays, normalizeLocalDate } from "@/lib/date";
import type {
  AdminAgentAttendanceSnapshot,
  AdminAgentChildSnapshot,
  AdminAgentGrowthSnapshot,
  AdminAgentGuardianFeedbackSnapshot,
  AdminAgentMealSnapshot,
  AdminAgentWorkflowType,
  AdminDispatchEvent,
  AdminOwnerRole,
  InstitutionPriorityEvidence,
  InstitutionPriorityItem,
  InstitutionPriorityLevel,
  InstitutionPriorityRecommendedOwner,
  InstitutionPriorityTargetType,
} from "@/lib/agent/admin-types";
import type { AdminAgentHealthCheckSnapshot } from "@/lib/agent/admin-types";

export interface PriorityEngineInput {
  institutionName: string;
  workflow: AdminAgentWorkflowType;
  visibleChildren: AdminAgentChildSnapshot[];
  attendanceRecords: AdminAgentAttendanceSnapshot[];
  healthCheckRecords: AdminAgentHealthCheckSnapshot[];
  growthRecords: AdminAgentGrowthSnapshot[];
  guardianFeedbacks: AdminAgentGuardianFeedbackSnapshot[];
  mealRecords: AdminAgentMealSnapshot[];
  notificationEvents?: AdminDispatchEvent[];
  today?: string;
}

export interface PriorityEngineResult {
  priorityItems: InstitutionPriorityItem[];
  childItems: InstitutionPriorityItem[];
  classItems: InstitutionPriorityItem[];
  familyItems: InstitutionPriorityItem[];
  issueItems: InstitutionPriorityItem[];
}

type ChildDietStats = {
  hydrationAvg: number;
  vegetableDays: number;
};

type ChildPrioritySeed = {
  child: AdminAgentChildSnapshot;
  score: number;
  reasons: string[];
  evidence: InstitutionPriorityEvidence[];
  healthAbnormalCount: number;
  pendingReviewCount: number;
  missingFeedbackDays: number;
  hydrationAvg: number;
  vegetableDays: number;
};

function buildPriorityLevel(score: number): InstitutionPriorityLevel | null {
  if (score >= 80) return "P1";
  if (score >= 55) return "P2";
  if (score >= 30) return "P3";
  return null;
}

function comparePriority(left: InstitutionPriorityItem, right: InstitutionPriorityItem) {
  if (right.priorityScore !== left.priorityScore) {
    return right.priorityScore - left.priorityScore;
  }

  return left.targetName.localeCompare(right.targetName, "zh-CN");
}

function clampScore(score: number) {
  return Math.min(100, Math.max(0, Math.round(score)));
}

function buildOwner(
  role: AdminOwnerRole,
  fallbackLabel: string,
  child?: AdminAgentChildSnapshot,
  className?: string
): InstitutionPriorityRecommendedOwner {
  if (role === "teacher") {
    return {
      role,
      label: className ? `${className}班主任` : fallbackLabel,
      className,
      childName: child?.name,
    };
  }

  if (role === "parent") {
    return {
      role,
      label: child ? `${child.name}家长` : fallbackLabel,
      className,
      childName: child?.name,
    };
  }

  return {
    role,
    label: fallbackLabel,
    className,
    childName: child?.name,
  };
}

function buildDispatchPayload(params: {
  input: PriorityEngineInput;
  id: string;
  targetType: InstitutionPriorityTargetType;
  targetId: string;
  targetName: string;
  priorityScore: number;
  priorityLevel: InstitutionPriorityLevel;
  owner: InstitutionPriorityRecommendedOwner;
  reason: string;
  action: string;
  deadline: string;
  evidence: InstitutionPriorityEvidence[];
  relatedChildIds: string[];
  relatedClassNames: string[];
}) {
  return {
    eventType: "admin_action",
    priorityItemId: params.id,
    title: `${params.priorityLevel}｜${params.targetName}`,
    summary: params.reason,
    targetType: params.targetType,
    targetId: params.targetId,
    targetName: params.targetName,
    priorityLevel: params.priorityLevel,
    priorityScore: params.priorityScore,
    recommendedOwnerRole: params.owner.role,
    recommendedOwnerName: params.owner.label,
    recommendedAction: params.action,
    recommendedDeadline: params.deadline,
    reasonText: params.reason,
    evidence: params.evidence,
    source: {
      institutionName: params.input.institutionName,
      workflow: params.input.workflow,
      relatedChildIds: params.relatedChildIds,
      relatedClassNames: params.relatedClassNames,
    },
  };
}

function hasVegetableMeal(record: AdminAgentMealSnapshot) {
  return record.foods.some((food) => /(蔬|果)/u.test(food.category) || /(蔬|果)/u.test(food.name));
}

function buildChildDietStatsMap(
  mealRecords: AdminAgentMealSnapshot[],
  childIds: Set<string>,
  today: string
) {
  const stats = new Map<string, ChildDietStats>();
  const recordsByChild = new Map<string, AdminAgentMealSnapshot[]>();

  mealRecords.forEach((record) => {
    if (!childIds.has(record.childId) || !isDateWithinLastDays(record.date, 7, today)) return;
    const records = recordsByChild.get(record.childId) ?? [];
    records.push(record);
    recordsByChild.set(record.childId, records);
  });

  recordsByChild.forEach((records, childId) => {
    const hydrationAvg =
      records.length > 0
        ? Math.round(records.reduce((sum, record) => sum + Math.max(record.waterMl, 0), 0) / records.length)
        : 0;
    const vegetableDays = new Set(records.filter(hasVegetableMeal).map((record) => normalizeLocalDate(record.date))).size;

    stats.set(childId, {
      hydrationAvg,
      vegetableDays,
    });
  });

  return stats;
}

function findMissingFeedbackDays(
  child: AdminAgentChildSnapshot,
  feedbacks: AdminAgentGuardianFeedbackSnapshot[],
  today: string
) {
  if (!child.parentUserId) return 0;

  const latest = feedbacks
    .map((item) => normalizeLocalDate(item.date))
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left))[0];

  if (!latest) return 7;

  const todayTime = new Date(today).getTime();
  const latestTime = new Date(latest).getTime();
  const diff = Math.max(0, Math.round((todayTime - latestTime) / (24 * 60 * 60 * 1000)));
  return diff;
}

function buildChildPrioritySeeds(input: PriorityEngineInput) {
  const today = input.today ?? getLocalToday();
  const children = input.visibleChildren;
  const childIds = new Set(children.map((child) => child.id));
  const childMap = new Map(children.map((child) => [child.id, child] as const));
  const dietStatsMap = buildChildDietStatsMap(input.mealRecords, childIds, today);
  const childSeeds = new Map<string, ChildPrioritySeed>();

  children.forEach((child) => {
    const healths = input.healthCheckRecords.filter(
      (record) => record.childId === child.id && isDateWithinLastDays(record.date, 7, today)
    );
    const todayAbnormal = healths.filter((record) => normalizeLocalDate(record.date) === today && record.isAbnormal);
    const extraAbnormal = healths.filter((record) => record.isAbnormal).length - todayAbnormal.length;
    const growths = input.growthRecords.filter(
      (record) => record.childId === child.id && isDateWithinLastDays(record.createdAt, 7, today)
    );
    const pendingReviews = growths.filter((record) => record.reviewStatus === "待复查");
    const feedbacks = input.guardianFeedbacks.filter(
      (record) => record.childId === child.id && isDateWithinLastDays(record.date, 7, today)
    );
    const latestFeedback = [...feedbacks].sort((left, right) => right.date.localeCompare(left.date))[0];
    const missingFeedbackDays = findMissingFeedbackDays(child, feedbacks, today);
    const dietStats = dietStatsMap.get(child.id) ?? { hydrationAvg: 0, vegetableDays: 0 };
    const attentionCategoryCount = new Set(
      growths.filter((record) => record.needsAttention).map((record) => record.category)
    ).size;
    const continuousCategoryCount = Array.from(
      growths.reduce<Map<string, Set<string>>>((map, record) => {
        if (!record.needsAttention) return map;
        const dates = map.get(record.category) ?? new Set<string>();
        dates.add(normalizeLocalDate(record.createdAt));
        map.set(record.category, dates);
        return map;
      }, new Map<string, Set<string>>())
    ).filter(([, dates]) => dates.size >= 2).length;

    let score = 0;
    const reasons: string[] = [];
    const evidence: InstitutionPriorityEvidence[] = [];

    if (todayAbnormal.length > 0) {
      score += 25;
      reasons.push("今日晨检异常");
      evidence.push({
        label: "今日晨检异常",
        value: `${todayAbnormal.length} 次`,
        weight: 25,
        detail: todayAbnormal[0]?.remark || todayAbnormal[0]?.mood,
      });
    }

    if (extraAbnormal > 0) {
      const abnormalScore = Math.min(16, extraAbnormal * 8);
      score += abnormalScore;
      reasons.push("近7天持续出现晨检风险");
      evidence.push({
        label: "近7天额外晨检异常",
        value: `${extraAbnormal} 次`,
        weight: abnormalScore,
      });
    }

    if (pendingReviews.length > 0) {
      const reviewScore = Math.min(24, pendingReviews.length * 12);
      score += reviewScore;
      reasons.push("待复查积压");
      evidence.push({
        label: "待复查",
        value: `${pendingReviews.length} 条`,
        weight: reviewScore,
        detail: pendingReviews[0]?.followUpAction || pendingReviews[0]?.description,
      });
    }

    if (continuousCategoryCount > 0) {
      score += 10;
      reasons.push("连续多天风险项");
      evidence.push({
        label: "连续风险",
        value: `${continuousCategoryCount} 类`,
        weight: 10,
      });
    }

    if (missingFeedbackDays >= 7) {
      score += 14;
      reasons.push("近7天无家长反馈");
      evidence.push({
        label: "家长反馈缺失",
        value: "7天无反馈",
        weight: 14,
      });
    } else if (missingFeedbackDays >= 3) {
      score += 10;
      reasons.push("近3天无家长反馈");
      evidence.push({
        label: "家长反馈缺失",
        value: "3天无反馈",
        weight: 10,
      });
    }

    if (dietStats.hydrationAvg > 0 && dietStats.hydrationAvg < 120) {
      score += 14;
      reasons.push("饮水持续偏低");
      evidence.push({
        label: "饮水均值",
        value: `${dietStats.hydrationAvg} ml`,
        weight: 14,
      });
    } else if (dietStats.hydrationAvg > 0 && dietStats.hydrationAvg < 140) {
      score += 8;
      reasons.push("饮水偏低");
      evidence.push({
        label: "饮水均值",
        value: `${dietStats.hydrationAvg} ml`,
        weight: 8,
      });
    }

    if (dietStats.vegetableDays > 0 && dietStats.vegetableDays < 3) {
      score += 6;
      reasons.push("蔬果摄入不足");
      evidence.push({
        label: "蔬果天数",
        value: `${dietStats.vegetableDays} 天`,
        weight: 6,
      });
    }

    if (latestFeedback?.interventionCardId && latestFeedback.improved !== true) {
      score += 10;
      reasons.push("已有干预但尚未形成闭环");
      evidence.push({
        label: "干预闭环",
        value: latestFeedback.executed === false ? "未执行" : "待验证",
        weight: 10,
      });
    }

    if (latestFeedback?.executed === false) {
      score += 8;
      reasons.push("家长未执行建议动作");
      evidence.push({
        label: "最新家长反馈",
        value: "未执行",
        weight: 8,
      });
    }

    if (latestFeedback?.improved === false) {
      score += 8;
      reasons.push("最近反馈未见改善");
      evidence.push({
        label: "改善情况",
        value: "暂无改善",
        weight: 8,
      });
    }

    if (attentionCategoryCount >= 3) {
      score += 12;
      reasons.push("命中多类风险");
      evidence.push({
        label: "风险类型",
        value: `${attentionCategoryCount} 类`,
        weight: 12,
      });
    }

    childSeeds.set(child.id, {
      child,
      score: clampScore(score),
      reasons,
      evidence,
      healthAbnormalCount: healths.filter((record) => record.isAbnormal).length,
      pendingReviewCount: pendingReviews.length,
      missingFeedbackDays,
      hydrationAvg: dietStats.hydrationAvg,
      vegetableDays: dietStats.vegetableDays,
    });
  });

  return {
    today,
    childMap,
    childSeeds,
  };
}

function buildChildItems(input: PriorityEngineInput, seeds: Map<string, ChildPrioritySeed>) {
  return Array.from(seeds.values())
    .map((seed) => {
      const level = buildPriorityLevel(seed.score);
      if (!level) return null;

      const owner = buildOwner("teacher", `${seed.child.className}班主任`, seed.child, seed.child.className);
      const reason = seed.reasons.slice(0, 2).join("、") || "存在需要园长优先关注的机构级风险信号";
      const action =
        seed.healthAbnormalCount > 0
          ? `优先复核${seed.child.name}今日与近7天晨检异常，并同步家长反馈安排。`
          : seed.pendingReviewCount > 0
            ? `安排${seed.child.name}相关待复查观察尽快闭环，并明确今天的跟进动作。`
            : seed.missingFeedbackDays >= 3
              ? `督促${seed.child.name}家庭今晚补齐反馈，避免家园协同链路继续变弱。`
              : `跟进${seed.child.name}的饮水、蔬果与持续观察问题，确保今日形成明确动作。`;
      const deadline =
        seed.healthAbnormalCount > 0
          ? "今日上午"
          : seed.pendingReviewCount > 0
            ? "今日放学前"
            : seed.missingFeedbackDays >= 3
              ? "今晚 21:00 前"
              : "今日放学前";
      const id = `priority-child-${seed.child.id}`;
      const evidence = seed.evidence.slice(0, 5);

      return {
        id,
        targetType: "child",
        targetId: seed.child.id,
        targetName: seed.child.name,
        priorityScore: seed.score,
        priorityLevel: level,
        reason,
        evidence,
        recommendedOwner: owner,
        recommendedAction: action,
        recommendedDeadline: deadline,
        relatedChildIds: [seed.child.id],
        relatedClassNames: [seed.child.className],
        dispatchPayload: buildDispatchPayload({
          input,
          id,
          targetType: "child",
          targetId: seed.child.id,
          targetName: seed.child.name,
          priorityScore: seed.score,
          priorityLevel: level,
          owner,
          reason,
          action,
          deadline,
          evidence,
          relatedChildIds: [seed.child.id],
          relatedClassNames: [seed.child.className],
        }),
      } satisfies InstitutionPriorityItem;
    })
    .filter((item): item is Exclude<typeof item, null> => item !== null)
    .sort(comparePriority);
}

function buildClassItems(
  input: PriorityEngineInput,
  seeds: Map<string, ChildPrioritySeed>,
  today: string
) {
  const childSeeds = Array.from(seeds.values());
  const byClass = childSeeds.reduce<Map<string, ChildPrioritySeed[]>>((map, seed) => {
    const items = map.get(seed.child.className) ?? [];
    items.push(seed);
    map.set(seed.child.className, items);
    return map;
  }, new Map<string, ChildPrioritySeed[]>());

  const classItems: InstitutionPriorityItem[] = [];

  byClass.forEach((items, className) => {
    const childIds = items.map((item) => item.child.id);
    const topChildSum = [...items]
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .reduce((sum, item) => sum + item.score, 0);
    const todayPresentChildren = new Set(
      input.attendanceRecords
        .filter((record) => record.isPresent && normalizeLocalDate(record.date) === today)
        .map((record) => record.childId)
    );
    const uncheckedMorningCount = childIds.filter((childId) => {
      if (!todayPresentChildren.has(childId)) return false;
      return !input.healthCheckRecords.some(
        (record) => record.childId === childId && normalizeLocalDate(record.date) === today
      );
    }).length;
    const pendingReviewCount = input.growthRecords.filter(
      (record) =>
        childIds.includes(record.childId) &&
        isDateWithinLastDays(record.createdAt, 7, today) &&
        record.reviewStatus === "待复查"
    ).length;
    const parentLinked = items.filter((item) => Boolean(item.child.parentUserId));
    const recentFeedbackChildren = new Set(
      input.guardianFeedbacks
        .filter((record) => childIds.includes(record.childId) && isDateWithinLastDays(record.date, 3, today))
        .map((record) => record.childId)
    );
    const completionRate =
      parentLinked.length > 0 ? Math.round((recentFeedbackChildren.size / parentLinked.length) * 100) : 100;
    const riskTypeRepeat = Array.from(
      input.growthRecords.reduce<Map<string, Set<string>>>((map, record) => {
        if (!childIds.includes(record.childId) || !record.needsAttention || !isDateWithinLastDays(record.createdAt, 7, today)) {
          return map;
        }
        const children = map.get(record.category) ?? new Set<string>();
        children.add(record.childId);
        map.set(record.category, children);
        return map;
      }, new Map<string, Set<string>>())
    ).filter(([, childSet]) => childSet.size >= 2).length;

    let score = Math.round(topChildSum * 0.35);
    const evidence: InstitutionPriorityEvidence[] = [
      {
        label: "班级前3名儿童风险得分",
        value: `${topChildSum}`,
        weight: Math.round(topChildSum * 0.35),
      },
    ];
    const reasons: string[] = [];

    if (uncheckedMorningCount > 0) {
      const extra = Math.min(18, uncheckedMorningCount * 6);
      score += extra;
      reasons.push("晨检闭环不完整");
      evidence.push({
        label: "今日未完成晨检",
        value: `${uncheckedMorningCount} 名`,
        weight: extra,
      });
    }

    if (pendingReviewCount > 0) {
      const extra = Math.min(20, pendingReviewCount * 4);
      score += extra;
      reasons.push("待复查积压");
      evidence.push({
        label: "待复查积压",
        value: `${pendingReviewCount} 条`,
        weight: extra,
      });
    }

    if (completionRate < 60) {
      score += 12;
      reasons.push("家长反馈完成率偏低");
      evidence.push({
        label: "近3天反馈完成率",
        value: `${completionRate}%`,
        weight: 12,
      });
    } else if (completionRate < 80) {
      score += 6;
      reasons.push("家长反馈闭环偏弱");
      evidence.push({
        label: "近3天反馈完成率",
        value: `${completionRate}%`,
        weight: 6,
      });
    }

    if (riskTypeRepeat > 0) {
      score += 10;
      reasons.push("同类问题集中出现");
      evidence.push({
        label: "重复问题类型",
        value: `${riskTypeRepeat} 类`,
        weight: 10,
      });
    }

    const finalScore = clampScore(score);
    const level = buildPriorityLevel(finalScore);
    if (!level) return;

    const owner = buildOwner("teacher", `${className}班主任`, undefined, className);
    const reason = reasons.slice(0, 2).join("、") || "班级内高风险对象和闭环问题较集中";
    const action =
      uncheckedMorningCount > 0
        ? `先补齐${className}今日晨检，再按优先级处理待复查与高风险儿童。`
        : `优先处理${className}班内待复查积压和家长反馈薄弱点，形成班级整改清单。`;
    const deadline = uncheckedMorningCount > 0 ? "今日上午" : "本周五前";
    const id = `priority-class-${className}`;

    classItems.push({
      id,
      targetType: "class",
      targetId: className,
      targetName: className,
      priorityScore: finalScore,
      priorityLevel: level,
      reason,
      evidence,
      recommendedOwner: owner,
      recommendedAction: action,
      recommendedDeadline: deadline,
      relatedChildIds: childIds,
      relatedClassNames: [className],
      dispatchPayload: buildDispatchPayload({
        input,
        id,
        targetType: "class",
        targetId: className,
        targetName: className,
        priorityScore: finalScore,
        priorityLevel: level,
        owner,
        reason,
        action,
        deadline,
        evidence,
        relatedChildIds: childIds,
        relatedClassNames: [className],
      }),
    });
  });

  return classItems.sort(comparePriority);
}

function buildFamilyItems(
  input: PriorityEngineInput,
  seeds: Map<string, ChildPrioritySeed>,
  childItems: InstitutionPriorityItem[],
  today: string
) {
  const childPriorityMap = new Map(childItems.map((item) => [item.targetId, item] as const));

  return input.visibleChildren
    .filter((child) => Boolean(child.parentUserId))
    .map((child) => {
      const feedbacks = input.guardianFeedbacks
        .filter((record) => record.childId === child.id && isDateWithinLastDays(record.date, 7, today))
        .sort((left, right) => right.date.localeCompare(left.date));
      const latest = feedbacks[0];
      const seed = seeds.get(child.id);
      const missingFeedbackDays = seed?.missingFeedbackDays ?? 0;
      let score = 0;
      const reasons: string[] = [];
      const evidence: InstitutionPriorityEvidence[] = [];

      if (missingFeedbackDays >= 7) {
        score += 10;
        reasons.push("长期缺少家长反馈");
        evidence.push({
          label: "反馈缺失",
          value: "7天无反馈",
          weight: 10,
        });
      } else if (missingFeedbackDays >= 3) {
        score += 10;
        reasons.push("近3天无反馈");
        evidence.push({
          label: "反馈缺失",
          value: "3天无反馈",
          weight: 10,
        });
      }

      if (latest?.executed === false) {
        score += 8;
        reasons.push("家长未执行建议动作");
        evidence.push({
          label: "执行状态",
          value: "未执行",
          weight: 8,
        });
      }

      if (latest?.improved === false) {
        score += 8;
        reasons.push("最近一次反馈未见改善");
        evidence.push({
          label: "改善情况",
          value: "暂无改善",
          weight: 8,
        });
      }

      if (childPriorityMap.has(child.id)) {
        score += 10;
        reasons.push("关联儿童已进入高优先级");
        evidence.push({
          label: "关联儿童",
          value: childPriorityMap.get(child.id)!.priorityLevel,
          weight: 10,
        });
      }

      if (latest?.interventionCardId && latest.improved !== true) {
        score += 10;
        reasons.push("干预卡尚未形成闭环");
        evidence.push({
          label: "干预闭环",
          value: latest.executed === false ? "未执行" : "待验证",
          weight: 10,
        });
      }

      const finalScore = clampScore(score);
      const level = buildPriorityLevel(finalScore);
      if (!level) return null;

      const owner = buildOwner("parent", `${child.name}家长`, child, child.className);
      const reason = reasons.slice(0, 2).join("、") || "家长协同链路存在断点";
      const action = `提醒${child.name}家庭今晚补齐反馈，并明确是否执行、孩子反应和是否改善。`;
      const deadline = "今晚 21:00 前";
      const id = `priority-family-${child.id}`;

      return {
        id,
        targetType: "family",
        targetId: child.id,
        targetName: `${child.name}家长`,
        priorityScore: finalScore,
        priorityLevel: level,
        reason,
        evidence,
        recommendedOwner: owner,
        recommendedAction: action,
        recommendedDeadline: deadline,
        relatedChildIds: [child.id],
        relatedClassNames: [child.className],
        dispatchPayload: buildDispatchPayload({
          input,
          id,
          targetType: "family",
          targetId: child.id,
          targetName: `${child.name}家长`,
          priorityScore: finalScore,
          priorityLevel: level,
          owner,
          reason,
          action,
          deadline,
          evidence,
          relatedChildIds: [child.id],
          relatedClassNames: [child.className],
        }),
      } satisfies InstitutionPriorityItem;
    })
    .filter((item): item is Exclude<typeof item, null> => item !== null)
    .sort(comparePriority);
}

function buildIssueItems(input: PriorityEngineInput, today: string) {
  const issueItems: InstitutionPriorityItem[] = [];
  const visibleChildIds = new Set(input.visibleChildren.map((child) => child.id));
  const todayAbnormalChildren = input.healthCheckRecords.filter(
    (record) =>
      visibleChildIds.has(record.childId) &&
      normalizeLocalDate(record.date) === today &&
      record.isAbnormal
  );

  if (todayAbnormalChildren.length > 0) {
    const score = clampScore(15 + Math.min(12, todayAbnormalChildren.length * 4));
    const level = buildPriorityLevel(score);
    if (level) {
      const evidence = [
        {
          label: "今日晨检异常",
          value: `${todayAbnormalChildren.length} 名`,
          weight: score,
        },
      ];
      const owner = buildOwner("teacher", "相关班主任");
      const id = "priority-issue-health-review";
      issueItems.push({
        id,
        targetType: "issue",
        targetId: "health-review",
        targetName: "今日晨检异常复核",
        priorityScore: score,
        priorityLevel: level,
        reason: "当日健康异常需要先完成复核与后续安排，避免高风险对象遗漏。",
        evidence,
        recommendedOwner: owner,
        recommendedAction: "优先复核今日晨检异常儿童，并明确是否需要家长协同或后续观察。",
        recommendedDeadline: "今日上午",
        relatedChildIds: todayAbnormalChildren.map((record) => record.childId),
        relatedClassNames: Array.from(
          new Set(
            input.visibleChildren
              .filter((child) => todayAbnormalChildren.some((record) => record.childId === child.id))
              .map((child) => child.className)
          )
        ),
        dispatchPayload: buildDispatchPayload({
          input,
          id,
          targetType: "issue",
          targetId: "health-review",
          targetName: "今日晨检异常复核",
          priorityScore: score,
          priorityLevel: level,
          owner,
          reason: "当日健康异常需要先完成复核与后续安排，避免高风险对象遗漏。",
          action: "优先复核今日晨检异常儿童，并明确是否需要家长协同或后续观察。",
          deadline: "今日上午",
          evidence,
          relatedChildIds: todayAbnormalChildren.map((record) => record.childId),
          relatedClassNames: Array.from(
            new Set(
              input.visibleChildren
                .filter((child) => todayAbnormalChildren.some((record) => record.childId === child.id))
                .map((child) => child.className)
            )
          ),
        }),
      });
    }
  }

  const pendingReviews = input.growthRecords.filter(
    (record) => visibleChildIds.has(record.childId) && isDateWithinLastDays(record.createdAt, 7, today) && record.reviewStatus === "待复查"
  );
  if (pendingReviews.length > 0) {
    const score = clampScore(12 + Math.min(24, pendingReviews.length * 4));
    const level = buildPriorityLevel(score);
    if (level) {
      const evidence = [
        {
          label: "待复查积压",
          value: `${pendingReviews.length} 条`,
          weight: score,
        },
      ];
      const owner = buildOwner("teacher", "相关班主任");
      const id = "priority-issue-pending-review";
      issueItems.push({
        id,
        targetType: "issue",
        targetId: "pending-review",
        targetName: "待复查积压",
        priorityScore: score,
        priorityLevel: level,
        reason: "待复查记录积压会直接影响重点儿童闭环和机构级复盘判断。",
        evidence,
        recommendedOwner: owner,
        recommendedAction: "按优先级清理待复查积压，先完成今日到期和高风险儿童的复查动作。",
        recommendedDeadline: "今日放学前",
        relatedChildIds: pendingReviews.map((record) => record.childId),
        relatedClassNames: Array.from(
          new Set(
            input.visibleChildren
              .filter((child) => pendingReviews.some((record) => record.childId === child.id))
              .map((child) => child.className)
          )
        ),
        dispatchPayload: buildDispatchPayload({
          input,
          id,
          targetType: "issue",
          targetId: "pending-review",
          targetName: "待复查积压",
          priorityScore: score,
          priorityLevel: level,
          owner,
          reason: "待复查记录积压会直接影响重点儿童闭环和机构级复盘判断。",
          action: "按优先级清理待复查积压，先完成今日到期和高风险儿童的复查动作。",
          deadline: "今日放学前",
          evidence,
          relatedChildIds: pendingReviews.map((record) => record.childId),
          relatedClassNames: Array.from(
            new Set(
              input.visibleChildren
                .filter((child) => pendingReviews.some((record) => record.childId === child.id))
                .map((child) => child.className)
            )
          ),
        }),
      });
    }
  }

  const overdueDispatches = (input.notificationEvents ?? []).filter((event) => {
    if (event.status === "completed") return false;
    const deadline = normalizeLocalDate(event.recommendedDeadline);
    return Boolean(deadline) && deadline < today;
  });

  if (overdueDispatches.length > 0) {
    const score = clampScore(10 + Math.min(18, overdueDispatches.length * 6));
    const level = buildPriorityLevel(score);
    if (level) {
      const evidence = [
        {
          label: "逾期派单",
          value: `${overdueDispatches.length} 条`,
          weight: score,
        },
      ];
      const owner = buildOwner("admin", "园长/管理员");
      const id = "priority-issue-overdue-dispatch";
      issueItems.push({
        id,
        targetType: "issue",
        targetId: "overdue-dispatch",
        targetName: "通知派单逾期",
        priorityScore: score,
        priorityLevel: level,
        reason: "已有派单逾期会削弱机构级执行力，需要园长先推动状态更新与责任确认。",
        evidence,
        recommendedOwner: owner,
        recommendedAction: "优先处理逾期通知派单，明确阻塞原因并更新状态或完成记录。",
        recommendedDeadline: "今日放学前",
        relatedChildIds: overdueDispatches.map((event) => event.targetId),
        relatedClassNames: [],
        dispatchPayload: buildDispatchPayload({
          input,
          id,
          targetType: "issue",
          targetId: "overdue-dispatch",
          targetName: "通知派单逾期",
          priorityScore: score,
          priorityLevel: level,
          owner,
          reason: "已有派单逾期会削弱机构级执行力，需要园长先推动状态更新与责任确认。",
          action: "优先处理逾期通知派单，明确阻塞原因并更新状态或完成记录。",
          deadline: "今日放学前",
          evidence,
          relatedChildIds: overdueDispatches.map((event) => event.targetId),
          relatedClassNames: [],
        }),
      });
    }
  }

  return issueItems.sort(comparePriority);
}

export function buildInstitutionPriorityEngine(input: PriorityEngineInput): PriorityEngineResult {
  const { today, childSeeds } = buildChildPrioritySeeds(input);
  const childItems = buildChildItems(input, childSeeds);
  const classItems = buildClassItems(input, childSeeds, today);
  const familyItems = buildFamilyItems(input, childSeeds, childItems, today);
  const issueItems = buildIssueItems(input, today);
  const priorityItems = [...childItems, ...classItems, ...issueItems, ...familyItems].sort(comparePriority);

  return {
    priorityItems,
    childItems,
    classItems,
    familyItems,
    issueItems,
  };
}
