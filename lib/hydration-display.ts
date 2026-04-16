export type HydrationDisplayTone = "warning" | "info" | "success";

export interface HydrationDisplayState {
  tone: HydrationDisplayTone;
  statusLabel: string;
  initiativeLabel: string;
  summaryLabel: string;
  trendSummary: string;
  recordSummary: string;
  progress: number;
}

export function getHydrationDisplayState(hydrationMl: number): HydrationDisplayState {
  if (hydrationMl < 120) {
    return {
      tone: "warning",
      statusLabel: "补水偏少",
      initiativeLabel: "主动性偏弱",
      summaryLabel: "需频繁提醒",
      trendSummary: "近 7 天补水偏少，需继续提醒",
      recordSummary: "补水状态偏少",
      progress: 32,
    };
  }

  if (hydrationMl < 140) {
    return {
      tone: "warning",
      statusLabel: "补水需关注",
      initiativeLabel: "偶尔需提醒",
      summaryLabel: "仍需关注",
      trendSummary: "近 7 天补水需关注，建议保持提醒",
      recordSummary: "补水状态需关注",
      progress: 48,
    };
  }

  if (hydrationMl < 150) {
    return {
      tone: "info",
      statusLabel: "补水基本正常",
      initiativeLabel: "基本主动",
      summaryLabel: "整体稳定",
      trendSummary: "近 7 天补水基本正常",
      recordSummary: "补水状态基本正常",
      progress: 70,
    };
  }

  return {
    tone: "success",
    statusLabel: "补水较好",
    initiativeLabel: "较主动",
    summaryLabel: "状态较好",
    trendSummary: "近 7 天补水较好",
    recordSummary: "补水状态较好",
    progress: 90,
  };
}
