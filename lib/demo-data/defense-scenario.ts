export const DEFENSE_DEMO_DATASET_VERSION = "v6-defense-scenario";

export const DEFENSE_INSTITUTION_ID = "inst-1";
export const DEFENSE_DIRECTOR_ID = "u-admin";
export const DEFENSE_PARENT_ID = "u-parent";
export const DEFENSE_PARENT_NAME = "林小雨妈妈";

export const DEFENSE_CLASS = {
  classId: "class-morning",
  className: "晨曦班",
  teacherId: "u-teacher2",
  teacherName: "周老师",
} as const;

export const DEFENSE_REBALANCED_SUNRISE_CLASS = {
  classId: "class-sunrise",
  className: "向阳班",
  teacherId: "u-teacher",
  teacherName: "李老师",
} as const;

export const DEFENSE_REBALANCED_SUNRISE_CHILD_IDS = ["c-20", "c-21", "c-22", "c-23", "c-24"] as const;

export const DEFENSE_PARENT_VISIBLE_CHILD_IDS = ["c-1", "c-4"] as const;

export type DefenseChildId = "c-1" | "c-2" | "c-3" | "c-4" | "c-5" | "c-6";

export interface DefenseChildProfile {
  childId: DefenseChildId;
  name: string;
  nickname: string;
  gender: "男" | "女";
  avatar: string;
  guardianName: string;
  focus: string;
  educationTheme: string;
  homeAction: string;
  expectedFeedback: string;
  specialNotes: string;
  riskLevel: "low" | "medium" | "high";
}

export const DEFENSE_CHILD_PROFILES: Record<DefenseChildId, DefenseChildProfile> = {
  "c-1": {
    childId: "c-1",
    name: "林小雨",
    nickname: "小雨",
    gender: "女",
    avatar: "👧",
    guardianName: DEFENSE_PARENT_NAME,
    focus: "走廊活动害怕退缩",
    educationTheme: "勇敢表达与小步尝试",
    homeAction: "今晚共读绘本，说出“我害怕”，完成一次小步尝试",
    expectedFeedback: "孩子能复述故事，并愿意尝试走到门口",
    specialNotes: "答辩重点：走廊活动听到推车声后害怕退缩，需要用勇敢表达和小步尝试支持。",
    riskLevel: "medium",
  },
  "c-2": {
    childId: "c-2",
    name: "高远舟",
    nickname: "舟舟",
    gender: "男",
    avatar: "👦",
    guardianName: "高远舟妈妈",
    focus: "午睡焦虑、饮水少、离园前复查",
    educationTheme: "稳定过渡与主动补水",
    homeAction: "今晚记录入睡时间、饮水量和情绪变化，明早反馈给周老师",
    expectedFeedback: "家长待回复，48 小时内完成复查闭环",
    specialNotes: "答辩重点：午睡前焦虑且主动饮水少，离园前需要复查精神状态和饮水量。",
    riskLevel: "high",
  },
  "c-3": {
    childId: "c-3",
    name: "陈安安",
    nickname: "安安",
    gender: "女",
    avatar: "👧",
    guardianName: "陈安安妈妈",
    focus: "午餐进食偏少",
    educationTheme: "饮食观察与家园同步",
    homeAction: "今晚同步晚餐食量、饮水和入睡状态",
    expectedFeedback: "次日补一条成长记录，观察小份主食和一口蔬菜目标",
    specialNotes: "答辩重点：午餐进食偏少，需要家园同步饮食观察，并补一条成长记录。",
    riskLevel: "medium",
  },
  "c-4": {
    childId: "c-4",
    name: "赵一诺",
    nickname: "一诺",
    gender: "男",
    avatar: "👦",
    guardianName: DEFENSE_PARENT_NAME,
    focus: "情绪稳定，正常对照样本",
    educationTheme: "稳定作息与常规参与",
    homeAction: "保持原有作息，记录一次主动表达",
    expectedFeedback: "情绪稳定，作为对照样本展示班级基线",
    specialNotes: "答辩对照：情绪和作息稳定，用于和重点跟进儿童形成正常对照。",
    riskLevel: "low",
  },
  "c-5": {
    childId: "c-5",
    name: "王沐辰",
    nickname: "沐辰",
    gender: "男",
    avatar: "👦",
    guardianName: "王沐辰妈妈",
    focus: "偶发咳嗽，健康材料待解析",
    educationTheme: "健康材料解析与园内观察",
    homeAction: "今晚观察咳嗽频次，补充体温和睡眠情况",
    expectedFeedback: "健康材料解析完成后同步老师和园长",
    specialNotes: "答辩重点：偶发咳嗽，健康材料处于待解析状态，园内继续观察。",
    riskLevel: "medium",
  },
  "c-6": {
    childId: "c-6",
    name: "刘予安",
    nickname: "予安",
    gender: "女",
    avatar: "👧",
    guardianName: "刘予安妈妈",
    focus: "主动分享玩具",
    educationTheme: "正向社会性成长记录",
    homeAction: "今晚请孩子复述一次分享玩具的经历",
    expectedFeedback: "适合生成正向成长记录",
    specialNotes: "答辩亮点：主动分享玩具，适合生成正向成长记录和家庭共读延伸。",
    riskLevel: "low",
  },
};

export function isDefenseChildId(childId: string): childId is DefenseChildId {
  return Object.prototype.hasOwnProperty.call(DEFENSE_CHILD_PROFILES, childId);
}
