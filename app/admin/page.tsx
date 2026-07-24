"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import FeedbackDetailDialog from "@/components/communication/FeedbackDetailDialog";
import DirectorDashboardReplica, {
  type AdminFamilyFeedbackWriteback,
} from "@/components/admin/pixel-replica/DirectorDashboardReplica";
import RiskPriorityBoard from "@/components/admin/RiskPriorityBoard";
import EmptyState from "@/components/EmptyState";
import { buildAdminHomeViewModel, buildAdminWeeklyReportSnapshot } from "@/lib/agent/admin-agent";
import {
  buildAdminConsultationPriorityItems,
  type AdminConsultationPriorityItem,
} from "@/lib/agent/admin-consultation";
import { buildAdminD01HighRiskConsultation } from "@/lib/agent/admin-local-consultation-fallback";
import { buildAdminGovernanceDemoViewModel } from "@/lib/agent/admin-governance-demo";
import { dedupeAdminHomeExposure } from "@/lib/agent/admin-home-dedupe";
import { useAdminConsultationWorkspace } from "@/lib/agent/use-admin-consultation-workspace";
import { fetchWeeklyReport } from "@/lib/agent/weekly-report-client";
import { resolveWeeklyReportScope } from "@/lib/agent/weekly-report-scope";
import type { WeeklyReportResponse } from "@/lib/ai/types";
import { getAdminSummary } from "@/lib/api/analytics";
import { listFeedback as listApiFeedback, type ApiFeedback } from "@/lib/api/communication";
import type { ApiAdminSummary } from "@/lib/api/types";
import { buildAdminCommunicationSummary } from "@/lib/communication/home-school";
import {
  formatParentFeedbackExecutionLabel,
  formatParentFeedbackImprovementLabel,
  formatParentFeedbackReactionLabel,
} from "@/lib/feedback/consumption";
import type { GuardianFeedback } from "@/lib/feedback/types";
import { INSTITUTION_NAME, useApp } from "@/lib/store";

const TODAY_TEXT = new Date().toLocaleDateString("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
});

function feedbackTimestampOf(feedback: Pick<GuardianFeedback, "submittedAt" | "date">) {
  return feedback.submittedAt ?? feedback.date ?? "";
}

function formatFeedbackTime(value: string | undefined) {
  if (!value) return "刚刚回流";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 16);
  return parsed.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildFamilyFeedbackWriteback(
  feedback: GuardianFeedback,
  children: Array<{ id: string; name: string; className: string }>
): AdminFamilyFeedbackWriteback {
  const child = children.find((item) => item.id === feedback.childId);
  return {
    feedbackId: feedback.feedbackId,
    childName: child?.name ?? feedback.childId,
    className: child?.className ?? "未分班",
    executionStatusLabel: formatParentFeedbackExecutionLabel(feedback.executionStatus),
    childReactionLabel: formatParentFeedbackReactionLabel(feedback.childReaction),
    improvementStatusLabel: formatParentFeedbackImprovementLabel(feedback.improvementStatus),
    notes: feedback.notes || feedback.freeNote || feedback.content || "家长已提交家庭执行结果。",
    submittedAtLabel: formatFeedbackTime(feedbackTimestampOf(feedback)),
    sourceLabel: feedback.sourceChannel === "parent-agent" ? "来自家长行动页 feedback writeback" : `来源：${feedback.sourceChannel}`,
  };
}

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
    tasks,
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
  const [adminSummary, setAdminSummary] = useState<ApiAdminSummary | null>(null);
  const [adminSummaryLoading, setAdminSummaryLoading] = useState(false);
  const [adminSummaryError, setAdminSummaryError] = useState<string | null>(null);
  const [apiFeedbacks, setApiFeedbacks] = useState<ApiFeedback[]>([]);
  const [feedbackDetailId, setFeedbackDetailId] = useState<string | null>(null);
  const [feedbackDetailOpen, setFeedbackDetailOpen] = useState(false);

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
  const adminBoardConsultations = useMemo(() => {
    const child = visibleChildren.find((item) => item.id === "c-1");
    const existing = latestConsultations.find((item) => item.childId === "c-1");
    const defenseConsultation = buildAdminD01HighRiskConsultation({
      childName: child?.name,
      className: child?.className,
      generatedAt: existing?.generatedAt ?? new Date().toISOString(),
    });

    return [
      defenseConsultation,
      ...latestConsultations.filter((item) => item.childId !== "c-1"),
    ];
  }, [latestConsultations, visibleChildren]);
  const {
    priorityItems: consultationPriorityItems,
    notificationEvents,
    feedBadge,
    feedStatusMessage,
  } = useAdminConsultationWorkspace({
    institutionName: INSTITUTION_NAME,
    visibleChildren,
    localConsultations: adminBoardConsultations,
    consultationFeedOptions: {
      limit: 8,
      escalatedOnly: true,
    },
  });
  const localConsultationPriorityItems = useMemo(
    () =>
      buildAdminConsultationPriorityItems({
        institutionName: INSTITUTION_NAME,
        localConsultations: adminBoardConsultations,
        children: visibleChildren,
        notificationEvents,
        limit: 20,
        useLocalFallback: true,
      }),
    [adminBoardConsultations, notificationEvents, visibleChildren]
  );
  const priorityBoardItems = useMemo(() => {
    const seen = new Set<string>();
    const preferredXiaoyu = localConsultationPriorityItems.find((item) => item.childId === "c-1");
    return [preferredXiaoyu, ...consultationPriorityItems, ...localConsultationPriorityItems]
      .filter((item): item is AdminConsultationPriorityItem => Boolean(item))
      .filter((item) => !preferredXiaoyu || item.childId !== "c-1" || item.consultationId === preferredXiaoyu.consultationId)
      .filter((item) => {
        if (seen.has(item.consultationId)) return false;
        seen.add(item.consultationId);
        return true;
      })
      .slice(0, 8);
  }, [consultationPriorityItems, localConsultationPriorityItems]);
  const governancePriorityItems = useMemo(() => {
    const seen = new Set<string>();
    return [...priorityBoardItems, ...localConsultationPriorityItems, ...consultationPriorityItems].filter((item) => {
      if (seen.has(item.consultationId)) return false;
      seen.add(item.consultationId);
      return true;
    });
  }, [consultationPriorityItems, localConsultationPriorityItems, priorityBoardItems]);

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
    () => dedupeAdminHomeExposure(home, priorityBoardItems),
    [home, priorityBoardItems]
  );
  const mergedFamilyFeedbacks = useMemo(() => {
    const byId = new Map<string, GuardianFeedback>();
    [...guardianFeedbacks, ...apiFeedbacks].forEach((feedback) => {
      const feedbackId = feedback.feedbackId || feedback.id;
      if (!feedbackId) return;
      const existing = byId.get(feedbackId);
      if (!existing || feedbackTimestampOf(feedback).localeCompare(feedbackTimestampOf(existing)) >= 0) {
        byId.set(feedbackId, feedback as GuardianFeedback);
      }
    });

    return Array.from(byId.values()).sort((left, right) =>
      feedbackTimestampOf(right).localeCompare(feedbackTimestampOf(left))
    );
  }, [apiFeedbacks, guardianFeedbacks]);

  const familyFeedbackWritebacks = useMemo(() => {
    const preferredFeedbacks = ["c-1", "c-3"]
      .map((childId) => mergedFamilyFeedbacks.find((feedback) => feedback.childId === childId))
      .filter((feedback): feedback is GuardianFeedback => Boolean(feedback));
    const preferredIds = new Set(preferredFeedbacks.map((feedback) => feedback.feedbackId || feedback.id));

    return [
      ...preferredFeedbacks,
      ...mergedFamilyFeedbacks.filter((feedback) => !preferredIds.has(feedback.feedbackId || feedback.id)),
    ]
      .slice(0, 5)
      .map((feedback) => buildFamilyFeedbackWriteback(feedback, visibleChildren));
  }, [mergedFamilyFeedbacks, visibleChildren]);

  const latestFamilyFeedback = familyFeedbackWritebacks[0] ?? null;
  const communicationSummary = useMemo(
    () =>
      buildAdminCommunicationSummary({
        messages,
        conversations,
        children: visibleChildren,
      }),
    [conversations, messages, visibleChildren]
  );
  const governanceDemo = useMemo(
    () =>
      buildAdminGovernanceDemoViewModel({
        priorityItems: governancePriorityItems,
        home: displayHome,
        adminSummary,
        weeklyReport,
        familyFeedbacks: mergedFamilyFeedbacks,
        tasks,
        healthMaterials,
        growthRecords,
        mealRecords,
        children: visibleChildren,
      }),
    [
      adminSummary,
      displayHome,
      growthRecords,
      healthMaterials,
      mealRecords,
      mergedFamilyFeedbacks,
      governancePriorityItems,
      tasks,
      visibleChildren,
      weeklyReport,
    ]
  );
  const weeklyReportPayload = useMemo(
    () => ({
      role: "admin" as const,
      ...(resolveWeeklyReportScope({
        role: "admin",
        institutionId: currentUser.institutionId,
      }) ?? {}),
      snapshot: buildAdminWeeklyReportSnapshot(adminHomePayload, home.adminContext),
    }),
    [adminHomePayload, currentUser.institutionId, home.adminContext]
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

  useEffect(() => {
    let cancelled = false;

    async function loadAdminSummary() {
      setAdminSummaryLoading(true);
      setAdminSummaryError(null);
      try {
        const data = await getAdminSummary();
        if (!cancelled) setAdminSummary(data);
      } catch (error) {
        if (!cancelled) {
          setAdminSummary(null);
          setAdminSummaryError(error instanceof Error ? error.message : "Admin summary API unavailable.");
        }
      } finally {
        if (!cancelled) setAdminSummaryLoading(false);
      }
    }

    void loadAdminSummary();
    return () => {
      cancelled = true;
    };
  }, [weeklyReportRefreshNonce]);

  useEffect(() => {
    let cancelled = false;
    async function loadFeedback() {
      try {
        const data = await listApiFeedback();
        if (!cancelled) setApiFeedbacks(data);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "反馈详情读取失败。");
        }
      }
    }
    void loadFeedback();
    return () => {
      cancelled = true;
    };
  }, [weeklyReportRefreshNonce]);

  async function handleOpenFeedbackDetail() {
    let feedback = apiFeedbacks[0];
    if (!feedback) {
      try {
        const data = await listApiFeedback();
        setApiFeedbacks(data);
        feedback = data[0];
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "反馈详情读取失败。");
        return;
      }
    }
    if (!feedback) {
      toast.info("当前暂无可查看的反馈详情。");
      return;
    }
    setFeedbackDetailId(feedback.feedbackId);
    setFeedbackDetailOpen(true);
  }

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
        adminSummary={adminSummary}
        adminSummaryLoading={adminSummaryLoading}
        adminSummaryError={adminSummaryError}
        communicationSummary={communicationSummary}
        governanceDemo={governanceDemo}
        familyFeedbackWritebacks={familyFeedbackWritebacks}
        latestFamilyFeedback={latestFamilyFeedback}
        onMarkCommunicationHandled={handleMarkCommunicationHandled}
        onOpenFeedbackDetail={handleOpenFeedbackDetail}
        onRefresh={handleRefreshDashboard}
      />
      <FeedbackDetailDialog
        feedbackId={feedbackDetailId}
        open={feedbackDetailOpen}
        canUpdateStatus
        onOpenChange={setFeedbackDetailOpen}
        onUpdated={() => setWeeklyReportRefreshNonce((value) => value + 1)}
      />
      <section id="admin-risk-priority-detail" className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
        <div className="rounded-lg border border-amber-100 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">风险优先级板 · 高风险会诊承接</p>
              <p className="mt-1 text-xs text-slate-500">教师端生成的会诊会在这里形成园长决策卡、trace 证据和 48 小时复查承接。</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-amber-700">管理端可见 {priorityBoardItems.length} 条</p>
              {feedStatusMessage ? (
                <p className="mt-1 text-xs text-slate-500">{feedStatusMessage}</p>
              ) : null}
            </div>
          </div>
          <RiskPriorityBoard
            items={priorityBoardItems}
            layoutVariant="stacked"
            sourceBadgeLabel={feedBadge.label}
            sourceBadgeVariant={feedBadge.variant}
            dispatchAvailable={false}
            dispatchStatusMessage="答辩展示模式，保留只读承接"
            emptyTitle="风险优先级板已就绪"
            emptyDescription="教师端生成林小雨会诊后，这里会同步显示园长承接卡。"
          />
        </div>
      </section>
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
