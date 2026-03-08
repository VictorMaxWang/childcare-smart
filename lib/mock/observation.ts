import { AgeBand, BehaviorCategory } from "../store";

export type ObservationIndicatorOption = {
  id: string;
  label: string;
};

// 预定义各领域和年龄段的结构化观察指标
export const OBSERVATION_INDICATOR_MAP: Partial<
  Record<BehaviorCategory, Partial<Record<AgeBand, ObservationIndicatorOption[]>>>
> = {
  "精细动作": {
    "1–3岁": [
      { id: "fd_1to3_1", label: "能用大拇指和食指捏起小物品" },
      { id: "fd_1to3_2", label: "能将物品放入小口容器" },
      { id: "fd_1to3_3", label: "能用勺子独立进食" },
      { id: "fd_1to3_4", label: "能模仿画直线或圆圈" },
    ],
    "3–6岁": [
      { id: "fd_3to6_1", label: "能熟练使用筷子" },
      { id: "fd_3to6_2", label: "能沿着线剪纸" },
      { id: "fd_3to6_3", label: "能系扣子或拉拉链" },
      { id: "fd_3to6_4", label: "能折出基本图形" },
    ],
  },
  "大动作": {
    "1–3岁": [
      { id: "gm_1to3_1", label: "能独立稳定行走" },
      { id: "gm_1to3_2", label: "能拉着栏杆上下楼梯" },
      { id: "gm_1to3_3", label: "能双脚原地跳跃" },
      { id: "gm_1to3_4", label: "能用力踢球" },
    ],
    "3–6岁": [
      { id: "gm_3to6_1", label: "能单脚站立超过5秒" },
      { id: "gm_3to6_2", label: "能熟练交替步上下楼梯" },
      { id: "gm_3to6_3", label: "能接住弹地而起的球" },
      { id: "gm_3to6_4", label: "能骑三轮童车或滑板车" },
    ],
  },
  "语言表达": {
    "1–3岁": [
      { id: "lg_1to3_1", label: "能说出三个词以上的短句" },
      { id: "lg_1to3_2", label: "能准确呼唤常见的物品和亲人" },
      { id: "lg_1to3_3", label: "能理解并执行两步指令" },
    ],
    "3–6岁": [
      { id: "lg_3to6_1", label: "能比较完整地复述一个简单故事" },
      { id: "lg_3to6_2", label: "能清楚表达自己的情绪和需求" },
      { id: "lg_3to6_3", label: "能使用简单的连接词（因为、所以）" },
    ],
  },
  "情绪表现": {
    "1–3岁": [
      { id: "em_1to3_1", label: "在挫折时能较快被安抚" },
      { id: "em_1to3_2", label: "能表现出对同伴的同情心" },
    ],
    "3–6岁": [
      { id: "em_3to6_1", label: "能接受游戏中的轮流和等待" },
      { id: "em_3to6_2", label: "在没有得到满足时能克制不乱发脾气" },
    ],
  },
};
