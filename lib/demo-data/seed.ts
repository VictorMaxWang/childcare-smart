import type { ApiAttachment, ApiAuditLog, ApiTeacher, ApiWeeklyReport } from "@/lib/api/types";
import type {
  ConsultationResult,
  HighRiskAgentView,
  ParentStoryBookResponse,
  ParentStoryBookScene,
} from "@/lib/ai/types";
import type { GuardianFeedback } from "@/lib/feedback/types";
import type { InterventionCard } from "@/lib/agent/intervention-card";
import type { AppStateSnapshot, DemoHealthMaterial } from "@/lib/persistence/snapshot";
import type { CanonicalTask } from "@/lib/tasks/types";

export type DemoSeedSnapshot = AppStateSnapshot & {
  teachers: ApiTeacher[];
  weeklyReports: ApiWeeklyReport[];
  attachments: ApiAttachment[];
  auditLogs: ApiAuditLog[];
};

type DemoClass = {
  classId: "class-sunrise" | "class-morning";
  className: "向阳班" | "晨曦班";
  teacherId: "u-teacher" | "u-teacher2";
  teacherName: "李老师" | "周老师";
};

type DemoChild = AppStateSnapshot["children"][number] & {
  classId: DemoClass["classId"];
  teacherId: DemoClass["teacherId"];
  parentId: string;
  enrollmentDate: string;
  status: "active";
};

type DemoTask = CanonicalTask & {
  assignedTeacherId: string;
  assignedTeacherName: string;
  feedbackId?: string;
  riskItemId?: string;
  createdBy: string;
};

const INSTITUTION_ID = "inst-1";
const DIRECTOR_ID = "u-admin";
const PARENT_ID = "u-parent";

const CLASSES: DemoClass[] = [
  {
    classId: "class-sunrise",
    className: "向阳班",
    teacherId: "u-teacher",
    teacherName: "李老师",
  },
  {
    classId: "class-morning",
    className: "晨曦班",
    teacherId: "u-teacher2",
    teacherName: "周老师",
  },
];

const DEMO_MEDIA = {
  meal: "/demo-media/meals/demo-meal-placeholder.svg",
  health: "/demo-media/health-materials/demo-health-material-placeholder.svg",
  growth: "/demo-media/growth/demo-growth-placeholder.svg",
  storybook: "/demo-media/storybooks/demo-storybook-placeholder.svg",
};

const CHILD_NAMES = [
  ["林小雨", "小雨", "女"],
  ["张晨曦", "晨晨", "男"],
  ["陈乐然", "乐乐", "女"],
  ["林小明", "小明", "男"],
  ["赵安安", "安安", "女"],
  ["吴一诺", "一诺", "男"],
  ["沈星禾", "星星", "女"],
  ["何知远", "远远", "男"],
  ["许沐晴", "沐沐", "女"],
  ["周言蹊", "言言", "男"],
  ["梁若溪", "溪溪", "女"],
  ["高予辰", "辰辰", "男"],
  ["宋语棠", "棠棠", "女"],
  ["唐嘉树", "嘉嘉", "男"],
  ["韩可心", "可可", "女"],
  ["丁沐阳", "阳阳", "男"],
  ["姜念初", "念念", "女"],
  ["马行舟", "舟舟", "男"],
  ["罗星澄", "澄澄", "男"],
  ["白清越", "越越", "女"],
  ["范小满", "满满", "男"],
  ["谢知夏", "夏夏", "女"],
  ["陆云起", "云云", "男"],
  ["姚书瑶", "瑶瑶", "女"],
  ["邱禾安", "禾禾", "男"],
  ["程鹿鸣", "鹿鹿", "女"],
  ["袁嘉禾", "禾苗", "男"],
  ["冯若宁", "宁宁", "女"],
  ["蒋小川", "川川", "男"],
  ["曹南星", "南南", "女"],
  ["彭一帆", "帆帆", "男"],
  ["薛知微", "微微", "女"],
  ["曾星野", "星野", "男"],
  ["孟舒然", "舒舒", "女"],
  ["任小麦", "麦麦", "男"],
  ["邵雨桐", "桐桐", "女"],
] as const;

const GROWTH_THEMES = [
  {
    category: "语言表达",
    title: "主动讲述",
    tags: ["语言", "表达", "倾听"],
    description: "在晨圈分享时能主动描述自己的发现，并等待同伴回应。",
  },
  {
    category: "社交互动",
    title: "合作搭建",
    tags: ["合作", "轮流", "协商"],
    description: "与同伴一起搭建轨道，遇到分歧时愿意用语言协商。",
  },
  {
    category: "独立进食",
    title: "自主整理",
    tags: ["自理", "餐后整理", "规则"],
    description: "餐后能把餐具放回指定区域，并提醒自己擦手。",
  },
  {
    category: "大动作",
    title: "平衡练习",
    tags: ["运动", "平衡", "勇气"],
    description: "户外平衡木练习中保持节奏，完成后会为自己鼓掌。",
  },
  {
    category: "情绪表现",
    title: "情绪命名",
    tags: ["情绪", "安抚", "表达"],
    description: "午睡前能说出自己有点想家，并接受老师陪伴过渡。",
  },
  {
    category: "精细动作",
    title: "手工创作",
    tags: ["手工", "专注", "精细动作"],
    description: "使用安全剪贴材料完成小花园作品，能持续专注较长时间。",
  },
] as const;

const MEALS = [
  {
    meal: "早餐",
    foods: [
      ["南瓜小米粥", "主食", "1 小碗"],
      ["蒸蛋羹", "蛋白", "半份"],
      ["温水", "饮品", "120ml"],
    ],
  },
  {
    meal: "午餐",
    foods: [
      ["软米饭", "主食", "1 份"],
      ["番茄牛肉末", "蛋白", "适量"],
      ["清炒时蔬", "蔬果", "适量"],
    ],
  },
  {
    meal: "加餐",
    foods: [
      ["苹果片", "蔬果", "半份"],
      ["原味酸奶", "奶制品", "半杯"],
      ["温水", "饮品", "100ml"],
    ],
  },
  {
    meal: "晚餐",
    foods: [
      ["山药瘦肉粥", "主食", "1 小碗"],
      ["胡萝卜丁", "蔬果", "少量"],
      ["温水", "饮品", "120ml"],
    ],
  },
] as const;

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

function ageText(birthDate: string, today: string) {
  const start = new Date(`${birthDate}T00:00:00.000Z`);
  const end = new Date(`${today}T00:00:00.000Z`);
  const months = Math.max(
    0,
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth()
  );
  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  return `${years}岁${restMonths}个月`;
}

function classForChild(index: number) {
  const childNumber = index + 1;
  if (childNumber === 3) return CLASSES[1];
  if (childNumber === 19) return CLASSES[0];
  return index < 18 ? CLASSES[0] : CLASSES[1];
}

function parentIdForChild(childId: string, index: number) {
  if (childId === "c-1" || childId === "c-4") return PARENT_ID;
  return `demo-parent-${String(index + 1).padStart(2, "0")}`;
}

function buildChildren(today: string): DemoChild[] {
  return CHILD_NAMES.map(([name, nickname, gender], index) => {
    const childNumber = index + 1;
    const childId = `c-${childNumber}`;
    const klass = classForChild(index);
    const birthYear = 2021 + (index % 4);
    const birthMonth = (index * 3) % 12 + 1;
    const birthDay = (index * 5) % 24 + 1;
    const birthDate = `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`;
    const parentId = parentIdForChild(childId, index);

    return {
      id: childId,
      displayName: name,
      name,
      nickname,
      birthDate,
      age: ageText(birthDate, today),
      gender: gender as DemoChild["gender"],
      allergies: index % 11 === 0 ? ["芒果"] : index % 13 === 0 ? ["牛奶"] : [],
      heightCm: 86 + (index % 12) * 2,
      weightKg: Number((11.2 + (index % 10) * 0.9).toFixed(1)),
      guardians: [
        {
          name: childId === "c-1" || childId === "c-4" ? "林妈妈" : `演示家长${String(childNumber).padStart(2, "0")}`,
          relation: "监护人",
          phone: `DEMO-PHONE-${String(childNumber).padStart(3, "0")}`,
        },
      ],
      institutionId: INSTITUTION_ID,
      className: klass.className,
      classId: klass.classId,
      teacherId: klass.teacherId,
      parentId,
      enrollmentDate: shiftDate(today, -120 - index),
      status: "active",
      specialNotes:
        index % 9 === 0
          ? "演示关注：午睡前需要更稳定的过渡陪伴。"
          : index % 7 === 0
            ? "演示关注：进餐时留意蔬菜接受度。"
            : "演示档案：日常作息稳定，持续记录成长亮点。",
      avatar: gender === "男" ? "👦" : "👧",
      parentUserId: parentId === PARENT_ID ? PARENT_ID : undefined,
    };
  });
}

function buildAttendance(children: DemoChild[], today: string): AppStateSnapshot["attendance"] {
  return children.flatMap((child, childIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = shiftDate(today, -dayIndex);
      return {
        id: `att-${child.id}-${date}`,
        childId: child.id,
        date,
        isPresent: true,
        classId: child.classId,
        teacherId: child.teacherId,
        parentId: child.parentId,
        checkInAt: at(date, 8, 5 + (childIndex % 18)),
        checkOutAt: at(date, 17, 5 + (childIndex % 10)),
      };
    })
  );
}

function buildHealth(children: DemoChild[], today: string): AppStateSnapshot["health"] {
  return children.flatMap((child, childIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = shiftDate(today, -dayIndex);
      const isAbnormal = (childIndex + dayIndex) % 17 === 0 || (childIndex % 13 === 0 && dayIndex === 1);
      return {
        id: `health-${child.id}-${date}`,
        childId: child.id,
        date,
        temperature: Number((36.3 + ((childIndex + dayIndex) % 8) * 0.1 + (isAbnormal ? 0.8 : 0)).toFixed(1)),
        mood: isAbnormal ? "稍显疲惫" : dayIndex % 2 === 0 ? "愉快" : "平稳",
        handMouthEye: isAbnormal ? "异常" : "正常",
        isAbnormal,
        classId: child.classId,
        teacherId: child.teacherId,
        parentId: child.parentId,
        remark: isAbnormal
          ? "演示轻微异常：已提醒补水并持续观察。"
          : "晨检状态正常，精神和入园情绪稳定。",
        checkedBy: child.teacherId === "u-teacher" ? "李老师" : "周老师",
        checkedByRole: "教师",
      } satisfies AppStateSnapshot["health"][number];
    })
  );
}

function buildMeals(children: DemoChild[], today: string): AppStateSnapshot["meals"] {
  return children.flatMap((child, childIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = shiftDate(today, -dayIndex);
      return MEALS.map((mealTemplate, mealIndex) => {
        const lowIntake = (childIndex + dayIndex + mealIndex) % 19 === 0;
        const allergyRisk = child.allergies.length > 0 && mealIndex === 2 && dayIndex === 0;
        return {
          id: `meal-${child.id}-${date}-${mealIndex + 1}`,
          childId: child.id,
          date,
          meal: mealTemplate.meal,
          foods: mealTemplate.foods.map(([name, category, amount], foodIndex) => ({
            id: `food-${child.id}-${date}-${mealIndex + 1}-${foodIndex + 1}`,
            name,
            category,
            amount,
          })),
          photoUrls: [DEMO_MEDIA.meal],
          mediaRefs: [DEMO_MEDIA.meal],
          classId: child.classId,
          teacherId: child.teacherId,
          parentId: child.parentId,
          intakeLevel: lowIntake ? "少量" : (mealIndex + childIndex) % 5 === 0 ? "适中" : "充足",
          preference: lowIntake ? "拒食" : (childIndex + mealIndex) % 7 === 0 ? "偏好" : "正常",
          allergyReaction: allergyRisk ? "已避开过敏风险食材，未见异常反应。" : undefined,
          waterMl: 90 + mealIndex * 30 + (childIndex % 4) * 10,
          nutritionScore: lowIntake ? 78 : 86 + ((childIndex + mealIndex) % 10),
          recordedBy: child.teacherId === "u-teacher" ? "李老师" : "周老师",
          recordedByRole: "教师",
        } satisfies AppStateSnapshot["meals"][number];
      });
    }).flat()
  );
}

function buildGrowth(children: DemoChild[], today: string): AppStateSnapshot["growth"] {
  return children.flatMap((child, childIndex) =>
    GROWTH_THEMES.map((theme, themeIndex) => {
      const date = shiftDate(today, -(themeIndex + (childIndex % 3)));
      const recordId = `growth-${child.id}-${themeIndex + 1}`;
      return {
        id: recordId,
        childId: child.id,
        createdAt: at(date, 10 + (themeIndex % 5), 12 + (childIndex % 12)),
        recorder: child.teacherId === "u-teacher" ? "李老师" : "周老师",
        recorderRole: "教师",
        category: theme.category,
        tags: [...theme.tags],
        selectedIndicators: [theme.title],
        description: `${child.nickname ?? child.name}${theme.description}`,
        needsAttention: (childIndex + themeIndex) % 11 === 0,
        followUpAction:
          (childIndex + themeIndex) % 11 === 0
            ? "后续 48 小时继续观察同类场景，并与家长同步轻量配合动作。"
            : undefined,
        reviewDate: shiftDate(date, 2),
        reviewStatus: (childIndex + themeIndex) % 11 === 0 ? "待复查" : "已完成",
        mediaUrls: [DEMO_MEDIA.growth],
        mediaRefs: [DEMO_MEDIA.growth],
        classId: child.classId,
        teacherId: child.teacherId,
        parentId: child.parentId,
      } satisfies AppStateSnapshot["growth"][number];
    })
  );
}

function buildHealthMaterials(children: DemoChild[], today: string): DemoHealthMaterial[] {
  return children.map((child, index) => {
    const createdAt = at(shiftDate(today, -(index % 10)), 14, 20);
    return {
      materialId: `health-material-${child.id}`,
      childId: child.id,
      uploadedBy: child.teacherId,
      filename: `DEMO-${child.id}-health-note.svg`,
      fileType: "image/svg+xml",
      parseStatus: "completed",
      description: "虚构演示健康材料，图片仅使用本地占位和 DEMO 标识。",
      parseResult: {
        type: "健康材料",
        title: `${child.name} 演示健康观察单`,
        status: index % 8 === 0 ? "需复核" : "已归档",
        providerProvenance: {
          source: "demo-seed",
          liveProvider: false,
          demoOnly: true,
        },
        mediaRefs: [DEMO_MEDIA.health],
        summary: index % 8 === 0 ? "近期晨检有轻微波动，建议连续观察。" : "基础健康状态稳定，持续常规观察。",
        suggestions: ["保持晨检记录连续", "必要时同步家长补充居家观察"],
        demoLabel: "DEMO / 示例",
      },
      createdAt,
      updatedAt: createdAt,
    };
  });
}

function blankAgentView(role: HighRiskAgentView["role"], title: string, summary: string): HighRiskAgentView {
  return {
    role,
    title,
    summary,
    signals: [summary],
    actions: ["记录关键场景", "同步家园反馈"],
    observationPoints: ["精神状态", "进食饮水", "情绪过渡"],
    evidence: ["晨检记录", "饮食记录", "成长记录"],
  };
}

function buildConsultations(children: DemoChild[], today: string): ConsultationResult[] {
  return children
    .filter((_, index) => index % 6 === 0)
    .map((child, index) => {
      const generatedAt = at(shiftDate(today, -index - 1), 16, 10);
      const summary = `${child.name} 演示高风险会诊：晨检轻微异常叠加进食波动，需要 48 小时家园协同观察。`;
      return {
        consultationId: `consultation-${child.id}`,
        triggerReason: summary,
        triggerType: ["multi-risk"],
        triggerReasons: [summary],
        participants: [
          { id: "health-agent", label: "健康观察 Agent" },
          { id: "diet-agent", label: "饮食行为 Agent" },
          { id: "coparenting-agent", label: "家园沟通 Agent" },
          { id: "coordinator", label: "会诊协调 Agent" },
        ],
        childId: child.id,
        riskLevel: index % 2 === 0 ? "high" : "medium",
        agentFindings: [
          {
            agentId: "health-agent",
            title: "晨检波动",
            riskExplanation: "体温和精神状态存在轻微波动。",
            signals: ["晨检异常标记"],
            actions: ["继续补水观察"],
            observationPoints: ["午睡前后精神状态"],
            evidence: [`health-${child.id}-${today}`],
          },
        ],
        summary,
        keyFindings: ["晨检轻微异常", "饮水量需观察", "需要家园闭环"],
        healthAgentView: blankAgentView("HealthObservationAgent", "健康观察", "晨检出现轻微波动。"),
        dietBehaviorAgentView: blankAgentView("DietBehaviorAgent", "饮食行为", "部分餐次进食量偏少。"),
        parentCommunicationAgentView: blankAgentView("ParentCommunicationAgent", "家园沟通", "建议家长今晚补充居家状态。"),
        inSchoolActionAgentView: blankAgentView("InSchoolActionAgent", "园内行动", "教师继续记录 48 小时观察点。"),
        todayInSchoolActions: ["午睡前后复测体温", "记录饮水和情绪过渡"],
        tonightAtHomeActions: ["晚间观察精神状态和入睡情况", "家长反馈是否有咳嗽或食欲变化"],
        followUp48h: ["48 小时后由主班老师复盘风险是否解除"],
        parentMessageDraft: `${child.name} 今天有轻微波动，请今晚留意精神状态和入睡情况，明早反馈给老师。`,
        directorDecisionCard: {
          title: `${child.name} 48 小时观察派单`,
          reason: summary,
          recommendedOwnerRole: "teacher",
          recommendedOwnerName: child.teacherId === "u-teacher" ? "李老师" : "周老师",
          recommendedAt: generatedAt,
          status: "pending",
        },
        explainability: [{ label: "数据来源", detail: "由晨检、饮食、成长记录演示聚合。" }],
        evidenceItems: [
          {
            id: `evidence-${child.id}-health`,
            sourceType: "health_check",
            sourceLabel: "晨检记录",
            sourceId: `health-${child.id}-${today}`,
            summary: "晨检轻微异常",
            confidence: "medium",
            requiresHumanReview: false,
            evidenceCategory: "risk_control",
            supports: [{ type: "finding", targetId: "health", targetLabel: "晨检波动" }],
            timestamp: generatedAt,
          },
        ],
        nextCheckpoints: ["午睡后精神状态", "晚间居家反馈", "次日晨检"],
        coordinatorSummary: {
          finalConclusion: summary,
          riskLevel: index % 2 === 0 ? "high" : "medium",
          problemDefinition: "演示风险来自轻微异常叠加，非真实诊断。",
          schoolAction: "园内连续观察 48 小时。",
          homeAction: "家庭侧补充晚间反馈。",
          observationPoints: ["体温", "精神状态", "进食"],
          reviewIn48h: "48 小时后复盘。",
          shouldEscalateToAdmin: index % 2 === 0,
        },
        schoolAction: "园内连续观察 48 小时。",
        homeAction: "家庭侧补充晚间反馈。",
        observationPoints: ["体温", "精神状态", "进食"],
        reviewIn48h: "48 小时后复盘。",
        shouldEscalateToAdmin: index % 2 === 0,
        source: "rule",
        fallback: true,
        generatedAt,
        status: "active",
        workflowStatus: "pending",
        notes: [{ note: "D-SEED 演示会诊预置", createdAt: generatedAt, createdBy: DIRECTOR_ID }],
        createdBy: DIRECTOR_ID,
        updatedAt: generatedAt,
      } as ConsultationResult;
    });
}

function buildInterventionCards(children: DemoChild[], consultations: ConsultationResult[], today: string): InterventionCard[] {
  return consultations.map((consultation) => {
    const child = children.find((item) => item.id === consultation.childId);
    const childName = child?.name ?? consultation.childId;
    return {
      id: `card-${consultation.childId}-dseed`,
      title: `${childName} 家园协同观察卡`,
      riskLevel: consultation.riskLevel,
      targetChildId: consultation.childId,
      triggerReason: consultation.triggerReason,
      summary: consultation.summary,
      todayInSchoolAction: consultation.schoolAction,
      tonightHomeAction: consultation.homeAction,
      homeSteps: consultation.tonightAtHomeActions,
      observationPoints: consultation.observationPoints,
      tomorrowObservationPoint: consultation.nextCheckpoints[0] ?? "次日继续观察。",
      reviewIn48h: consultation.reviewIn48h,
      parentMessageDraft: consultation.parentMessageDraft,
      teacherFollowupDraft: `${childName} 明天入园后继续核对晨检、饮水和情绪过渡。`,
      consultationMode: true,
      consultationId: consultation.consultationId,
      consultationSummary: consultation.summary,
      participants: consultation.participants.map((item) => item.label),
      shouldEscalateToAdmin: consultation.shouldEscalateToAdmin,
      source: "fallback",
      createdAt: at(shiftDate(today, -1), 16, 20),
      updatedAt: at(shiftDate(today, -1), 16, 20),
    };
  });
}

function buildTasks(children: DemoChild[], today: string): { tasks: DemoTask[]; taskReminders: AppStateSnapshot["reminders"] } {
  const tasks: DemoTask[] = [];
  const taskReminders: AppStateSnapshot["reminders"] = [];

  for (const klass of CLASSES) {
    const classChildren = children.filter((child) => child.classId === klass.classId);
    for (let index = 0; index < 12; index += 1) {
      const child = classChildren[index % classChildren.length];
      const createdDate = shiftDate(today, -(index + 2));
      const dueDate = shiftDate(today, index < 4 ? -(index % 3) : index < 8 ? 1 + (index % 2) : 2 + (index % 3));
      const status = index < 4 ? "completed" : index < 8 ? "in_progress" : "pending";
      const assignmentId = `assign-${klass.classId}-${index + 1}`;
      const taskId = `task-${assignmentId}`;
      const reminderId = `reminder-${assignmentId}`;

      tasks.push({
        taskId,
        taskType: "follow_up",
        childId: child.id,
        sourceType: "admin_dispatch",
        sourceId: assignmentId,
        ownerRole: "teacher",
        title: `${child.name} 观察跟进`,
        description:
          status === "completed"
            ? "历史派单：已完成家园反馈闭环。"
            : "园长派单：请主班老师跟进 48 小时观察并补充反馈。",
        dueWindow: { kind: "deadline", label: "园长派单" },
        dueAt: at(dueDate, 18, 0),
        status,
        evidenceSubmissionMode: "dispatch_status_update",
        completionSummary: status === "completed" ? "已完成观察并同步家长。" : undefined,
        createdAt: at(createdDate, 9, index),
        updatedAt: at(status === "completed" ? shiftDate(createdDate, 1) : createdDate, 16, index),
        completedAt: status === "completed" ? at(shiftDate(createdDate, 1), 16, index) : undefined,
        legacyRefs: {
          adminDispatchEventId: assignmentId,
          reminderIds: [reminderId],
          consultationId: index % 5 === 0 ? `consultation-${child.id}` : undefined,
        },
        assignedTeacherId: klass.teacherId,
        assignedTeacherName: klass.teacherName,
        riskItemId: index % 5 === 0 ? `risk-${child.id}` : undefined,
        createdBy: DIRECTOR_ID,
      });

      taskReminders.push({
        reminderId,
        reminderType: "review-48h",
        targetRole: "teacher",
        targetId: klass.teacherId,
        childId: child.id,
        title: `${child.name} 派单提醒`,
        description: "请根据园长派单完成观察、反馈和状态更新。",
        scheduledAt: at(dueDate, 9, 30),
        status: status === "completed" ? "done" : status === "in_progress" ? "acknowledged" : "pending",
        sourceId: assignmentId,
        taskId,
        sourceType: "admin_dispatch",
        relatedTaskIds: [taskId],
      });
    }
  }

  return { tasks, taskReminders };
}

function buildReminders(children: DemoChild[], today: string, taskReminders: AppStateSnapshot["reminders"]): AppStateSnapshot["reminders"] {
  const childReminders = children.flatMap((child, childIndex) =>
    Array.from({ length: 3 }, (_, index) => {
      const scheduledAt = at(shiftDate(today, index - 1), 19, 10 + index);
      return {
        reminderId: `reminder-${child.id}-daily-${index + 1}`,
        reminderType: index === 0 ? "family-task" : "admin-focus",
        targetRole: index === 2 ? "teacher" : "parent",
        targetId: index === 2 ? child.teacherId : child.id,
        childId: child.id,
        title: index === 0 ? "晚间家园反馈" : index === 1 ? "饮水观察提醒" : "教师复盘提醒",
        description:
          index === 0
            ? "请家长补充晚间情绪、入睡和进食状态。"
            : index === 1
              ? "明日继续观察饮水和蔬菜接受度。"
              : "请老师在明日记录复盘观察点。",
        scheduledAt,
        status: (childIndex + index) % 4 === 0 ? "acknowledged" : index === 1 ? "done" : "pending",
        sourceId: "dseed-demo",
      } satisfies AppStateSnapshot["reminders"][number];
    })
  );

  return [...childReminders, ...taskReminders];
}

function buildFeedback(children: DemoChild[], tasks: DemoTask[], today: string): GuardianFeedback[] {
  return children.slice(0, 12).map((child, index) => {
    const submittedAt = at(shiftDate(today, -(21 + (index % 5))), 20, 15);
    const feedbackId = `feedback-${child.id}`;
    const relatedTask = tasks.find((task) => task.childId === child.id);
    return {
      feedbackId,
      childId: child.id,
      sourceRole: "parent",
      sourceChannel: "demo-home-school",
      relatedTaskId: relatedTask?.taskId,
      relatedConsultationId: index % 3 === 0 ? `consultation-${child.id}` : undefined,
      executionStatus: index % 4 === 0 ? "partial" : "completed",
      executionCount: 1 + (index % 3),
      executorRole: "parent",
      childReaction: index % 5 === 0 ? "neutral" : "accepted",
      improvementStatus: index % 4 === 0 ? "slight_improvement" : "clear_improvement",
      barriers: index % 4 === 0 ? ["晚间作息较晚"] : [],
      notes: `${child.name} 家长反馈：今晚已完成轻量观察，孩子整体配合。`,
      attachments: {
        image: [{ url: DEMO_MEDIA.growth, name: "demo-growth-placeholder.svg", mimeType: "image/svg+xml" }],
      },
      submittedAt,
      source: {
        kind: "structured",
        workflow: "dseed-demo-feedback",
        createdBy: child.parentId,
        createdByRole: "家长",
      },
      fallback: { notesSummary: "D-SEED deterministic parent feedback." },
      id: feedbackId,
      date: submittedAt.slice(0, 10),
      status: index % 4 === 0 ? "in-progress" : "resolved",
      content: `${child.name} 家长反馈：已按老师建议完成观察。`,
      sourceWorkflow: "parent-agent",
      executed: true,
      improved: index % 4 === 0 ? "unknown" : true,
      freeNote: "虚构演示反馈，无真实家庭信息。",
      createdBy: child.parentId,
      createdByRole: "家长",
    } as GuardianFeedback;
  });
}

function buildMessages(children: DemoChild[], today: string): {
  messages: AppStateSnapshot["messages"];
  conversations: AppStateSnapshot["conversations"];
} {
  const conversations: AppStateSnapshot["conversations"] = [];
  const messages: AppStateSnapshot["messages"] = [];

  for (const klass of CLASSES) {
    const classChildren = children.filter((child) => child.classId === klass.classId).slice(0, 6);
    classChildren.forEach((child, index) => {
      const conversationId = `conv-${child.id}-home-school`;
      const messageDate = shiftDate(today, -(30 + index));
      const createdAt = at(messageDate, 8 + index, 5);
      const hasTeacherReply = index !== 1;
      conversations.push({
        conversationId,
        childId: child.id,
        classId: child.classId,
        participantIds: [child.parentId, klass.teacherId, DIRECTOR_ID],
        participantRoles: ["parent", "teacher", "director"],
        status: "open",
        createdAt,
        updatedAt: hasTeacherReply ? at(messageDate, 18, 5) : createdAt,
      });
      messages.push({
        messageId: `msg-${child.id}-parent-1`,
        conversationId,
        childId: child.id,
        classId: child.classId,
        senderRole: "parent",
        senderId: child.parentId,
        senderName: child.parentId === PARENT_ID ? "林妈妈" : `演示家长${child.id.replace("c-", "").padStart(2, "0")}`,
        receiverRole: "teacher",
        targetRole: "teacher",
        content: `${child.name} 今晚在家状态平稳，请老师明天继续留意午睡前情绪。`,
        createdAt,
        readBy: [klass.teacherId],
        status: "sent",
      });
      if (hasTeacherReply) {
        messages.push({
          messageId: `msg-${child.id}-teacher-1`,
          conversationId,
          childId: child.id,
          classId: child.classId,
          senderRole: "teacher",
          senderId: klass.teacherId,
          senderName: klass.teacherName,
          receiverRole: "parent",
          targetRole: "parent",
          content: `收到，明天会继续观察 ${child.name} 的情绪、饮水和进餐情况。`,
          createdAt: at(messageDate, 18, 10),
          readBy: [child.parentId],
          status: "sent",
        });
      }
    });
  }

  return { messages, conversations };
}

function buildNutritionMenus(today: string): AppStateSnapshot["nutritionMenus"] {
  return CLASSES.flatMap((klass) =>
    Array.from({ length: 28 }, (_, index) => {
      const date = shiftDate(today, -index);
      return {
        menuId: `menu-${klass.classId}-${date}`,
        date,
        classId: klass.classId,
        meals: {
          breakfast: ["燕麦南瓜粥", "蒸蛋羹", "温水"],
          lunch: ["软米饭", index % 2 === 0 ? "番茄牛肉末" : "清蒸鱼丸", "时令青菜"],
          snack: ["苹果片", "原味酸奶"],
          dinner: ["山药瘦肉粥", "胡萝卜丁", "温水"],
          demoNotice: "DEMO meal plan, fictional and synthetic.",
        },
      };
    })
  );
}

function storybookScenesFor(child: DemoChild, growth: AppStateSnapshot["growth"]): ParentStoryBookScene[] {
  const records = growth.filter((record) => record.childId === child.id).slice(0, 4);
  return records.map((record, index) => ({
    sceneIndex: index + 1,
    sceneTitle: `${child.nickname ?? child.name}的${record.category}`,
    sceneText: `${record.description} 老师把这一刻记录下来，作为 ${child.name} 成长绘本的一页。`,
    imagePrompt: `warm children's storybook illustration, childcare classroom, no identifiable child face, ${record.category}`,
    imageUrl: DEMO_MEDIA.storybook,
    assetRef: DEMO_MEDIA.storybook,
    imageSourceKind: "svg-fallback",
    imageStatus: "fallback",
    audioUrl: null,
    audioRef: null,
    audioScript: `${record.description} 这是 ${child.name} 的成长故事。`,
    audioStatus: "fallback",
    voiceStyle: "warm parent narration",
    highlightSource: record.id,
    captionTiming: {
      mode: "duration-derived",
      segmentTexts: [record.description],
    },
  }));
}

function buildStorybooks(children: DemoChild[], growth: AppStateSnapshot["growth"], today: string): AppStateSnapshot["storybooks"] {
  return children.map((child) => {
    const generatedAt = at(shiftDate(today, -1), 21, 0);
    const sourceRecordIds = growth.filter((record) => record.childId === child.id).map((record) => record.id);
    const scenes = storybookScenesFor(child, growth);
    const response: ParentStoryBookResponse = {
      storyId: `storybook-${child.id}`,
      childId: child.id,
      mode: "storybook",
      title: `${child.name}的成长小书`,
      summary: `这本预生成绘本来自 ${child.name} 的演示成长记录，刷新和直达链接均可恢复。`,
      moral: "每天一点点记录，成长就有迹可循。",
      parentNote: "本绘本为 D-SEED 演示预生成内容，图片为安全占位素材。",
      source: "rule",
      fallback: true,
      fallbackReason: "dseed-prebuilt-storybook",
      generatedAt,
      stylePreset: "sunrise-watercolor",
      providerMeta: {
        provider: "dseed-demo-seed",
        mode: "saved-storybook",
        transport: "next-json-fallback",
        imageProvider: "demo-media-fallback",
        audioProvider: "browser-preview",
        imageDelivery: "svg-fallback",
        audioDelivery: "preview-only",
        requestSource: "dseed-prebuilt",
        fallbackReason: "no-gpt-image2-assets-yet",
        realProvider: false,
        highlightCount: sourceRecordIds.length,
        sceneCount: scenes.length,
      },
      scenes,
      cacheMeta: {
        storyResponse: "hit",
        audioDelivery: "preview-only",
        ttlSeconds: 86400,
        realSceneCount: 0,
      },
    };

    const pages = [
      {
        kind: "cover",
        title: response.title,
        text: response.summary,
        date: generatedAt.slice(0, 10),
        sourceGrowthRecordIds: sourceRecordIds.slice(0, 1),
        mediaRef: DEMO_MEDIA.storybook,
        fallbackMediaRef: DEMO_MEDIA.storybook,
        response,
      },
      ...scenes.map((scene) => ({
        kind: "page",
        title: scene.sceneTitle,
        text: scene.sceneText,
        date: generatedAt.slice(0, 10),
        sourceGrowthRecordIds: [scene.highlightSource],
        mediaRef: scene.imageUrl,
        fallbackMediaRef: scene.assetRef,
      })),
      {
        kind: "ending",
        title: "今天的成长总结",
        text: `${child.name} 在语言、社交、自理、运动和情绪表达上都有稳定记录。`,
        date: generatedAt.slice(0, 10),
        sourceGrowthRecordIds: sourceRecordIds,
        mediaRef: DEMO_MEDIA.storybook,
        fallbackMediaRef: DEMO_MEDIA.storybook,
      },
    ];

    return {
      storybookId: `storybook-${child.id}`,
      childId: child.id,
      sourceRecordIds,
      pages,
      generatedAt,
      updatedAt: generatedAt,
      share: {
        shareId: `share-storybook-${child.id}`,
        sharedBy: child.parentId,
        sharedAt: generatedAt,
        summary: response.summary,
        localText: `${response.title}\n${response.summary}\nDEMO / 示例绘本。`,
      },
    };
  });
}

function buildWeeklyReports(children: DemoChild[], growth: AppStateSnapshot["growth"], health: AppStateSnapshot["health"], meals: AppStateSnapshot["meals"], today: string): ApiWeeklyReport[] {
  return Array.from({ length: 4 }, (_, weekIndex) => {
    const periodEnd = shiftDate(today, -(weekIndex * 7 + 1));
    const periodStart = shiftDate(periodEnd, -6);
    const sourceRecordIds = [
      ...growth.slice(weekIndex * 8, weekIndex * 8 + 8).map((record) => record.id),
      ...health.slice(weekIndex * 8, weekIndex * 8 + 8).map((record) => record.id),
      ...meals.slice(weekIndex * 8, weekIndex * 8 + 8).map((record) => record.id),
    ];
    const abnormalCount = health.filter((record) => record.date >= periodStart && record.date <= periodEnd && record.isAbnormal).length;
    return {
      reportId: `weekly-report-institution-${weekIndex + 1}`,
      title: `D-SEED 园所周报 W${weekIndex + 1}`,
      scopeType: "institution",
      scopeId: INSTITUTION_ID,
      institutionId: INSTITUTION_ID,
      periodStart,
      periodEnd,
      status: "generated",
      payload: {
        summary: {
          childCount: children.length,
          recordCount: sourceRecordIds.length,
          healthAbnormalCount: abnormalCount,
          highRiskConsultationCount: 6,
          unresolvedFeedbackCount: weekIndex + 1,
        },
        metrics: {
          attendanceRate: 1,
          mealCoverage: 1,
          growthCoverage: 1,
        },
        risks: abnormalCount > 0 ? ["晨检轻微异常需要持续观察"] : ["本周风险平稳"],
        highlights: ["两班成长记录覆盖完整", "家园沟通保持闭环", "营养餐谱持续更新"],
        classComparison: CLASSES.map((klass) => ({
          classId: klass.classId,
          className: klass.className,
          childCount: children.filter((child) => child.classId === klass.classId).length,
          teacherId: klass.teacherId,
        })),
        sourceRecordIds,
        demoNotice: "D-SEED deterministic weekly report.",
      },
      sourceRecordIds,
      createdBy: DIRECTOR_ID,
      generatedBy: "dseed-demo-seed",
      createdAt: at(periodEnd, 18, 0),
      updatedAt: at(periodEnd, 18, 0),
      share: {
        shareId: `share-weekly-report-${weekIndex + 1}`,
        sharedBy: DIRECTOR_ID,
        sharedAt: at(periodEnd, 18, 30),
        summary: `D-SEED 园所周报 W${weekIndex + 1}`,
        localText: `D-SEED 园所周报 W${weekIndex + 1}: ${children.length} 名幼儿，记录覆盖完整。`,
      },
    };
  });
}

function buildAttachments(children: DemoChild[], today: string): ApiAttachment[] {
  return children.map((child, index) => ({
    attachmentId: `attachment-health-${child.id}`,
    institutionId: INSTITUTION_ID,
    childId: child.id,
    relatedType: "health-material",
    relatedId: `health-material-${child.id}`,
    kind: "image",
    fileName: `DEMO-${child.id}-health-placeholder.svg`,
    mimeType: "image/svg+xml",
    byteSize: 1024,
    storageMode: "metadata_only",
    uploadStatus: "metadata_saved",
    localPreviewUrl: DEMO_MEDIA.health,
    createdBy: child.teacherId,
    createdAt: at(shiftDate(today, -(index % 10)), 14, 25),
    updatedAt: at(shiftDate(today, -(index % 10)), 14, 25),
  }));
}

function buildTeachers(today: string): ApiTeacher[] {
  return CLASSES.map((klass) => ({
    teacherId: klass.teacherId,
    userId: klass.teacherId,
    name: klass.teacherName,
    institutionId: INSTITUTION_ID,
    className: klass.className,
    createdAt: at(shiftDate(today, -240), 8, 0),
    updatedAt: at(shiftDate(today, -1), 8, 0),
  }));
}

export function createDemoSeedSnapshot(now = new Date().toISOString()): DemoSeedSnapshot {
  const today = toDateKey(now);
  const children = buildChildren(today);
  const attendance = buildAttendance(children, today);
  const health = buildHealth(children, today);
  const meals = buildMeals(children, today);
  const growth = buildGrowth(children, today);
  const healthMaterials = buildHealthMaterials(children, today);
  const consultations = buildConsultations(children, today);
  const interventionCards = buildInterventionCards(children, consultations, today);
  const { tasks, taskReminders } = buildTasks(children, today);
  const reminders = buildReminders(children, today, taskReminders);
  const feedback = buildFeedback(children, tasks, today);
  const { messages, conversations } = buildMessages(children, today);
  const nutritionMenus = buildNutritionMenus(today);
  const storybooks = buildStorybooks(children, growth, today);
  const weeklyReports = buildWeeklyReports(children, growth, health, meals, today);
  const attachments = buildAttachments(children, today);
  const updatedAt = at(today, 8, 0);

  return {
    demoPersistenceSchemaVersion: "d01-v1",
    children,
    attendance,
    meals,
    growth,
    feedback,
    health,
    taskCheckIns: tasks
      .filter((task) => task.status === "completed")
      .map((task) => ({
        id: `checkin-${task.taskId}`,
        childId: task.childId,
        taskId: task.taskId,
        date: task.completedAt?.slice(0, 10) ?? today,
      })),
    interventionCards,
    consultations,
    mobileDrafts: [],
    reminders,
    tasks,
    messages,
    conversations,
    healthMaterials,
    nutritionMenus,
    storybooks,
    updatedAt,
    teachers: buildTeachers(today),
    weeklyReports,
    attachments,
    auditLogs: [
      {
        auditId: "audit-dseed-seed-created",
        actorUserId: DIRECTOR_ID,
        actorRole: "机构管理员",
        institutionId: INSTITUTION_ID,
        targetType: "demo-seed",
        targetId: "dseed",
        action: "create-demo-seed",
        result: "success",
        metadata: { childCount: children.length, teacherCounts: { "u-teacher": 18, "u-teacher2": 18 } },
        createdAt: updatedAt,
      } satisfies ApiAuditLog,
    ],
  };
}
