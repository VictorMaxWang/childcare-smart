"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import DirectorDashboardReplica from "@/components/admin/pixel-replica/DirectorDashboardReplica";
import EmptyState from "@/components/EmptyState";
import { buildAdminHomeViewModel, buildAdminWeeklyReportSnapshot } from "@/lib/agent/admin-agent";
import { dedupeAdminHomeExposure } from "@/lib/agent/admin-home-dedupe";
import { useAdminConsultationWorkspace } from "@/lib/agent/use-admin-consultation-workspace";
import { fetchWeeklyReport } from "@/lib/agent/weekly-report-client";
import type { WeeklyReportResponse } from "@/lib/ai/types";
import { INSTITUTION_NAME, useApp } from "@/lib/store";

const TODAY_TEXT = new Date().toLocaleDateString("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
});

export default function AdminHomePage() {
  const {
    currentUser,
    visibleChildren,
    attendanceRecords,
    healthCheckRecords,
    growthRecords,
    guardianFeedbacks,
    mealRecords,
    getAdminBoardData,
    getWeeklyDietTrend,
    getSmartInsights,
    getLatestConsultations,
  } = useApp();
  const weeklyReportCacheRef = useRef<Map<string, WeeklyReportResponse>>(new Map());
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportResponse | null>(null);
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);
  const [weeklyReportError, setWeeklyReportError] = useState<string | null>(null);
  const [weeklyReportRefreshNonce, setWeeklyReportRefreshNonce] = useState(0);

  const latestConsultations = getLatestConsultations();
  const { priorityItems: consultationPriorityItems, notificationEvents } = useAdminConsultationWorkspace({
    institutionName: INSTITUTION_NAME,
    visibleChildren,
    localConsultations: latestConsultations,
    consultationFeedOptions: {
      limit: 4,
      escalatedOnly: true,
    },
  });

  const adminHomePayload = useMemo(
    () => ({
      workflow: "daily-priority" as const,
      currentUser: {
        name: currentUser.name,
        institutionName: INSTITUTION_NAME,
        institutionId: currentUser.institutionId,
        role: currentUser.role,
      },
      visibleChildren,
      attendanceRecords,
      healthCheckRecords,
      growthRecords,
      guardianFeedbacks,
      mealRecords,
      adminBoardData: getAdminBoardData(),
      weeklyTrend: getWeeklyDietTrend(),
      smartInsights: getSmartInsights(),
      notificationEvents,
    }),
    [
      attendanceRecords,
      currentUser.institutionId,
      currentUser.name,
      currentUser.role,
      getAdminBoardData,
      getSmartInsights,
      getWeeklyDietTrend,
      growthRecords,
      guardianFeedbacks,
      healthCheckRecords,
      mealRecords,
      notificationEvents,
      visibleChildren,
    ]
  );
  const home = useMemo(() => buildAdminHomeViewModel(adminHomePayload), [adminHomePayload]);
  const displayHome = useMemo(
    () => dedupeAdminHomeExposure(home, consultationPriorityItems),
    [consultationPriorityItems, home]
  );
  const weeklyReportPayload = useMemo(
    () => ({
      role: "admin" as const,
      snapshot: buildAdminWeeklyReportSnapshot(adminHomePayload, home.adminContext),
    }),
    [adminHomePayload, home.adminContext]
  );
  const weeklyReportKey = useMemo(() => JSON.stringify(weeklyReportPayload), [weeklyReportPayload]);

  useEffect(() => {
    if (visibleChildren.length === 0) return;

    const cached = weeklyReportRefreshNonce === 0 ? weeklyReportCacheRef.current.get(weeklyReportKey) : undefined;
    if (cached) {
      setWeeklyReport(cached);
      setWeeklyReportError(null);
      setWeeklyReportLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadWeeklyReportPreview() {
      setWeeklyReportLoading(true);
      setWeeklyReportError(null);

      try {
        const data = await fetchWeeklyReport(weeklyReportPayload, {
          signal: controller.signal,
        });

        if (!cancelled) {
          weeklyReportCacheRef.current.set(weeklyReportKey, data);
          setWeeklyReport(data);
        }
      } catch (requestError) {
        if (!cancelled && !controller.signal.aborted) {
          setWeeklyReportError(
            requestError instanceof Error ? requestError.message : "园长周报预览暂时不可用"
          );
        }
      } finally {
        if (!cancelled) {
          setWeeklyReportLoading(false);
        }
      }
    }

    void loadWeeklyReportPreview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [visibleChildren.length, weeklyReportKey, weeklyReportPayload, weeklyReportRefreshNonce]);

  function handleRefreshDashboard() {
    weeklyReportCacheRef.current.delete(weeklyReportKey);
    setWeeklyReportRefreshNonce((value) => value + 1);
    toast.info("正在刷新园长看板数据");
  }

  if (visibleChildren.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="当前园长账号还没有可展示的机构数据"
          description="请先使用示例园长账号，或为机构管理员账号初始化机构级数据。"
        />
      </div>
    );
  }

  return (
    <DirectorDashboardReplica
      home={displayHome}
      institutionName={INSTITUTION_NAME}
      currentUserName={currentUser.name}
      todayText={TODAY_TEXT}
      weeklyReport={weeklyReport}
      weeklyReportLoading={weeklyReportLoading}
      weeklyReportError={weeklyReportError}
      weeklyReportPeriodLabel={weeklyReportPayload.snapshot.periodLabel}
      onRefresh={handleRefreshDashboard}
    />
  );
}
