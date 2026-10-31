import type { CareCourse } from "./types";

export const COURSE_CATALOG_VERSION = "care-three-domains-20261031-v1";
const discoveredAt = "2026-10-31T07:45:00.000Z";
const video = (url: string, title: string, author: string): CareCourse["video"] => ({
  url, title, author, durationSeconds: null, discoveredAt, verifiedAt: null,
  verificationStatus: "pending",
  evidence: "公开搜索索引中发现明确视频页面；B站实时请求返回412，等待页面及分P时长复核。未转载视频。",
});

// 微课为本项目原创内容；视频是补充外链，不暗示作者与本平台合作或授权转载。
export const CARE_COURSES: CareCourse[] = [
  {
    id: "nutrition-signals", version: "1", module: "nutrition", title: "看懂饥饿与吃饱信号",
    summary: "用观察和回应代替催促，记录孩子的进食表现。", minAgeMonths: 0, maxAgeMonths: 36,
    goals: ["回应喂养", "进食观察"], purpose: "explain", estimatedMinutes: 3,
    cards: [{ title: "先观察", body: "留意孩子主动寻食、张口、转头或停止进食的表现；同一个孩子每天也会不同。" }, { title: "温和回应", body: "提供安静、有人陪伴的进食环境，不用追喂、强迫或奖励来替代饥饱信号。" }],
    question: { prompt: "孩子转头、停止张口时，先怎样做？", choices: ["加快速度再喂几口", "暂停并观察是否已经吃饱", "用屏幕转移注意后继续喂"], answer: 1, explanation: "先暂停并观察，比强迫完成固定份量更能尊重孩子的感受。" },
    practice: "下一次进食时记录一个寻食信号和一个停止信号，向老师反馈观察到的事实。",
    video: video("https://www.bilibili.com/video/BV13X4y1u7VE/?p=1", "科普_母乳喂养那些事", "晶晶疯爱演员陈晓（公开科普合集）"),
  },
  {
    id: "nutrition-first-food", version: "1", module: "nutrition", title: "辅食起步：一次观察一种变化",
    summary: "围绕合适的辅食时机、质地和观察记录建立家庭与园所一致做法。", minAgeMonths: 6, maxAgeMonths: 12,
    goals: ["辅食添加", "进食观察"], purpose: "demonstrate", estimatedMinutes: 4,
    cards: [{ title: "准备与沟通", body: "开始辅食前与日常照护者沟通喂养安排。特殊喂养问题按儿童保健专业建议处理。" }, { title: "看见变化", body: "记录尝试的食物、适合的质地以及孩子的接受情况；出现不适时停止尝试并及时寻求专业帮助。" }],
    question: { prompt: "向老师反馈新食物尝试，哪项最有帮助？", choices: ["只说吃得不好", "记录食物、质地、接受情况和不适表现", "只记录是否吃完"], answer: 1, explanation: "具体事实有助于家庭与老师协调，不应只以吃完多少评价。" },
    practice: "和老师核对最近一次新食物尝试，补充食物、质地和反应三项信息。",
    video: video("https://www.bilibili.com/video/BV13X4y1u7VE/?p=2", "科普_什么时候给宝宝添加辅食", "晶晶疯爱演员陈晓（公开科普合集）"),
  },
  {
    id: "nutrition-texture", version: "1", module: "nutrition", title: "从细腻到多样：观察咀嚼与自主进食",
    summary: "根据孩子的进食表现调整照护方式，避免简单按月龄比较。", minAgeMonths: 6, maxAgeMonths: 36,
    goals: ["食物质地", "自主进食"], purpose: "practice", estimatedMinutes: 4,
    cards: [{ title: "循序渐进", body: "质地变化结合孩子的发育与接受情况，食物大小和软硬要安全，成人全程近距离照护。" }, { title: "给尝试留空间", body: "允许孩子在安全条件下练习使用餐具，记录需要帮助的环节，而不是把弄脏当作失败。" }],
    question: { prompt: "孩子自主用勺常洒出食物，应怎样支持？", choices: ["以后不再让孩子尝试", "提供适合餐具和小份食物并陪伴练习", "要求立刻独立吃完"], answer: 1, explanation: "安全的小步尝试可以帮助成人观察孩子的能力与需要。" },
    practice: "选择一次熟悉的进食环节，让孩子完成一个力所能及的小动作并记录。",
    video: video("https://www.bilibili.com/video/BV1wQ1sB9EGQ/", "按月龄调整辅食粗细，观察咀嚼能力", "惠州市第二妇幼保健院"),
  },
  {
    id: "psychology-attachment", version: "1", module: "psychology", title: "用稳定回应建立安全感",
    summary: "认识依恋需要，把回应变成日常可以执行的小行动。", minAgeMonths: 0, maxAgeMonths: 36,
    goals: ["安全依恋", "情绪回应"], purpose: "explain", estimatedMinutes: 3,
    cards: [{ title: "回应比猜测重要", body: "靠近、轻声说话并观察孩子的反应，了解此刻是需要休息、陪伴还是减少刺激。" }, { title: "保持可预期", body: "与老师沟通常用的安抚方式，建立熟悉的交接和睡前顺序；不承诺每一次安抚都立刻有效。" }],
    question: { prompt: "孩子哭泣时，更合适的第一步是？", choices: ["先靠近观察并温和回应", "认定孩子故意捣乱", "用突然的强刺激逗笑"], answer: 0, explanation: "先观察和回应有助于理解需要，不能只根据哭泣给孩子贴标签。" },
    practice: "记录一种孩子容易接受的安抚方式，与老师共享适用情境。",
    video: video("https://www.bilibili.com/video/BV1MT4y1i7Xn/", "宝宝是如何形成依恋的？科学了解依恋形成的关键阶段", "稚桥教育"),
  },
  {
    id: "psychology-response", version: "1", module: "psychology", title: "接住情绪，再表达需要",
    summary: "用简短语言描述事实和感受，不把情绪当作坏行为。", minAgeMonths: 12, maxAgeMonths: 36,
    goals: ["情绪回应", "亲子沟通"], purpose: "demonstrate", estimatedMinutes: 3,
    cards: [{ title: "描述而不评判", body: "可以说“你还想继续玩，收起来有点难过”，再给出清晰而简短的下一步。" }, { title: "一项小选择", body: "在安全边界内提供两个可执行选择，允许孩子用动作或简短语言回应。" }],
    question: { prompt: "结束游戏时孩子难过，哪句话更适合？", choices: ["不许哭", "你还想玩；我们先收这个，还是先收那个？", "再哭就不要你"], answer: 1, explanation: "承认感受并给出有限选择，可以同时保留陪伴与边界。" },
    practice: "今天用一次“描述感受＋两个小选择”，记录孩子的实际回应。",
    video: video("https://www.bilibili.com/video/BV1vcNa68EmW/?p=1", "9件日常小事悄悄伤害宝宝感情（中配版）", "香蕉配音君 / Babies Psychology"),
  },
  {
    id: "psychology-peers", version: "1", module: "psychology", title: "同伴冲突：先保护，再练习轮流",
    summary: "关注幼儿的表达和照护支持，不急于给孩子定性。", minAgeMonths: 24, maxAgeMonths: 36,
    goals: ["同伴交往", "亲子沟通"], purpose: "practice", estimatedMinutes: 4,
    cards: [{ title: "先保证安全", body: "成人及时阻止推打等危险行为，平静描述双方的需要，避免当众贴“坏孩子”标签。" }, { title: "练习一个动作", body: "用成人示范支持等待、轮流或请求帮助；把成功的一小步记录给老师。" }],
    question: { prompt: "两个孩子争抢玩具时，应先做什么？", choices: ["先评判谁是坏孩子", "确保安全，描述需要并帮助轮流", "任由推打直到自己解决"], answer: 1, explanation: "安全和成人支持优先，再逐步练习适合年龄的交往方法。" },
    practice: "和老师商定一句一致的轮流提示语，在家庭中练习并反馈。",
    video: video("https://www.bilibili.com/video/BV1S1421d77j/", "浅谈幼儿冲突及指导策略（1）", "基础教育科研入门"),
  },
  {
    id: "movement-floor", version: "1", module: "movement", title: "安全地面上的自主探索",
    summary: "准备安全空间，支持孩子按自己的节奏活动。", minAgeMonths: 12, maxAgeMonths: 36,
    goals: ["自主探索", "运动安全"], purpose: "explain", estimatedMinutes: 3,
    cards: [{ title: "环境先行", body: "清理小物件、尖角和绊倒风险，在稳定地面上成人近距离陪伴；不安排腾空、倒置或强拉肢体动作。" }, { title: "看孩子信号", body: "活动中观察呼吸、表情和疲劳表现，不强迫完成还未准备好的姿势。" }],
    question: { prompt: "孩子出现疲劳或不愿继续时，应如何处理？", choices: ["坚持练到规定次数", "暂停、休息并观察", "增加动作难度"], answer: 1, explanation: "观察孩子的舒适程度比完成固定次数更重要。" },
    practice: "检查一处日常活动空间，移除一个风险点并与老师分享。",
    video: video("https://www.bilibili.com/video/BV1UMQiB5Eay/", "1-3岁亲子感统游戏合集来啦，赶紧带宝宝练起来", "暖暖婴护心"),
  },
  {
    id: "movement-family", version: "1", module: "movement", title: "不比速度的亲子运动游戏",
    summary: "以陪伴和尝试为目标，让运动成为愉快互动。", minAgeMonths: 18, maxAgeMonths: 36,
    goals: ["亲子运动", "动作协调"], purpose: "demonstrate", estimatedMinutes: 4,
    cards: [{ title: "动作要合适", body: "从孩子已经能完成的动作开始，减少等待与竞争，成人示范一个简单动作。" }, { title: "及时调整", body: "观察兴趣、疲劳和环境安全，降低难度或暂停，记录孩子愿意重复的游戏。" }],
    question: { prompt: "孩子还不能完成示范动作时，怎样做？", choices: ["与同龄孩子比较", "降低难度，支持已经能完成的一小步", "强拉着完成"], answer: 1, explanation: "适合能力的小步尝试更利于愉快参与。" },
    practice: "和孩子选一个熟悉动作，玩两分钟并记录最喜欢的环节。",
    video: video("https://www.bilibili.com/video/BV1Yf4y1u7c2/", "不用道具的大运动游戏", "hakuna007"),
  },
  {
    id: "movement-coordination", version: "1", module: "movement", title: "把协调练习融入日常游戏",
    summary: "从走、停、取放等日常动作中观察运动表现。", minAgeMonths: 12, maxAgeMonths: 36,
    goals: ["动作协调", "运动安全"], purpose: "practice", estimatedMinutes: 4,
    cards: [{ title: "日常就是机会", body: "利用安全的取放、走停或滚球活动，观察孩子怎样调整动作；道具必须足够大、稳定、没有吞咽风险。" }, { title: "记录事实", body: "记录动作、所需帮助和孩子感受，不把一次表现用于诊断或与同伴排名。" }],
    question: { prompt: "哪一种运动反馈更具体？", choices: ["协调很差", "滚球时愿意等一下，需要成人提示方向", "比别的孩子落后"], answer: 1, explanation: "具体的动作和帮助信息便于家园协作。" },
    practice: "安排一次短滚球游戏，记录一个自主动作和一个需要帮助的环节。",
    video: video("https://www.bilibili.com/video/BV1UMQiB5Eay/", "1-3岁亲子感统游戏合集来啦，赶紧带宝宝练起来", "暖暖婴护心"),
  },
];

// 2026-10-31 常规浏览器元数据核对：分P时长逐项读取，不能使用整条合集总时长。
const VERIFIED_DURATIONS: Record<string, number> = {
  "nutrition-signals": 101, "nutrition-first-food": 102, "nutrition-texture": 44,
  "psychology-attachment": 232, "psychology-response": 650, "psychology-peers": 134,
  "movement-floor": 41, "movement-family": 63, "movement-coordination": 41,
};
for (const course of CARE_COURSES) {
  course.video.durationSeconds = VERIFIED_DURATIONS[course.id];
  course.video.verifiedAt = "2026-10-31T07:57:08.000Z";
  course.video.verificationStatus = "verified";
  course.video.evidence = "已通过常规浏览器核对标题、作者、免费状态及当前分P时长；仅提供外链，不转载视频。";
}

export function safeBilibiliUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "www.bilibili.com" || url.username || url.password || url.port || !/^\/video\/BV[0-9A-Za-z]{10}\/?$/.test(url.pathname)) return null;
    const part = url.searchParams.get("p");
    if (part && !/^[1-9]\d{0,3}$/.test(part)) return null;
    return `https://www.bilibili.com${url.pathname.replace(/\/$/, "")}/${part ? `?p=${part}` : ""}`;
  } catch { return null; }
}
