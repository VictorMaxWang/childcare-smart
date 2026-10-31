"use client";

import { useReportWebVitals } from "next/web-vitals";

const report: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  // 验收者主动开启时只输出数值和页面路径；不采集儿童编号、查询参数或发送外部遥测。
  if (new URLSearchParams(window.location.search).get("performanceAudit") !== "1") return;
  console.info("web.vital", JSON.stringify({ name: metric.name, value: metric.value, rating: metric.rating, id: metric.id, path: window.location.pathname }));
};

export function PerformanceAudit() {
  useReportWebVitals(report);
  return null;
}
