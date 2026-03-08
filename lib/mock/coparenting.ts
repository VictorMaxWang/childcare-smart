import { AgeBand } from "../store";

export type CoParentingTask = {
  id: string;
  title: string;
  description: string;
  ageBands: AgeBand[];
  durationText: string;
  tag: string;
};

export const CO_PARENTING_TASKS: CoParentingTask[] = [
  {
    id: "task_001",
    title: "睡前故事时光",
    description: "挑选一本绘本，用生动的声音给孩子讲故事，并引导孩子指出画面中的角色或物品。",
    ageBands: ["0–6个月", "6–12个月", "1–3岁", "3–6岁", "6–7岁"],
    durationText: "10-15 分钟",
    tag: "亲子阅读",
  },
  {
    id: "task_002",
    title: "和孩子一起数楼梯",
    description: "在上下楼梯时，拉着孩子的手，一起大声数出踏过的台阶数（“一、二、三...”）。",
    ageBands: ["1–3岁", "3–6岁"],
    durationText: "5 分钟",
    tag: "认知启蒙",
  },
  {
    id: "task_003",
    title: "今天开心的一件小事",
    description: "在晚餐时或睡前，邀请孩子分享今天发生的一件开心小事，并用肯定和欣赏的词语回应。",
    ageBands: ["3–6岁", "6–7岁"],
    durationText: "5 分钟",
    tag: "情绪表达",
  },
  {
    id: "task_004",
    title: "寻找家里的‘红色彩蛋’",
    description: "和孩子一起在客厅或卧室里，寻找3件红色的物品（如抱枕、苹果、玩具车），并大声说出它的名字。",
    ageBands: ["1–3岁", "3–6岁"],
    durationText: "10 分钟",
    tag: "观察力训练",
  },
  {
    id: "task_005",
    title: "跟随音乐摇摆",
    description: "播放一首欢快的儿歌，和孩子一起随音乐自由舞动或拍手，在音乐停止时一起变成‘木头人’。",
    ageBands: ["6–12个月", "1–3岁", "3–6岁", "6–7岁"],
    durationText: "10 分钟",
    tag: "感统训练",
  },
  {
    id: "task_006",
    title: "简单的分类整理",
    description: "准备两个不同的收纳筐，和孩子一起把玩具分成两类（比如：毛绒玩具和积木），边放边鼓励孩子。",
    ageBands: ["1–3岁", "3–6岁", "6–7岁"],
    durationText: "15 分钟",
    tag: "生活技能",
  }
];

export function getWeeklyTaskForChild(childId: string, ageBand: AgeBand): CoParentingTask {
  // 基于本周和childId生成一个伪随机但稳定的任务索引
  const now = new Date();
  const weekNumber = getWeekNumber(now);
  
  // 过滤出适合该年龄段的任务
  const availableTasks = CO_PARENTING_TASKS.filter(task => task.ageBands.includes(ageBand));
  
  if (availableTasks.length === 0) {
    return CO_PARENTING_TASKS[0]; // fallback
  }

  // 简单的字符串 hash 
  let hash = 0;
  for (let i = 0; i < childId.length; i++) {
    hash = childId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // 固定公式决定索引，保证一周内某个孩子看到的任务是固定的
  const index = Math.abs((hash + weekNumber) % availableTasks.length);
  return availableTasks[index];
}

function getWeekNumber(d: Date) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
}
