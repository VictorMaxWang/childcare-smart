import type { ApiWeeklyReport } from "@/lib/api/types";
import type { ConsultationResult, HighRiskAgentView } from "@/lib/ai/types";
import type { InterventionCard } from "@/lib/agent/intervention-card";
import { DEMO_MEDIA_FALLBACKS, getDemoMediaPath, isGptImage2Path } from "@/lib/demo-media/assets";
import type { GuardianFeedback } from "@/lib/feedback/types";
import type { DemoSeedSnapshot } from "./seed";
import {
  DEFENSE_CHILD_PROFILES,
  DEFENSE_CLASS,
  DEFENSE_DIRECTOR_ID,
  DEFENSE_INSTITUTION_ID,
  DEFENSE_PARENT_ID,
  DEFENSE_PARENT_NAME,
  DEFENSE_REBALANCED_SUNRISE_CHILD_IDS,
  DEFENSE_REBALANCED_SUNRISE_CLASS,
  isDefenseChildId,
  type DefenseChildId,
  type DefenseChildProfile,
} from "./defense-scenario";

type SnapshotChild = DemoSeedSnapshot["children"][number];
type SnapshotTask = DemoSeedSnapshot["tasks"][number] & {
  assignedTeacherId?: string;
  assignedTeacherName?: string;
  riskItemId?: string;
  createdBy?: string;
};

type ClassScope = {
  classId: "class-sunrise" | "class-morning";
  className: "向阳班" | "晨曦班";
  teacherId: "u-teacher" | "u-teacher2";
  teacherName: "李老师" | "周老师";
};

type ChildScopedRecord = {
  childId: string;
  classId?: string;
  teacherId?: string;
  parentId?: string;
};

const CHILD_IDS_WITH_CUSTOM_CONVERSATIONS = ["c-1", "c-2", "c-3", "c-5"] as const;
const CHILD_IDS_WITH_CUSTOM_CONSULTATIONS = ["c-1", "c-2", "c-3", "c-5"] as const;

function toDateKey(now: string) {
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) return "2026-05-07";
  return parsed.toISOString().slice(0, 10);
}

function shiftDate(dateKey: string, offsetDays: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function at(dateKey: string, hour = 9, minute = 0) {
  return `${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function teacherNameFor(teacherId?: string) {
  return teacherId === DEFENSE_CLASS.teacherId
    ? DEFENSE_CLASS.teacherName
    : DEFENSE_REBALANCED_SUNRISE_CLASS.teacherName;
}

function classScopeForChildId(childId: string, fallback: ClassScope): ClassScope {
  if (isDefenseChildId(childId)) return DEFENSE_CLASS;
  if (DEFENSE_REBALANCED_SUNRISE_CHILD_IDS.includes(childId as never)) return DEFENSE_REBALANCED_SUNRISE_CLASS;
  return fallback;
}

function syncChildScope<T extends ChildScopedRecord>(record: T, childMap: Map<string, SnapshotChild>): T {
  const child = childMap.get(record.childId);
  if (!child) return record;
  return {
    ...record,
    classId: child.classId,
    teacherId: child.teacherId,
    parentId: child.parentId,
  };
}

function growthMediaRef(childId: string, key: string) {
  return getDemoMediaPath("growth", `${childId}-${key}`, DEMO_MEDIA_FALLBACKS.growth);
}

function healthMaterialMediaRef(childId: string) {
  return getDemoMediaPath("health-materials", childId, DEMO_MEDIA_FALLBACKS.health);
}

function upsertByKey<T>(items: T[], additions: T[], readKey: (item: T) => string) {
  const additionKeys = new Set(additions.map(readKey));
  return [...items.filter((item) => !additionKeys.has(readKey(item))), ...additions];
}

function updateChildren(children: DemoSeedSnapshot["children"]): DemoSeedSnapshot["children"] {
  return children.map((child) => {
    const fallbackScope: ClassScope =
      child.teacherId === DEFENSE_CLASS.teacherId ? DEFENSE_CLASS : DEFENSE_REBALANCED_SUNRISE_CLASS;
    const scope = classScopeForChildId(child.id, fallbackScope);
    const profile = isDefenseChildId(child.id) ? DEFENSE_CHILD_PROFILES[child.id] : null;
    const parentId = profile?.childId === "c-1" || profile?.childId === "c-4" ? DEFENSE_PARENT_ID : child.parentId;
    const guardianName = profile?.guardianName ?? child.guardians[0]?.name ?? "演示家长";

    return {
      ...child,
      displayName: profile?.name ?? child.displayName,
      name: profile?.name ?? child.name,
      nickname: profile?.nickname ?? child.nickname,
      gender: profile?.gender ?? child.gender,
      avatar: profile?.avatar ?? child.avatar,
      guardians: child.guardians.map((guardian, index) =>
        index === 0
          ? {
              ...guardian,
              name: guardianName,
            }
          : guardian
      ),
      className: scope.className,
      classId: scope.classId,
      teacherId: scope.teacherId,
      parentId,
      parentUserId: parentId === DEFENSE_PARENT_ID ? DEFENSE_PARENT_ID : undefined,
      specialNotes: profile?.specialNotes ?? child.specialNotes,
    };
  });
}

function patchHealthRecords(
  health: DemoSeedSnapshot["health"],
  childMap: Map<string, SnapshotChild>,
  today: string
): DemoSeedSnapshot["health"] {
  return health.map((record) => {
    const synced = syncChildScope(record, childMap);
    const child = childMap.get(record.childId);
    const teacherName = teacherNameFor(child?.teacherId);
    if (record.date !== today) {
      return {
        ...synced,
        checkedBy: record.checkedByRole === "教师" ? teacherName : record.checkedBy,
      };
    }

    if (record.childId === "c-1") {
      return {
        ...synced,
        temperature: 36.6,
        mood: "走廊活动退缩",
        handMouthEye: "正常",
        isAbnormal: true,
        remark: "走廊活动听到推车声后害怕退缩，周老师引导林小雨说出“我害怕”，再牵手完成一小步尝试。",
        checkedBy: teacherName,
      };
    }

    if (record.childId === "c-2") {
      return {
        ...synced,
        temperature: 36.7,
        mood: "午睡前焦虑",
        handMouthEye: "正常",
        isAbnormal: true,
        remark: "午睡前焦虑，主动饮水偏少；已安排午后补水记录，并在离园前复查精神状态、入睡情况和累计饮水量。",
        checkedBy: teacherName,
      };
    }

    if (record.childId === "c-5") {
      return {
        ...synced,
        temperature: 36.9,
        mood: "偶发咳嗽",
        handMouthEye: "正常",
        isAbnormal: true,
        remark: "上午偶发咳嗽 2 次，无发热；家长已上传健康材料，当前待解析，园内继续观察咳嗽频次和精神状态。",
        checkedBy: teacherName,
      };
    }

    if (record.childId === "c-4") {
      return {
        ...synced,
        temperature: 36.5,
        mood: "平稳",
        handMouthEye: "正常",
        isAbnormal: false,
        remark: "情绪稳定，入园和晨检状态正常，作为晨曦班正常对照样本。",
        checkedBy: teacherName,
      };
    }

    return {
      ...synced,
      checkedBy: record.checkedByRole === "教师" ? teacherName : record.checkedBy,
    };
  });
}

function patchMealRecords(
  meals: DemoSeedSnapshot["meals"],
  childMap: Map<string, SnapshotChild>,
  today: string
): DemoSeedSnapshot["meals"] {
  return meals.map((record) => {
    const synced = syncChildScope(record, childMap);
    const child = childMap.get(record.childId);
    const recordedBy = record.recordedByRole === "教师" ? teacherNameFor(child?.teacherId) : record.recordedBy;

    if (record.childId === "c-2" && record.date === today) {
      return {
        ...synced,
        waterMl: Math.min(record.waterMl, record.meal === "午餐" ? 80 : 70),
        recordedBy,
      };
    }

    if (record.childId === "c-3" && record.date === today && record.meal === "午餐") {
      return {
        ...synced,
        foods: [
          { id: `food-c-3-${today}-lunch-1`, name: "软米饭", category: "主食", amount: "少量" },
          { id: `food-c-3-${today}-lunch-2`, name: "番茄牛肉末", category: "蛋白", amount: "2 勺" },
          { id: `food-c-3-${today}-lunch-3`, name: "清炒时蔬", category: "蔬果", amount: "剩余较多" },
        ],
        intakeLevel: "少量",
        preference: "拒食",
        waterMl: 85,
        nutritionScore: 74,
        aiEvaluation: {
          mealScore: 74,
          mealComment: "午餐主食和蔬菜摄入偏少，需要次日继续观察小份目标。",
          todayScore: 78,
          todayComment: "今日饮食波动集中在午餐，晚间请家长同步晚餐食量。",
          recentScore: 82,
          recentComment: "近 7 天整体可维持，但午餐接受度需要复查。",
          suggestions: ["明天午餐设置小份主食目标", "离园时同步晚餐食量和饮水", "补一条饮食成长记录"],
          generatedAt: at(today, 13, 10),
          model: "defense-fixture",
        },
        recordedBy,
      };
    }

    return {
      ...synced,
      recordedBy,
    };
  });
}

function buildGrowthRecords(childMap: Map<string, SnapshotChild>, today: string): DemoSeedSnapshot["growth"] {
  const rows: DemoSeedSnapshot["growth"] = [];
  const add = (profile: DefenseChildProfile, payload: Omit<DemoSeedSnapshot["growth"][number], "childId" | "classId" | "teacherId" | "parentId" | "recorder" | "recorderRole">) => {
    const child = childMap.get(profile.childId);
    if (!child) return;
    rows.push({
      ...payload,
      childId: profile.childId,
      recorder: DEFENSE_CLASS.teacherName,
      recorderRole: "教师",
      classId: child.classId,
      teacherId: child.teacherId,
      parentId: child.parentId,
    });
  };

  add(DEFENSE_CHILD_PROFILES["c-1"], {
    id: "growth-defense-c-1-bravery",
    createdAt: at(today, 10, 20),
    category: "情绪表现",
    tags: ["走廊活动", "勇敢表达", "小步尝试"],
    selectedIndicators: ["能说出“我害怕”", "愿意牵手向前一小步"],
    description: "林小雨在走廊活动听到推车声后停在门口退缩，周老师蹲下陪她说出“我害怕”，再牵手向前走了一小步。",
    needsAttention: true,
    followUpAction: "明天走廊活动前先预告声音来源，引导她选择“牵手一步”或“站在门口看一看”。",
    reviewDate: shiftDate(today, 2),
    reviewStatus: "待复查",
    mediaUrls: [growthMediaRef("c-1", "defense-bravery")],
    mediaRefs: [growthMediaRef("c-1", "defense-bravery")],
  });

  add(DEFENSE_CHILD_PROFILES["c-2"], {
    id: "growth-defense-c-2-nap-hydration",
    createdAt: at(today, 12, 55),
    category: "睡眠情况",
    tags: ["午睡焦虑", "饮水少", "离园前复查"],
    selectedIndicators: ["午睡前需要稳定过渡", "主动饮水不足"],
    description: "高远舟午睡前反复确认老师是否在旁边，握水杯但主动饮水少，需要午后补水记录并在离园前复查。",
    needsAttention: true,
    followUpAction: "午睡前安排安静过渡，午后记录补水，16:30 前复查精神状态、入睡情况和累计饮水量。",
    reviewDate: shiftDate(today, 2),
    reviewStatus: "待复查",
    mediaUrls: [growthMediaRef("c-2", "defense-nap-hydration")],
    mediaRefs: [growthMediaRef("c-2", "defense-nap-hydration")],
  });

  add(DEFENSE_CHILD_PROFILES["c-3"], {
    id: "growth-defense-c-3-diet-followup",
    createdAt: at(today, 13, 35),
    category: "独立进食",
    tags: ["午餐进食偏少", "饮食观察", "家园同步"],
    selectedIndicators: ["小份主食目标", "一口蔬菜目标"],
    description: "陈安安午餐主食少量、蔬菜剩余较多；已补充饮食观察成长记录，离园时请家长同步晚餐食量和饮水。",
    needsAttention: true,
    followUpAction: "明天午餐设置小份主食和一口蔬菜目标，48 小时内复查进食变化。",
    reviewDate: shiftDate(today, 2),
    reviewStatus: "待复查",
    mediaUrls: [growthMediaRef("c-3", "defense-diet-followup")],
    mediaRefs: [growthMediaRef("c-3", "defense-diet-followup")],
  });

  add(DEFENSE_CHILD_PROFILES["c-4"], {
    id: "growth-defense-c-4-stable-control",
    createdAt: at(today, 15, 5),
    category: "情绪表现",
    tags: ["情绪稳定", "正常对照", "晨曦班"],
    selectedIndicators: ["常规参与稳定"],
    description: "赵一诺今日入园、午睡和集体活动情绪稳定，能按常规参与，是本次答辩中的正常对照样本。",
    needsAttention: false,
    followUpAction: undefined,
    reviewDate: shiftDate(today, 2),
    reviewStatus: "已完成",
    mediaUrls: [growthMediaRef("c-4", "defense-stable-control")],
    mediaRefs: [growthMediaRef("c-4", "defense-stable-control")],
  });

  add(DEFENSE_CHILD_PROFILES["c-6"], {
    id: "growth-defense-c-6-sharing",
    createdAt: at(today, 15, 35),
    category: "社交互动",
    tags: ["主动分享玩具", "正向成长记录", "同伴互动"],
    selectedIndicators: ["主动分享", "同伴回应积极"],
    description: "刘予安在建构区主动把喜欢的小车分享给同伴，并提醒大家轮流使用，适合生成一条正向成长故事。",
    needsAttention: false,
    followUpAction: "今晚请孩子复述一次分享玩具的经历，强化积极社会性表达。",
    reviewDate: shiftDate(today, 2),
    reviewStatus: "已完成",
    mediaUrls: [growthMediaRef("c-6", "defense-sharing")],
    mediaRefs: [growthMediaRef("c-6", "defense-sharing")],
  });

  return rows;
}

function patchGrowthRecords(
  growth: DemoSeedSnapshot["growth"],
  childMap: Map<string, SnapshotChild>,
  today: string
): DemoSeedSnapshot["growth"] {
  const synced = growth.map((record) => {
    const scoped = syncChildScope(record, childMap);
    const child = childMap.get(record.childId);
    return {
      ...scoped,
      recorder: record.recorderRole === "教师" ? teacherNameFor(child?.teacherId) : record.recorder,
    };
  });
  return upsertByKey(synced, buildGrowthRecords(childMap, today), (record) => record.id);
}

function patchHealthMaterials(
  materials: DemoSeedSnapshot["healthMaterials"],
  today: string
): DemoSeedSnapshot["healthMaterials"] {
  return materials.map((material) => {
    if (material.childId !== "c-5") return material;
    const mediaRef = healthMaterialMediaRef("c-5");
    return {
      ...material,
      uploadedBy: DEFENSE_CLASS.teacherId,
      filename: "DEMO-c-5-cough-observation.webp",
      parseStatus: "pending",
      description: "王沐辰偶发咳嗽健康材料，答辩 fixture 固定为待解析状态。",
      parseResult: {
        mediaRefs: [mediaRef],
        pendingReason: "等待 OCR/健康材料解析服务处理",
        defenseScenario: "occasional-cough-pending-parse",
      },
      createdAt: at(today, 9, 45),
      updatedAt: at(today, 9, 45),
    };
  });
}

function agentView(
  role: HighRiskAgentView["role"],
  title: string,
  summary: string,
  signals: string[],
  actions: string[],
  observationPoints: string[]
): HighRiskAgentView {
  return {
    role,
    title,
    summary,
    signals,
    actions,
    observationPoints,
    evidence: signals,
  };
}

function buildConsultation(params: {
  profile: DefenseChildProfile;
  today: string;
  riskLevel: "medium" | "high";
  triggerReason: string;
  keyFindings: string[];
  schoolAction: string;
  homeAction: string;
  followUp48h: string[];
  parentMessageDraft: string;
  evidenceSourceId: string;
  generatedMinute: number;
}): ConsultationResult {
  const generatedAt = at(params.today, 16, params.generatedMinute);
  const consultationId = `consultation-defense-${params.profile.childId}`;
  const shouldEscalateToAdmin = true;

  return {
    consultationId,
    triggerReason: params.triggerReason,
    triggerType: params.riskLevel === "high" ? ["multi-risk", "continuous-abnormality"] : ["multi-risk"],
    triggerReasons: [params.triggerReason],
    participants: [
      { id: "health-agent", label: "健康观察 Agent" },
      { id: "diet-agent", label: "饮食行为 Agent" },
      { id: "coparenting-agent", label: "家园沟通 Agent" },
      { id: "execution-agent", label: "园内行动 Agent" },
      { id: "coordinator", label: "会诊协调 Agent" },
    ],
    childId: params.profile.childId,
    riskLevel: params.riskLevel,
    agentFindings: [
      {
        agentId: "health-agent",
        title: "健康与情绪信号",
        riskExplanation: params.keyFindings[0],
        signals: params.keyFindings,
        actions: [params.schoolAction],
        observationPoints: ["精神状态", "情绪过渡", "饮水和进食"],
        evidence: [params.evidenceSourceId],
      },
      {
        agentId: "coparenting-agent",
        title: "家园沟通闭环",
        riskExplanation: "需要家长今晚补充执行反馈，帮助 48 小时复查。",
        signals: [params.homeAction],
        actions: [params.parentMessageDraft],
        observationPoints: ["家长是否回复", "家庭行动是否完成"],
        evidence: [`conv-${params.profile.childId}-defense`],
      },
    ],
    summary: `${params.profile.name}：${params.triggerReason}`,
    keyFindings: params.keyFindings,
    healthAgentView: agentView(
      "HealthObservationAgent",
      "健康观察",
      params.keyFindings[0],
      params.keyFindings,
      [params.schoolAction],
      ["精神状态", "体温", "饮水"]
    ),
    dietBehaviorAgentView: agentView(
      "DietBehaviorAgent",
      "饮食行为",
      params.keyFindings[1] ?? "饮食饮水需要继续观察。",
      params.keyFindings,
      [params.schoolAction],
      ["午餐摄入", "补水量"]
    ),
    parentCommunicationAgentView: agentView(
      "ParentCommunicationAgent",
      "家园沟通",
      params.homeAction,
      [params.parentMessageDraft],
      [params.homeAction],
      ["家长回复", "家庭执行反馈"]
    ),
    inSchoolActionAgentView: agentView(
      "InSchoolActionAgent",
      "园内行动",
      params.schoolAction,
      [params.schoolAction],
      [params.schoolAction],
      ["明日入园状态", "复查任务进展"]
    ),
    todayInSchoolActions: [params.schoolAction],
    tonightAtHomeActions: [params.homeAction],
    followUp48h: params.followUp48h,
    parentMessageDraft: params.parentMessageDraft,
    directorDecisionCard: {
      title: `${params.profile.name} 48 小时答辩跟进`,
      reason: params.triggerReason,
      recommendedOwnerRole: params.riskLevel === "high" ? "teacher" : "parent",
      recommendedOwnerName: params.riskLevel === "high" ? DEFENSE_CLASS.teacherName : params.profile.guardianName,
      recommendedAt: generatedAt,
      status: params.riskLevel === "high" ? "pending" : "in_progress",
    },
    explainability: [
      { label: "答辩 fixture", detail: "由固定健康、饮食、成长、消息和反馈记录聚合生成。" },
      { label: "儿童", detail: `${params.profile.childId} ${params.profile.name}` },
    ],
    evidenceItems: [
      {
        id: `evidence-${params.profile.childId}-primary`,
        sourceType: params.profile.childId === "c-3" ? "teacher_note" : "health_check",
        sourceLabel: params.profile.childId === "c-3" ? "成长记录" : "晨检/健康记录",
        sourceId: params.evidenceSourceId,
        summary: params.keyFindings.join("；"),
        confidence: "high",
        requiresHumanReview: false,
        evidenceCategory: "risk_control",
        supports: [{ type: "finding", targetId: "primary", targetLabel: "主要风险" }],
        timestamp: generatedAt,
      },
    ],
    nextCheckpoints: params.followUp48h,
    coordinatorSummary: {
      finalConclusion: `${params.profile.name} 需要进入答辩固定跟进队列。`,
      riskLevel: params.riskLevel,
      problemDefinition: params.triggerReason,
      schoolAction: params.schoolAction,
      homeAction: params.homeAction,
      observationPoints: ["园内复查", "家庭反馈", "48 小时闭环"],
      reviewIn48h: params.followUp48h.join("；"),
      shouldEscalateToAdmin,
    },
    schoolAction: params.schoolAction,
    homeAction: params.homeAction,
    observationPoints: ["园内复查", "家庭反馈", "48 小时闭环"],
    reviewIn48h: params.followUp48h.join("；"),
    shouldEscalateToAdmin,
    continuityNotes: [`答辩主题：${params.profile.educationTheme}`],
    source: "rule",
    provider: "defense-fixture",
    model: "defense-scenario-v1",
    fallback: true,
    generatedAt,
    status: "active",
    workflowStatus: "pending",
    notes: [{ note: "答辩 fixture 固定会诊数据", createdAt: generatedAt, createdBy: DEFENSE_DIRECTOR_ID }],
    createdBy: DEFENSE_DIRECTOR_ID,
    updatedAt: generatedAt,
  } as ConsultationResult;
}

function buildConsultations(today: string): ConsultationResult[] {
  return [
    buildConsultation({
      profile: DEFENSE_CHILD_PROFILES["c-1"],
      today,
      riskLevel: "medium",
      triggerReason: "走廊活动害怕退缩，需要勇敢表达与小步尝试的家园协同支持。",
      keyFindings: ["走廊活动听到推车声后退缩", "能在老师陪伴下说出“我害怕”", "家庭今晚需要共读绘本并完成小步尝试"],
      schoolAction: "走廊活动前先预告声音来源，提供牵手一步的可选小目标。",
      homeAction: "今晚共读绘本，说出“我害怕”，完成一次小步尝试。",
      followUp48h: ["明天记录是否愿意走到门口", "后天复查是否能独立说出需求"],
      parentMessageDraft: "小雨今天在走廊活动里有一点害怕，但愿意说出“我害怕”并牵手走一步。今晚请共读《林小雨的一小步勇敢》，再完成一次小步尝试。",
      evidenceSourceId: `growth-defense-c-1-bravery`,
      generatedMinute: 10,
    }),
    buildConsultation({
      profile: DEFENSE_CHILD_PROFILES["c-2"],
      today,
      riskLevel: "high",
      triggerReason: "午睡焦虑叠加主动饮水偏少，且家长沟通仍待回复，需要 48 小时复查。",
      keyFindings: ["午睡前反复确认老师是否在场", "今日主动饮水偏少", "离园前需要复查精神状态和饮水量"],
      schoolAction: "午睡前安排固定安抚流程，午后记录补水，16:30 前完成离园前复查。",
      homeAction: "今晚记录入睡时间、饮水量和情绪变化，明早反馈给周老师。",
      followUp48h: ["离园前复查精神状态", "48 小时内核对饮水和入睡趋势", "家长未回复时由周老师二次提醒"],
      parentMessageDraft: "远舟今天午睡前有些焦虑，主动饮水偏少。请今晚记录入睡时间、饮水量和情绪变化，明早反馈给周老师，我们会做 48 小时复查。",
      evidenceSourceId: `health-c-2-${today}`,
      generatedMinute: 18,
    }),
    buildConsultation({
      profile: DEFENSE_CHILD_PROFILES["c-3"],
      today,
      riskLevel: "medium",
      triggerReason: "午餐进食偏少，需要饮食观察、家园同步，并补充成长记录。",
      keyFindings: ["午餐主食少量、蔬菜剩余较多", "已补一条饮食成长记录", "需家长同步晚餐食量和饮水"],
      schoolAction: "明天午餐设置小份主食和一口蔬菜目标，记录接受度。",
      homeAction: "今晚同步晚餐食量、饮水和入睡状态。",
      followUp48h: ["明天午餐复查小份目标", "48 小时内核对家庭晚餐反馈"],
      parentMessageDraft: "安安今天午餐吃得偏少，我们明天会用小份主食和一口蔬菜目标继续观察。请今晚反馈晚餐食量、饮水和入睡状态。",
      evidenceSourceId: "growth-defense-c-3-diet-followup",
      generatedMinute: 26,
    }),
    buildConsultation({
      profile: DEFENSE_CHILD_PROFILES["c-5"],
      today,
      riskLevel: "medium",
      triggerReason: "偶发咳嗽且健康材料待解析，需要园内观察和解析结果同步。",
      keyFindings: ["上午偶发咳嗽 2 次，无发热", "健康材料处于待解析状态", "需继续观察咳嗽频次和精神状态"],
      schoolAction: "继续观察咳嗽频次、体温和精神状态，健康材料解析后同步园长和家长。",
      homeAction: "今晚观察咳嗽频次，补充体温和睡眠情况。",
      followUp48h: ["健康材料解析完成后复核", "48 小时内核对是否仍有咳嗽"],
      parentMessageDraft: "沐辰今天有偶发咳嗽，无发热。健康材料还在解析中，请今晚观察咳嗽频次、体温和睡眠情况。",
      evidenceSourceId: "health-material-c-5",
      generatedMinute: 34,
    }),
  ];
}

function buildInterventionCards(consultations: ConsultationResult[]): InterventionCard[] {
  return consultations.map((consultation) => {
    const profile = DEFENSE_CHILD_PROFILES[consultation.childId as DefenseChildId];
    return {
      id: `card-defense-${consultation.childId}`,
      title: `${profile.name} 答辩跟进卡`,
      riskLevel: consultation.riskLevel,
      targetChildId: consultation.childId,
      triggerReason: consultation.triggerReason,
      summary: consultation.summary,
      todayInSchoolAction: consultation.schoolAction,
      tonightHomeAction: consultation.homeAction,
      homeSteps: consultation.tonightAtHomeActions,
      observationPoints: consultation.observationPoints,
      tomorrowObservationPoint: consultation.nextCheckpoints[0] ?? consultation.reviewIn48h,
      reviewIn48h: consultation.reviewIn48h,
      parentMessageDraft: consultation.parentMessageDraft,
      teacherFollowupDraft: `${profile.name} 明天继续围绕“${profile.educationTheme}”复查并补充记录。`,
      consultationMode: true,
      consultationId: consultation.consultationId,
      consultationSummary: consultation.summary,
      participants: consultation.participants.map((participant) => participant.label),
      shouldEscalateToAdmin: consultation.shouldEscalateToAdmin,
      source: "fallback",
      model: "defense-fixture",
      createdAt: consultation.generatedAt,
      updatedAt: consultation.generatedAt,
    };
  });
}

function buildDefenseTasks(today: string): SnapshotTask[] {
  const rows: SnapshotTask[] = [
    {
      taskId: "task-defense-c-1-tonight-bravery",
      taskType: "intervention",
      childId: "c-1",
      sourceType: "intervention_card",
      sourceId: "card-defense-c-1",
      ownerRole: "parent",
      title: "林小雨今晚勇敢小步尝试",
      description: "共读《林小雨的一小步勇敢》，说出“我害怕”，完成一次走到门口的小步尝试。",
      dueWindow: { kind: "same_day", label: "今晚行动" },
      dueAt: at(today, 21, 0),
      status: "in_progress",
      evidenceSubmissionMode: "guardian_feedback",
      createdAt: at(today, 16, 15),
      updatedAt: at(today, 16, 15),
      legacyRefs: { interventionCardId: "card-defense-c-1", consultationId: "consultation-defense-c-1" },
      assignedTeacherId: DEFENSE_CLASS.teacherId,
      assignedTeacherName: DEFENSE_CLASS.teacherName,
      createdBy: DEFENSE_CLASS.teacherId,
    },
    {
      taskId: "task-defense-c-2-review-48h",
      taskType: "follow_up",
      childId: "c-2",
      sourceType: "consultation",
      sourceId: "consultation-defense-c-2",
      ownerRole: "teacher",
      title: "高远舟 48 小时复查",
      description: "复查午睡焦虑、主动饮水、离园前精神状态，并提醒家长回复家庭观察。",
      dueWindow: { kind: "within_48h", label: "48 小时复查" },
      dueAt: at(shiftDate(today, 2), 16, 30),
      status: "in_progress",
      evidenceSubmissionMode: "task_checkin",
      createdAt: at(today, 16, 25),
      updatedAt: at(today, 16, 25),
      legacyRefs: { consultationId: "consultation-defense-c-2" },
      assignedTeacherId: DEFENSE_CLASS.teacherId,
      assignedTeacherName: DEFENSE_CLASS.teacherName,
      riskItemId: "risk-defense-c-2",
      createdBy: DEFENSE_DIRECTOR_ID,
    },
    {
      taskId: "task-defense-c-3-growth-record",
      taskType: "follow_up",
      childId: "c-3",
      sourceType: "admin_dispatch",
      sourceId: "dispatch-defense-c-3-growth-record",
      ownerRole: "teacher",
      title: "陈安安补充饮食成长记录",
      description: "围绕午餐进食偏少补一条成长记录，并同步今晚家庭饮食反馈。",
      dueWindow: { kind: "deadline", label: "明日午餐前" },
      dueAt: at(shiftDate(today, 1), 11, 0),
      status: "pending",
      evidenceSubmissionMode: "task_checkin",
      createdAt: at(today, 15, 30),
      updatedAt: at(today, 15, 30),
      legacyRefs: { consultationId: "consultation-defense-c-3" },
      assignedTeacherId: DEFENSE_CLASS.teacherId,
      assignedTeacherName: DEFENSE_CLASS.teacherName,
      riskItemId: "risk-defense-c-3",
      createdBy: DEFENSE_DIRECTOR_ID,
    },
    {
      taskId: "task-defense-c-5-health-parse",
      taskType: "follow_up",
      childId: "c-5",
      sourceType: "admin_dispatch",
      sourceId: "dispatch-defense-c-5-health-parse",
      ownerRole: "teacher",
      title: "王沐辰健康材料解析跟进",
      description: "健康材料待解析期间继续观察咳嗽频次，解析完成后同步园长和家长。",
      dueWindow: { kind: "within_48h", label: "健康材料复核" },
      dueAt: at(shiftDate(today, 2), 10, 0),
      status: "pending",
      evidenceSubmissionMode: "dispatch_status_update",
      createdAt: at(today, 10, 5),
      updatedAt: at(today, 10, 5),
      legacyRefs: { consultationId: "consultation-defense-c-5" },
      assignedTeacherId: DEFENSE_CLASS.teacherId,
      assignedTeacherName: DEFENSE_CLASS.teacherName,
      riskItemId: "risk-defense-c-5",
      createdBy: DEFENSE_DIRECTOR_ID,
    },
    {
      taskId: "task-defense-c-6-positive-growth",
      taskType: "intervention",
      childId: "c-6",
      sourceType: "legacy_weekly_task",
      sourceId: "positive-growth-defense-c-6",
      ownerRole: "teacher",
      title: "刘予安正向成长记录",
      description: "将主动分享玩具整理成正向成长记录，供家长端生成成长故事。",
      dueWindow: { kind: "same_day", label: "今日内完成" },
      dueAt: at(today, 17, 30),
      status: "completed",
      evidenceSubmissionMode: "task_checkin",
      completionSummary: "已记录主动分享玩具，并生成可用于家长端的正向成长素材。",
      createdAt: at(today, 15, 40),
      updatedAt: at(today, 16, 20),
      completedAt: at(today, 16, 20),
      assignedTeacherId: DEFENSE_CLASS.teacherId,
      assignedTeacherName: DEFENSE_CLASS.teacherName,
      createdBy: DEFENSE_CLASS.teacherId,
    },
  ];
  return rows;
}

function buildDefenseReminders(today: string): DemoSeedSnapshot["reminders"] {
  return [
    {
      reminderId: "reminder-defense-c-1-tonight-action",
      reminderType: "family-task",
      targetRole: "parent",
      targetId: DEFENSE_PARENT_ID,
      childId: "c-1",
      title: "林小雨今晚勇敢小步尝试",
      description: "共读绘本，说出“我害怕”，完成一次走到门口的小步尝试，并在反馈入口提交结果。",
      scheduledAt: at(today, 19, 30),
      status: "acknowledged",
      sourceId: "task-defense-c-1-tonight-bravery",
      taskId: "task-defense-c-1-tonight-bravery",
      sourceType: "intervention_card",
      relatedTaskIds: ["task-defense-c-1-tonight-bravery"],
    },
    {
      reminderId: "reminder-defense-c-2-48h-review",
      reminderType: "review-48h",
      targetRole: "teacher",
      targetId: DEFENSE_CLASS.teacherId,
      childId: "c-2",
      title: "高远舟离园前复查",
      description: "复查午睡焦虑、饮水量和精神状态，并提醒家长回复家庭观察。",
      scheduledAt: at(today, 16, 20),
      status: "pending",
      sourceId: "consultation-defense-c-2",
      taskId: "task-defense-c-2-review-48h",
      sourceType: "consultation",
      relatedTaskIds: ["task-defense-c-2-review-48h"],
    },
    {
      reminderId: "reminder-defense-c-3-growth-record",
      reminderType: "admin-focus",
      targetRole: "teacher",
      targetId: DEFENSE_CLASS.teacherId,
      childId: "c-3",
      title: "陈安安补成长记录",
      description: "围绕午餐进食偏少补一条饮食观察成长记录，并同步家长反馈。",
      scheduledAt: at(shiftDate(today, 1), 9, 0),
      status: "pending",
      sourceId: "dispatch-defense-c-3-growth-record",
      taskId: "task-defense-c-3-growth-record",
      sourceType: "admin_dispatch",
      relatedTaskIds: ["task-defense-c-3-growth-record"],
    },
    {
      reminderId: "reminder-defense-c-5-health-parse",
      reminderType: "admin-focus",
      targetRole: "teacher",
      targetId: DEFENSE_CLASS.teacherId,
      childId: "c-5",
      title: "王沐辰健康材料待解析",
      description: "健康材料解析完成前继续观察咳嗽频次和体温。",
      scheduledAt: at(today, 15, 0),
      status: "pending",
      sourceId: "dispatch-defense-c-5-health-parse",
      taskId: "task-defense-c-5-health-parse",
      sourceType: "admin_dispatch",
      relatedTaskIds: ["task-defense-c-5-health-parse"],
    },
  ];
}

function buildFeedbackRecord(params: {
  profile: DefenseChildProfile;
  today: string;
  relatedTaskId?: string;
  relatedConsultationId?: string;
  executionStatus: GuardianFeedback["executionStatus"];
  childReaction: GuardianFeedback["childReaction"];
  improvementStatus: GuardianFeedback["improvementStatus"];
  notes: string;
  status: string;
  content: string;
}): GuardianFeedback {
  const mediaRef = growthMediaRef(params.profile.childId, "defense-feedback");
  const mediaIsGpt = isGptImage2Path(mediaRef);
  const submittedAt = at(params.today, 20, params.profile.childId === "c-1" ? 15 : 25);
  const feedbackId = `feedback-defense-${params.profile.childId}`;

  return {
    feedbackId,
    childId: params.profile.childId,
    sourceRole: "parent",
    sourceChannel: "defense-demo",
    relatedTaskId: params.relatedTaskId,
    relatedConsultationId: params.relatedConsultationId,
    executionStatus: params.executionStatus,
    executionCount: 1,
    executorRole: "parent",
    childReaction: params.childReaction,
    improvementStatus: params.improvementStatus,
    barriers: [],
    notes: params.notes,
    attachments: {
      image: [
        {
          url: mediaRef,
          name: mediaIsGpt ? "defense-feedback.webp" : "defense-feedback.svg",
          mimeType: mediaIsGpt ? "image/webp" : "image/svg+xml",
        },
      ],
    },
    submittedAt,
    source: {
      kind: "structured",
      workflow: "defense-demo-feedback",
      createdBy: params.profile.guardianName,
      createdByRole: "家长",
    },
    fallback: { notesSummary: "Defense fixture structured feedback." },
    id: feedbackId,
    date: submittedAt.slice(0, 10),
    status: params.status,
    content: params.content,
    interventionCardId: `card-defense-${params.profile.childId}`,
    sourceWorkflow: "parent-agent",
    executed: params.executionStatus === "completed",
    improved: params.improvementStatus === "clear_improvement" || params.improvementStatus === "slight_improvement",
    freeNote: params.notes,
    createdBy: params.profile.guardianName,
    createdByRole: "家长",
  };
}

function patchFeedback(feedback: DemoSeedSnapshot["feedback"], today: string): DemoSeedSnapshot["feedback"] {
  const additions: GuardianFeedback[] = [
    buildFeedbackRecord({
      profile: DEFENSE_CHILD_PROFILES["c-1"],
      today,
      relatedTaskId: "task-defense-c-1-tonight-bravery",
      relatedConsultationId: "consultation-defense-c-1",
      executionStatus: "completed",
      childReaction: "improved",
      improvementStatus: "clear_improvement",
      notes: "孩子能复述故事，并愿意尝试走到门口。",
      status: "resolved",
      content: "家庭反馈：孩子能复述故事，并愿意尝试走到门口。",
    }),
    buildFeedbackRecord({
      profile: DEFENSE_CHILD_PROFILES["c-3"],
      today,
      relatedTaskId: "task-defense-c-3-growth-record",
      relatedConsultationId: "consultation-defense-c-3",
      executionStatus: "partial",
      childReaction: "neutral",
      improvementStatus: "slight_improvement",
      notes: "晚餐吃了半碗米饭，愿意尝试一口青菜，饮水约 150ml。",
      status: "in-progress",
      content: "陈安安家庭饮食同步：晚餐食量略有改善，明天继续观察。",
    }),
    buildFeedbackRecord({
      profile: DEFENSE_CHILD_PROFILES["c-4"],
      today,
      executionStatus: "completed",
      childReaction: "accepted",
      improvementStatus: "clear_improvement",
      notes: "赵一诺今晚情绪稳定，能主动讲述白天活动。",
      status: "resolved",
      content: "正常对照反馈：情绪稳定，作息正常。",
    }),
    buildFeedbackRecord({
      profile: DEFENSE_CHILD_PROFILES["c-6"],
      today,
      relatedTaskId: "task-defense-c-6-positive-growth",
      executionStatus: "completed",
      childReaction: "accepted",
      improvementStatus: "clear_improvement",
      notes: "孩子能复述自己分享玩具的经历，并说同伴很开心。",
      status: "resolved",
      content: "刘予安正向反馈：愿意讲述分享玩具的经历。",
    }),
  ];

  const defenseChildIds = new Set(Object.keys(DEFENSE_CHILD_PROFILES));
  return upsertByKey(
    feedback.filter((item) => !defenseChildIds.has(item.childId)),
    additions,
    (item) => item.feedbackId
  );
}

function buildConversation(params: {
  profile: DefenseChildProfile;
  today: string;
  messages: Array<{
    id: string;
    senderRole: "parent" | "teacher";
    senderId: string;
    senderName: string;
    receiverRole: "parent" | "teacher";
    content: string;
    minute: number;
    readBy: string[];
  }>;
}) {
  const conversationId = `conv-${params.profile.childId}-defense`;
  const createdAt = at(params.today, 8, params.messages[0]?.minute ?? 0);
  const updatedAt = at(params.today, 18, params.messages.at(-1)?.minute ?? 0);
  return {
    conversation: {
      conversationId,
      childId: params.profile.childId,
      classId: DEFENSE_CLASS.classId,
      participantIds: [
        params.profile.childId === "c-1" || params.profile.childId === "c-4"
          ? DEFENSE_PARENT_ID
          : `demo-parent-${params.profile.childId.replace("c-", "").padStart(2, "0")}`,
        DEFENSE_CLASS.teacherId,
        DEFENSE_DIRECTOR_ID,
      ],
      participantRoles: ["parent", "teacher", "director"] as Array<"parent" | "teacher" | "director">,
      status: "open" as const,
      createdAt,
      updatedAt,
    },
    messages: params.messages.map((message) => ({
      messageId: message.id,
      conversationId,
      childId: params.profile.childId,
      classId: DEFENSE_CLASS.classId,
      senderRole: message.senderRole,
      senderId: message.senderId,
      senderName: message.senderName,
      receiverRole: message.receiverRole,
      targetRole: message.receiverRole,
      content: message.content,
      createdAt: at(params.today, 18, message.minute),
      readBy: message.readBy,
      status: "sent" as const,
    })),
  };
}

function patchMessagesAndConversations(
  messages: DemoSeedSnapshot["messages"],
  conversations: DemoSeedSnapshot["conversations"],
  childMap: Map<string, SnapshotChild>,
  today: string
) {
  const customChildIds = new Set<string>(CHILD_IDS_WITH_CUSTOM_CONVERSATIONS);
  const baseMessages = messages
    .filter((message) => !customChildIds.has(message.childId))
    .map((message) => {
      const child = childMap.get(message.childId);
      return child ? { ...message, classId: child.classId ?? message.classId } : message;
    });
  const baseConversations = conversations
    .filter((conversation) => !customChildIds.has(conversation.childId))
    .map((conversation) => {
      const child = childMap.get(conversation.childId);
      return child ? { ...conversation, classId: child.classId ?? conversation.classId } : conversation;
    });

  const c1 = buildConversation({
    profile: DEFENSE_CHILD_PROFILES["c-1"],
    today,
    messages: [
      {
        id: "msg-defense-c-1-teacher-action",
        senderRole: "teacher",
        senderId: DEFENSE_CLASS.teacherId,
        senderName: DEFENSE_CLASS.teacherName,
        receiverRole: "parent",
        content: "小雨今天在走廊活动里有一点害怕，但能说出“我害怕”，也愿意牵手走一步。今晚请共读绘本并做一次小步尝试。",
        minute: 5,
        readBy: [DEFENSE_PARENT_ID],
      },
      {
        id: "msg-defense-c-1-parent-feedback",
        senderRole: "parent",
        senderId: DEFENSE_PARENT_ID,
        senderName: DEFENSE_PARENT_NAME,
        receiverRole: "teacher",
        content: "我们今晚读完绘本了，孩子能复述故事，并愿意尝试走到门口。",
        minute: 45,
        readBy: [DEFENSE_CLASS.teacherId],
      },
    ],
  });

  const c2ParentId = "demo-parent-02";
  const c2 = buildConversation({
    profile: DEFENSE_CHILD_PROFILES["c-2"],
    today,
    messages: [
      {
        id: "msg-defense-c-2-teacher-pending",
        senderRole: "teacher",
        senderId: DEFENSE_CLASS.teacherId,
        senderName: DEFENSE_CLASS.teacherName,
        receiverRole: "parent",
        content: "远舟今天午睡前有焦虑，主动饮水偏少。请今晚记录入睡时间、饮水量和情绪变化，明早反馈给我。",
        minute: 12,
        readBy: [],
      },
    ],
  });
  c2.conversation.participantIds[0] = c2ParentId;

  const c3ParentId = "demo-parent-03";
  const c3 = buildConversation({
    profile: DEFENSE_CHILD_PROFILES["c-3"],
    today,
    messages: [
      {
        id: "msg-defense-c-3-teacher-diet",
        senderRole: "teacher",
        senderId: DEFENSE_CLASS.teacherId,
        senderName: DEFENSE_CLASS.teacherName,
        receiverRole: "parent",
        content: "安安今天午餐吃得偏少，我已经补了一条饮食观察成长记录。请今晚同步晚餐食量、饮水和入睡状态。",
        minute: 20,
        readBy: [c3ParentId],
      },
      {
        id: "msg-defense-c-3-parent-diet",
        senderRole: "parent",
        senderId: c3ParentId,
        senderName: "陈安安妈妈",
        receiverRole: "teacher",
        content: "收到，今晚我们会记录晚餐食量和饮水，明早反馈。",
        minute: 50,
        readBy: [DEFENSE_CLASS.teacherId],
      },
    ],
  });
  c3.conversation.participantIds[0] = c3ParentId;

  const c5ParentId = "demo-parent-05";
  const c5 = buildConversation({
    profile: DEFENSE_CHILD_PROFILES["c-5"],
    today,
    messages: [
      {
        id: "msg-defense-c-5-parent-cough",
        senderRole: "parent",
        senderId: c5ParentId,
        senderName: "王沐辰妈妈",
        receiverRole: "teacher",
        content: "沐辰昨晚偶尔咳嗽，我已经上传健康材料，请老师帮忙留意。",
        minute: 8,
        readBy: [DEFENSE_CLASS.teacherId],
      },
      {
        id: "msg-defense-c-5-teacher-parse",
        senderRole: "teacher",
        senderId: DEFENSE_CLASS.teacherId,
        senderName: DEFENSE_CLASS.teacherName,
        receiverRole: "parent",
        content: "收到，目前健康材料还在解析中，今天会继续观察咳嗽频次、体温和精神状态。",
        minute: 28,
        readBy: [c5ParentId],
      },
    ],
  });
  c5.conversation.participantIds[0] = c5ParentId;

  return {
    messages: [...baseMessages, ...c1.messages, ...c2.messages, ...c3.messages, ...c5.messages],
    conversations: [...baseConversations, c1.conversation, c2.conversation, c3.conversation, c5.conversation],
  };
}

function patchTasks(tasks: DemoSeedSnapshot["tasks"], childMap: Map<string, SnapshotChild>, today: string): DemoSeedSnapshot["tasks"] {
  const synced = tasks.map((task) => {
    const child = childMap.get(task.childId);
    if (!child) return task;
    const extended = task as SnapshotTask;
    return {
      ...extended,
      assignedTeacherId: child.teacherId,
      assignedTeacherName: teacherNameFor(child.teacherId),
    };
  });
  return upsertByKey(synced, buildDefenseTasks(today), (task) => task.taskId);
}

function patchReminders(
  reminders: DemoSeedSnapshot["reminders"],
  childMap: Map<string, SnapshotChild>,
  today: string
): DemoSeedSnapshot["reminders"] {
  const synced = reminders.map((reminder) => {
    const child = reminder.childId ? childMap.get(reminder.childId) : null;
    if (!child || reminder.targetRole !== "teacher") return reminder;
    return {
      ...reminder,
      targetId: child.teacherId ?? reminder.targetId,
    };
  });
  return upsertByKey(synced, buildDefenseReminders(today), (reminder) => reminder.reminderId);
}

function patchTaskCheckIns(
  taskCheckIns: DemoSeedSnapshot["taskCheckIns"],
  tasks: DemoSeedSnapshot["tasks"],
  today: string
): DemoSeedSnapshot["taskCheckIns"] {
  const completedDefenseTasks = tasks.filter((task) => task.taskId.startsWith("task-defense-") && task.status === "completed");
  const additions: DemoSeedSnapshot["taskCheckIns"] = completedDefenseTasks.map((task) => ({
    id: `checkin-${task.taskId}`,
    childId: task.childId,
    taskId: task.taskId,
    date: task.completedAt?.slice(0, 10) ?? today,
  }));
  return upsertByKey(taskCheckIns, additions, (checkIn) => checkIn.id);
}

function buildDefenseWeeklyReport(
  snapshot: DemoSeedSnapshot,
  today: string,
  childMap: Map<string, SnapshotChild>
): ApiWeeklyReport {
  const classChildren = snapshot.children.filter((child) => child.classId === DEFENSE_CLASS.classId);
  const periodEnd = today;
  const periodStart = shiftDate(today, -6);
  const sourceRecordIds = [
    "growth-defense-c-1-bravery",
    "growth-defense-c-2-nap-hydration",
    "growth-defense-c-3-diet-followup",
    "growth-defense-c-6-sharing",
    "health-c-2-" + today,
    "health-material-c-5",
    "feedback-defense-c-1",
  ];
  const visibleNames = ["c-1", "c-2", "c-3", "c-5", "c-6"]
    .map((childId) => childMap.get(childId)?.name)
    .filter(Boolean)
    .join("、");

  return {
    reportId: "weekly-report-defense-morning",
    title: "晨曦班答辩周报快照",
    scopeType: "class",
    scopeId: DEFENSE_CLASS.classId,
    institutionId: DEFENSE_INSTITUTION_ID,
    periodStart,
    periodEnd,
    status: "generated",
    payload: {
      summary: {
        className: DEFENSE_CLASS.className,
        teacherName: DEFENSE_CLASS.teacherName,
        childCount: classChildren.length,
        presentTodayCount: classChildren.length,
        riskFocusCount: 4,
        positiveGrowthCount: 1,
      },
      defenseScenario: {
        focusChildren: visibleNames,
        weeklySummary:
          "晨曦班本周答辩重点覆盖林小雨勇敢表达、高远舟 48 小时复查、陈安安饮食观察、王沐辰健康材料待解析，并保留刘予安正向成长亮点。",
        familyAction: DEFENSE_CHILD_PROFILES["c-1"].homeAction,
        parentFeedback: DEFENSE_CHILD_PROFILES["c-1"].expectedFeedback,
      },
      risks: [
        "高远舟午睡焦虑与饮水偏少需要 48 小时复查",
        "林小雨走廊活动退缩需要小步尝试",
        "陈安安午餐进食偏少需要家园同步",
        "王沐辰健康材料待解析",
      ],
      highlights: ["刘予安主动分享玩具", "赵一诺情绪稳定可作为正常对照", "林小雨家庭反馈已形成闭环"],
      sourceRecordIds,
      demoNotice: "Defense scenario fixture weekly report snapshot.",
    },
    sourceRecordIds,
    createdBy: DEFENSE_DIRECTOR_ID,
    generatedBy: "defense-fixture",
    createdAt: at(today, 18, 0),
    updatedAt: at(today, 18, 0),
    share: {
      shareId: "share-weekly-report-defense-morning",
      sharedBy: DEFENSE_DIRECTOR_ID,
      sharedAt: at(today, 18, 15),
      summary: "晨曦班答辩周报快照",
      localText: "晨曦班答辩周报：风险、家庭行动、反馈和正向成长记录均已预置。",
    },
  };
}

function patchWeeklyReports(snapshot: DemoSeedSnapshot, today: string, childMap: Map<string, SnapshotChild>) {
  const report = buildDefenseWeeklyReport(snapshot, today, childMap);
  const existingReports = snapshot.weeklyReports.map((weeklyReport, index) =>
    index === 0
      ? {
          ...weeklyReport,
          payload: {
            ...weeklyReport.payload,
            defenseScenario: {
              className: DEFENSE_CLASS.className,
              teacherName: DEFENSE_CLASS.teacherName,
              focusChildren: ["林小雨", "高远舟", "陈安安", "王沐辰", "刘予安"],
              weeklySummary: "答辩 fixture 已补足晨曦班周总结所需数据。",
            },
          },
        }
      : weeklyReport
  );
  return upsertByKey(existingReports, [report], (weeklyReport) => weeklyReport.reportId);
}

function patchAuditLogs(snapshot: DemoSeedSnapshot, today: string): DemoSeedSnapshot["auditLogs"] {
  return upsertByKey(
    snapshot.auditLogs,
    [
      {
        auditId: "audit-defense-fixture-applied",
        actorUserId: DEFENSE_DIRECTOR_ID,
        actorRole: "机构管理员",
        institutionId: DEFENSE_INSTITUTION_ID,
        targetType: "demo-seed",
        targetId: "defense-scenario",
        action: "apply-defense-fixture",
        result: "success",
        metadata: {
          className: DEFENSE_CLASS.className,
          teacherName: DEFENSE_CLASS.teacherName,
          childIds: Object.keys(DEFENSE_CHILD_PROFILES),
          noDemoResetMode: true,
        },
        createdAt: at(today, 8, 5),
      },
    ],
    (auditLog) => auditLog.auditId
  );
}

export function applyDefenseFixture(snapshot: DemoSeedSnapshot, now = new Date().toISOString()): DemoSeedSnapshot {
  const today = toDateKey(now);
  const children = updateChildren(snapshot.children);
  const childMap = new Map(children.map((child) => [child.id, child] as const));
  const consultations = upsertByKey(
    snapshot.consultations.filter(
      (consultation) => !CHILD_IDS_WITH_CUSTOM_CONSULTATIONS.includes(consultation.childId as never)
    ),
    buildConsultations(today),
    (consultation) => consultation.consultationId
  );
  const interventionCards = upsertByKey(
    snapshot.interventionCards.filter(
      (card) => !CHILD_IDS_WITH_CUSTOM_CONSULTATIONS.includes(card.targetChildId as never)
    ),
    buildInterventionCards(buildConsultations(today)),
    (card) => card.id
  );
  const tasks = patchTasks(snapshot.tasks, childMap, today);
  const { messages, conversations } = patchMessagesAndConversations(
    snapshot.messages,
    snapshot.conversations,
    childMap,
    today
  );

  const patched: DemoSeedSnapshot = {
    ...snapshot,
    children,
    attendance: snapshot.attendance.map((record) => syncChildScope(record, childMap)),
    health: patchHealthRecords(snapshot.health, childMap, today),
    meals: patchMealRecords(snapshot.meals, childMap, today),
    growth: patchGrowthRecords(snapshot.growth, childMap, today),
    feedback: patchFeedback(snapshot.feedback, today),
    healthMaterials: patchHealthMaterials(snapshot.healthMaterials, today),
    consultations,
    interventionCards,
    tasks,
    taskCheckIns: patchTaskCheckIns(snapshot.taskCheckIns, tasks, today),
    reminders: patchReminders(snapshot.reminders, childMap, today),
    messages,
    conversations,
    weeklyReports: snapshot.weeklyReports,
    updatedAt: at(today, 8, 5),
  };

  return {
    ...patched,
    weeklyReports: patchWeeklyReports(patched, today, childMap),
    auditLogs: patchAuditLogs(patched, today),
  };
}
