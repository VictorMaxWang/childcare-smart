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
import { buildAdminCommunicationSummary } from "@/lib/communication/home-school";
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
    messages,
    conversations,
    healthMaterials,
    mealRecords,
    getAdminBoardData,
    getWeeklyDietTrend,
    getSmartInsights,
    getLatestConsultations,
    updateHomeSchoolConversationStatus,
  } = useApp();
  const weeklyReportCacheRef = useRef<Map<string, WeeklyReportResponse>>(new Map());
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportResponse | null>(null);
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);
  const [weeklyReportError, setWeeklyReportError] = useState<string | null>(null);
  const [weeklyReportRefreshNonce, setWeeklyReportRefreshNonce] = useState(0);

  const latestConsultations = getLatestConsultations();
  const localConsultationSummaries = useMemo(() => {
    const materialById = new Map(healthMaterials.map((material) => [material.materialId, material]));
    const childById = new Map(visibleChildren.map((child) => [child.id, child]));

    return [...latestConsultations]
      .sort((left, right) => {
        const leftSourceMaterialId = (left as { sourceMaterialId?: string }).sourceMaterialId;
        const rightSourceMaterialId = (right as { sourceMaterialId?: string }).sourceMaterialId;
        const leftHasMaterial = Boolean(leftSourceMaterialId && materialById.has(leftSourceMaterialId));
        const rightHasMaterial = Boolean(rightSourceMaterialId && materialById.has(rightSourceMaterialId));
        if (leftHasMaterial !== rightHasMaterial) {
          return Number(rightHasMaterial) - Number(leftHasMaterial);
        }

        const leftUpdatedAt = (left as { updatedAt?: string }).updatedAt ?? left.generatedAt;
        const rightUpdatedAt = (right as { updatedAt?: string }).updatedAt ?? right.generatedAt;
        return rightUpdatedAt.localeCompare(leftUpdatedAt);
      })
      .slice(0, 3)
      .map((consultation) => {
      const sourceMaterialId = (consultation as { sourceMaterialId?: string }).sourceMaterialId;
      const material = sourceMaterialId ? materialById.get(sourceMaterialId) : undefined;
      const child = childById.get(consultation.childId);
      const workflowStatus = (consultation as { workflowStatus?: string }).workflowStatus ?? "pending";
      return {
        consultationId: consultation.consultationId,
        childName: child?.name ?? consultation.childId,
        className: child?.className ?? "未分班",
        filename: material?.filename ?? sourceMaterialId ?? "未绑定材料",
        summary: consultation.summary,
        statusLabel:
          workflowStatus === "resolved" ? "已解决" : workflowStatus === "in-progress" ? "处理中" : "待处理",
      };
    });
  }, [healthMaterials, latestConsultations, visibleChildren]);
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
  const communicationSummary = useMemo(
    () =>
      buildAdminCommunicationSummary({
        messages,
        conversations,
        children: visibleChildren,
      }),
    [conversations, messages, visibleChildren]
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

  function handleMarkCommunicationHandled(conversationId: string) {
    const result = updateHomeSchoolConversationStatus(conversationId, "closed");
    if (result.status === "failed") {
      toast.error(`处理状态保存失败：${result.error ?? result.message}`);
      return;
    }

    toast.success("家园沟通已标记处理", {
      description:
        result.status === "local_only"
          ? "已写入共享演示数据，刷新后保留。"
          : "已写入当前数据层，刷新后保留。",
    });
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
    <>
      <DirectorDashboardReplica
        home={displayHome}
        institutionName={INSTITUTION_NAME}
        currentUserName={currentUser.name}
        todayText={TODAY_TEXT}
        weeklyReport={weeklyReport}
        weeklyReportLoading={weeklyReportLoading}
        weeklyReportError={weeklyReportError}
        weeklyReportPeriodLabel={weeklyReportPayload.snapshot.periodLabel}
        communicationSummary={communicationSummary}
        onMarkCommunicationHandled={handleMarkCommunicationHandled}
        onRefresh={handleRefreshDashboard}
      />
      {localConsultationSummaries.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
          <div className="rounded-lg border border-rose-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">高风险会诊汇总</p>
                <p className="mt-1 text-xs text-slate-500">来自 D01 本地演示数据，刷新后保留。</p>
              </div>
              <p className="text-xs font-semibold text-rose-600">本地真实记录 {localConsultationSummaries.length} 条</p>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {localConsultationSummaries.map((item) => (
                <article key={item.consultationId} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-950">{item.childName}</p>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                      {item.statusLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{item.className}</p>
                  <p className="mt-2 break-words text-xs font-semibold text-rose-700">{item.filename}</p>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{item.summary}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
