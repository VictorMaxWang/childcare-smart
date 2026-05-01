"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertTriangle, ArrowLeft, ClipboardList, FileText, Home, MessageCircle, Settings, ShieldAlert, Sparkles, Stethoscope, Upload } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { TeacherContextStrip, TeacherMiniPanel } from "@/components/teacher/TeacherOperationKit";
import {
  InlineLinkButton,
  RolePageShell,
  RoleSplitLayout,
  SectionCard,
} from "@/components/role-shell/RoleScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  HealthFileBridgeContraindication,
  HealthFileBridgeFact,
  HealthFileBridgeFile,
  HealthFileBridgeFollowUpHint,
  HealthFileBridgeRequest,
  HealthFileBridgeResponse,
  HealthFileBridgeRiskItem,
  HealthFileBridgeSourceRole,
} from "@/lib/ai/types";
import { useApp } from "@/lib/store";

const NONE_CHILD_VALUE = "__none__";
const UNSPECIFIED_FILE_KIND_VALUE = "__unspecified__";
const REQUEST_SOURCE = "teacher-health-file-bridge-page";
const LOCAL_DEMO_PARSE_LABEL = "本地演示解析";

const FILE_KIND_OPTIONS = [
  { value: UNSPECIFIED_FILE_KIND_VALUE, label: "未指定" },
  { value: "health-note", label: "健康说明" },
  { value: "lab-report", label: "化验报告" },
  { value: "prescription", label: "医嘱 / 清单" },
  { value: "discharge-note", label: "复查 / 出院说明" },
  { value: "other", label: "其他材料" },
];

function formatBytes(value?: number) {
  if (!value || value <= 0) return "大小未知";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function getFileKindLabel(value?: string) {
  return FILE_KIND_OPTIONS.find((option) => option.value === value)?.label ?? "未指定";
}

function getSourceRoleLabel(value: HealthFileBridgeSourceRole) {
  return value === "parent" ? "家长补充" : "教师补充";
}

function getRiskSeverityLabel(level: HealthFileBridgeRiskItem["severity"]) {
  if (level === "high") return "高关注";
  if (level === "medium") return "需留意";
  return "一般提醒";
}

function formatResultBadge(label: string, active: boolean) {
  return <Badge variant={active ? "warning" : "secondary"}>{`${label}：${active ? "是" : "否"}`}</Badge>;
}

function toUploadMeta(file: File, index: number, previewText: string): HealthFileBridgeFile {
  const generatedId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${file.name}-${file.lastModified}-${index}`;

  return {
    fileId: generatedId,
    name: file.name,
    mimeType: file.type || undefined,
    sizeBytes: file.size || undefined,
    pageCount: undefined,
    previewText: previewText || undefined,
    meta: {
      lastModified: file.lastModified,
    },
  };
}

function riskVariant(level: HealthFileBridgeRiskItem["severity"]) {
  if (level === "high") return "destructive";
  if (level === "medium") return "warning";
  return "secondary";
}

function FactCard({ fact }: { fact: HealthFileBridgeFact }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">{fact.label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{fact.detail}</p>
    </div>
  );
}

function RiskCard({ risk }: { risk: HealthFileBridgeRiskItem }) {
  return (
    <div className="rounded-lg border border-rose-100 bg-rose-50/70 p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-900">{risk.title}</p>
        <Badge variant={riskVariant(risk.severity)}>{getRiskSeverityLabel(risk.severity)}</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{risk.detail}</p>
    </div>
  );
}

function buildSavedParseResult(result: HealthFileBridgeResponse, files: HealthFileBridgeFile[]) {
  const actionMapping = result.actionMapping;
  return {
    summary: result.summary,
    riskItems: result.riskItems,
    recommendations: [
      ...(actionMapping?.schoolTodayActions ?? []),
      ...(actionMapping?.familyTonightActions ?? []),
      ...(actionMapping?.followUpPlan ?? []),
    ].map((item) => ({
      title: item.title,
      detail: item.detail,
    })),
    attentionItems: [
      ...result.extractedFacts.map((item) => ({
        title: item.label,
        detail: item.detail,
      })),
      ...result.contraindications.map((item) => ({
        title: item.title,
        detail: item.detail,
      })),
    ],
    followUpHints: result.followUpHints,
    sourceLabel: LOCAL_DEMO_PARSE_LABEL,
    provenance: {
      fallback: result.fallback,
      mock: result.mock,
      provider: result.provider,
      model: result.model,
      generatedAt: result.generatedAt,
      files: files.map((file) => ({
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      })),
    },
    rawResponse: result,
  };
}

function readSavedRawResponse(parseResult: Record<string, unknown> | undefined) {
  const rawResponse = parseResult?.rawResponse;
  return rawResponse && typeof rawResponse === "object" ? (rawResponse as HealthFileBridgeResponse) : null;
}

function getHighestRiskLevel(result: HealthFileBridgeResponse | null): "low" | "medium" | "high" {
  if (!result || result.riskItems.length === 0) return "low";
  if (result.riskItems.some((item) => item.severity === "high")) return "high";
  if (result.riskItems.some((item) => item.severity === "medium")) return "medium";
  return "low";
}

function getParseStatusLabel(status: string) {
  if (status === "completed" || status === "parsed") return "已保存";
  if (status === "processing") return "解析中";
  if (status === "failed") return "解析失败";
  return "待解析";
}

function DetailCard({
  title,
  detail,
}: Pick<HealthFileBridgeContraindication, "title" | "detail"> | Pick<HealthFileBridgeFollowUpHint, "title" | "detail">) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

export default function TeacherHealthFileBridgePage() {
  const router = useRouter();
  const {
    currentUser,
    visibleChildren,
    healthMaterials,
    createHealthMaterialTask,
    updateHealthMaterialTaskStatus,
    saveHealthMaterialParseResult,
    failHealthMaterialParseResult,
    createConsultationRecord,
  } = useApp();
  const [childId, setChildId] = useState<string>(NONE_CHILD_VALUE);
  const [sourceRole, setSourceRole] = useState<HealthFileBridgeSourceRole>("teacher");
  const [fileKind, setFileKind] = useState<string>(UNSPECIFIED_FILE_KIND_VALUE);
  const [previewText, setPreviewText] = useState("");
  const [optionalNotes, setOptionalNotes] = useState("");
  const [files, setFiles] = useState<HealthFileBridgeFile[]>([]);
  const [result, setResult] = useState<HealthFileBridgeResponse | null>(null);
  const [pendingParseResult, setPendingParseResult] = useState<Record<string, unknown> | null>(null);
  const [activeMaterialId, setActiveMaterialId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [consultationMessage, setConsultationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const childMaterials = useMemo(
    () =>
      healthMaterials
        .filter((material) => material.childId === childId)
        .sort((left, right) =>
          (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt)
        ),
    [childId, healthMaterials]
  );

  useEffect(() => {
    if (childId !== NONE_CHILD_VALUE && visibleChildren.some((child) => child.id === childId)) {
      return;
    }
    setChildId(visibleChildren[0]?.id ?? NONE_CHILD_VALUE);
  }, [childId, visibleChildren]);

  const selectedChild = useMemo(
    () => visibleChildren.find((child) => child.id === childId) ?? null,
    [childId, visibleChildren]
  );

  useEffect(() => {
    if (result || activeMaterialId) return;
    const latestSaved = childMaterials.find(
      (material) => material.parseStatus === "completed" && material.parseResult
    );
    const savedResponse = readSavedRawResponse(latestSaved?.parseResult);
    if (!latestSaved || !savedResponse) return;
    setResult(savedResponse);
    setPendingParseResult(null);
    setActiveMaterialId(latestSaved.materialId);
    setSaveMessage(`已恢复 ${latestSaved.filename} 的保存结果。`);
  }, [activeMaterialId, childMaterials, result]);

  if (visibleChildren.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<Stethoscope className="h-6 w-6" />}
          title="当前暂无可用幼儿"
          description="请先进入教师工作台确认当前账号已关联可见幼儿，再进行健康文件解析。"
        />
      </div>
    );
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []).map((file, index) =>
      toUploadMeta(file, index, previewText.trim())
    );
    setFiles(nextFiles);
    setResult(null);
    setPendingParseResult(null);
    setActiveMaterialId(null);
    setSaveMessage(null);
    setConsultationMessage(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setPendingParseResult(null);
    setSaveMessage(null);
    setConsultationMessage(null);

    const manualText = [previewText.trim(), optionalNotes.trim()].filter(Boolean).join("\n");
    if (childId === NONE_CHILD_VALUE || !selectedChild) {
      setError("请先选择一名幼儿，解析结果需要绑定到具体孩子后才能保存。");
      return;
    }
    if (files.length === 0 && !manualText) {
      setError("请至少选择一份图片/PDF 材料，或输入材料说明。");
      return;
    }

    setIsSubmitting(true);
    const requestFiles =
      files.length > 0
        ? files
        : [
            {
              fileId: `manual-${Date.now()}`,
              name: "manual-health-material-note.txt",
              mimeType: "text/plain",
              sizeBytes: manualText.length,
              previewText: manualText,
            } satisfies HealthFileBridgeFile,
          ];

    const createdMaterial = createHealthMaterialTask({
      childId,
      filename: requestFiles[0]?.name ?? "manual-health-material-note.txt",
      fileType: requestFiles[0]?.mimeType ?? "text/plain",
      description: manualText || requestFiles.map((file) => file.name).join("、"),
    });

    if (createdMaterial.status === "failed" || !createdMaterial.data) {
      setIsSubmitting(false);
      setError(createdMaterial.error ?? createdMaterial.message ?? "创建解析任务失败。");
      return;
    }

    const materialId = createdMaterial.data.materialId;
    setActiveMaterialId(materialId);
    updateHealthMaterialTaskStatus({ materialId, status: "processing" });

    const requestPayload: HealthFileBridgeRequest = {
      childId,
      sourceRole,
      files: requestFiles.map((file) => ({
        ...file,
        previewText: previewText.trim() || file.previewText,
      })),
      fileKind: fileKind === UNSPECIFIED_FILE_KIND_VALUE ? undefined : fileKind,
      requestSource: REQUEST_SOURCE,
      optionalNotes: optionalNotes.trim() || undefined,
    };

    try {
      const response = await fetch("/api/ai/health-file-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });

      const body = (await response.json().catch(() => null)) as
        | HealthFileBridgeResponse
        | { error?: string; detail?: string }
        | null;

      if (!response.ok) {
        const message =
          (body && "error" in body && body.error) ||
          (body && "detail" in body && body.detail) ||
          "健康文件解析失败，请稍后重试。";
        throw new Error(message);
      }

      const nextResult = body as HealthFileBridgeResponse;
      setResult(nextResult);
      setPendingParseResult(buildSavedParseResult(nextResult, requestFiles));
      setSaveMessage("解析已完成，请核对后保存到健康材料记录。");
    } catch (submissionError) {
      failHealthMaterialParseResult({
        materialId,
        error: submissionError instanceof Error ? submissionError.message : "health_file_parse_failed",
      });
      setError(
        submissionError instanceof Error ? submissionError.message : "健康文件解析失败，请稍后重试。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSaveParseResult() {
    if (!activeMaterialId || !pendingParseResult) {
      setError("当前没有待保存的解析结果。");
      return;
    }
    const saved = saveHealthMaterialParseResult({
      materialId: activeMaterialId,
      parseResult: pendingParseResult,
    });
    if (saved.status === "failed") {
      setError(saved.error ?? saved.message ?? "保存解析结果失败。");
      return;
    }
    setPendingParseResult(null);
    setSaveMessage("解析结果已保存，刷新后仍可查看。");
  }

  function handleCreateConsultationFromResult() {
    if (!selectedChild || !result) {
      setError("请先完成并保存解析结果，再创建会诊。");
      return;
    }
    if (pendingParseResult) {
      setError("请先保存解析结果，再创建高风险会诊。");
      return;
    }
    const riskLevel = getHighestRiskLevel(result);
    const consultation = createConsultationRecord({
      childId: selectedChild.id,
      riskLevel,
      sourceMaterialId: activeMaterialId ?? undefined,
      summary: `${LOCAL_DEMO_PARSE_LABEL}触发：${result.summary}`,
      notes: [
        `来源材料：${childMaterials.find((material) => material.materialId === activeMaterialId)?.filename ?? "当前解析结果"}`,
        ...result.riskItems.map((item) => `${getRiskSeverityLabel(item.severity)}：${item.title}`),
      ].join("\n"),
      workflowStatus: "pending",
    });
    if (consultation.status === "failed" || !consultation.data) {
      setError(consultation.error ?? consultation.message ?? "创建会诊失败。");
      return;
    }
    setConsultationMessage("已创建高风险会诊，可在教师端和园长端查看。");
    router.push(
      `/teacher/high-risk-consultation?childId=${selectedChild.id}&consultationId=${consultation.data.consultationId}`
    );
  }

  return (
    <RolePageShell
      badge={`健康文件解析 · ${currentUser.className ?? "当前班级"}`}
      title="把外部健康材料整理成可复核的关键信息"
      description="上传材料后，系统会先提取事实、风险提示和后续提醒，方便老师快速核对并继续处理。"
      actions={
        <>
          <Button asChild variant="outline" className="min-h-11 rounded-xl">
            <Link href="/teacher/home" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              返回教师工作台
            </Link>
          </Button>
          <InlineLinkButton href="/teacher/agent" label="进入教师 AI 助手" variant="premium" />
        </>
      }
      headerVariant="hidden"
      className="max-w-[86rem]"
    >
      <RoleSplitLayout
        main={
          <div className="space-y-6">
            <section className="relative overflow-hidden rounded-[1.35rem] border border-indigo-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_46%,#f5f3ff_100%)] p-4 shadow-[0_24px_70px_rgb(99_102_241_/_0.13)] sm:p-5 xl:pl-[7.5rem]">
              <aside className="absolute bottom-5 left-5 top-5 hidden w-20 flex-col items-center justify-between rounded-[1.1rem] border border-[#e0e7f5] bg-white/92 py-4 shadow-[0_16px_38px_rgb(70_88_140_/_0.07)] xl:flex">
                <div className="space-y-4">
                  {[
                    [Home, "工作台", "/teacher/home", false],
                    [FileText, "幼儿档案", "/children", false],
                    [ClipboardList, "每日记录", "/growth", false],
                    [ShieldAlert, "健康管理", "/teacher/health-file-bridge", true],
                    [MessageCircle, "消息中心", "/teacher/agent?action=communication", false],
                    [Settings, "设置中心", "/teacher", false],
                  ].map(([Icon, label, href, active]) => {
                    const NavIcon = Icon as typeof Home;
                    return (
                      <Link
                        key={label as string}
                        href={href as string}
                        className={`relative flex h-14 w-14 items-center justify-center rounded-[0.9rem] ${active ? "bg-violet-100 text-violet-600" : "text-[#687493] hover:bg-slate-50"}`}
                        aria-label={label as string}
                      >
                        <NavIcon className="h-5 w-5" />
                        {label === "消息中心" ? <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">2</span> : null}
                      </Link>
                    );
                  })}
                </div>
              </aside>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="info" className="rounded-full px-3 py-1">教师端</Badge>
                    <Badge variant="outline" className="rounded-full px-3 py-1">健康材料整理 / 外部健康材料解析</Badge>
                  </div>
                  <h1 className="mt-4 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">健康材料解析</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    上传外部健康材料，先提取事实、风险和后续提醒，再由老师完成核对与归档。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" className="rounded-2xl">
                    <Link href="/teacher/home">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      返回教师工作台
                    </Link>
                  </Button>
                  <Button type="button" variant="premium" className="rounded-2xl" onClick={() => document.getElementById("health-file-submit")?.click()} disabled={isSubmitting}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {isSubmitting ? "解析中..." : "AI 智能解析"}
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-4">
                  <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-indigo-300 bg-white/86 p-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/60">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                      <Upload className="h-8 w-8" />
                    </span>
                    <span className="mt-4 text-base font-semibold text-slate-950">拖拽文件到此处，或点击上传</span>
                    <span className="mt-2 text-sm text-slate-500">支持 JPG、PNG、PDF，单次最多 10 个文件，大小不超过 20MB</span>
                    <input type="file" accept="image/*,.pdf" multiple onChange={handleFileChange} className="sr-only" />
                  </label>

                  <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">最近上传记录</p>
                  <Button type="button" variant="ghost" size="sm" className="rounded-full" disabled>全部文件</Button>
                </div>
                    {files.length > 0 ? (
                    <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
                      {files.slice(0, 4).map((file) => (
                        <div key={file.fileId ?? file.name} className="grid gap-3 bg-white px-4 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                            <FileText className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{file.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{file.mimeType || "未知类型"} · {formatBytes(file.sizeBytes)}</p>
                          </div>
                          <Badge variant={result ? (result.fallback || result.mock ? "warning" : "success") : "outline"}>
                            {result ? (result.fallback || result.mock ? "本地兜底结果" : "解析完成") : "等待解析"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        尚未选择健康材料。请先在下方上传图片或 PDF，再开始结构化解析。
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-950">解析与核对流程</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      {[
                        ["1", "上传材料", "选择或拖拽健康材料"],
                        ["2", "AI 解析", "提取关键信息"],
                        ["3", "人工核对", "确认信息准确性"],
                        ["4", "归档完成", "生成健康档案"],
                      ].map(([step, title, detail], index) => (
                        <div key={step} className={`rounded-2xl border p-4 ${index <= (result ? 3 : files.length > 0 ? 1 : 0) ? "border-indigo-100 bg-indigo-50/70" : "border-slate-100 bg-slate-50"}`}>
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-semibold text-indigo-700">{step}</span>
                          <p className="mt-3 text-sm font-semibold text-slate-950">{title}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-2xl">👦</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{selectedChild?.name ?? "暂不关联幼儿"}</p>
                        <p className="mt-1 text-xs text-slate-500">{selectedChild?.className ?? currentUser.className ?? "当前班级"}</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 w-full rounded-2xl"
                      disabled={visibleChildren.length <= 1}
                      onClick={() => {
                        const currentIndex = visibleChildren.findIndex((child) => child.id === childId);
                        const nextChild = visibleChildren[(currentIndex + 1) % visibleChildren.length];
                        setChildId(nextChild?.id ?? NONE_CHILD_VALUE);
                      }}
                    >
                      {visibleChildren.length <= 1 ? "仅有当前幼儿" : "更换关联幼儿"}
                    </Button>
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-950">材料信息</p>
                    <div className="mt-4 space-y-3 text-sm text-slate-600">
                      <div className="rounded-xl bg-slate-50 px-3 py-2">文件名称：{files[0]?.name ?? "尚未选择文件"}</div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">来源：{getSourceRoleLabel(sourceRole)}</div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">材料类型：{getFileKindLabel(fileKind)}</div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-950">关键摘要</p>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {result?.summary ?? "上传后会在这里显示 AI 提取的检查日期、机构、结论与后续提醒。"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-950">待处理任务</p>
                    <div className="mt-4 flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                      <span className="text-sm text-slate-600">{result ? "确认无误，归档" : "等待上传"}</span>
                      <Badge variant={result ? "success" : "outline"}>{result ? "1 项待处理" : "0 项待处理"}</Badge>
                    </div>
                  </div>
                </aside>
              </div>
            </section>

            <TeacherContextStrip
              items={[
                { label: "解析对象", value: selectedChild?.name ?? "暂不关联", tone: "indigo" },
                { label: "材料类型", value: getFileKindLabel(fileKind), tone: "sky" },
                { label: "材料数量", value: `${files.length}份`, tone: files.length > 0 ? "emerald" : "amber" },
                { label: "补充来源", value: getSourceRoleLabel(sourceRole), tone: sourceRole === "teacher" ? "indigo" : "sky" },
              ]}
            />
            <TeacherMiniPanel title="解析前核对" badge={files.length > 0 ? "材料已选择" : "等待上传"} tone={files.length > 0 ? "emerald" : "amber"}>
              <div className="grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3">
                <p className="rounded-lg bg-white/80 px-3 py-2">优先补充 OCR 文字或老师已确认事实，减少误读。</p>
                <p className="rounded-lg bg-white/80 px-3 py-2">解析结果先用于核对风险、谨慎事项和后续提醒。</p>
                <p className="rounded-lg bg-white/80 px-3 py-2">最终处置仍以原始材料和老师判断为准。</p>
              </div>
            </TeacherMiniPanel>
            <SectionCard
              title="发起解析"
              description="上传材料后，可补充 OCR 文字或老师已确认的事实，帮助系统更快整理关键信息。"
            >
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900">关联幼儿</p>
                    <Select value={childId} onValueChange={setChildId}>
                      <SelectTrigger>
                        <SelectValue placeholder="请选择幼儿" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_CHILD_VALUE}>暂不关联具体幼儿</SelectItem>
                        {visibleChildren.map((child) => (
                          <SelectItem key={child.id} value={child.id}>
                            {child.name} · {child.className}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900">补充来源</p>
                    <Select
                      value={sourceRole}
                      onValueChange={(value) => setSourceRole(value as HealthFileBridgeSourceRole)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="请选择来源" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="teacher">教师补充</SelectItem>
                        <SelectItem value="parent">家长补充</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900">材料类型</p>
                    <Select value={fileKind} onValueChange={setFileKind}>
                      <SelectTrigger>
                        <SelectValue placeholder="请选择材料类型" />
                      </SelectTrigger>
                      <SelectContent>
                        {FILE_KIND_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900">上传图片 / PDF</p>
                    <Input
                      data-testid="d05-health-file-input"
                      type="file"
                      accept="image/*,.pdf"
                      multiple
                      onChange={handleFileChange}
                    />
                    <p className="text-xs leading-5 text-slate-500">
                      当前会先结合文件信息与补充文字整理重点内容，最终仍建议老师结合原始材料复核。
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">OCR 预览 / 已提取文字</p>
                  <Textarea
                    data-testid="d05-health-preview-text"
                    value={previewText}
                    onChange={(event) => setPreviewText(event.target.value)}
                    placeholder="例如：体温 38.1℃，建议明早复查，今晚继续雾化。"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">补充说明</p>
                  <Textarea
                    value={optionalNotes}
                    onChange={(event) => setOptionalNotes(event.target.value)}
                    placeholder="只补充有助于理解材料的事实信息，例如时间、复查要求或医生提示。"
                  />
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4 text-indigo-500" />
                    <p className="text-sm font-semibold text-slate-900">已选材料</p>
                  </div>
                  <div className="mt-3 space-y-3">
                    {files.length > 0 ? (
                      files.map((file) => (
                        <div key={file.fileId ?? file.name} className="rounded-lg bg-white p-3">
                          <p className="text-sm font-medium text-slate-900">{file.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {(file.mimeType || "文件类型未识别")} · {formatBytes(file.sizeBytes)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">暂未选择材料。</p>
                    )}
                  </div>
                </div>

                {error ? <p className="text-sm text-rose-600">{error}</p> : null}

                <div className="flex flex-wrap gap-3">
                  <Button
                    id="health-file-submit"
                    data-testid="d05-start-parse"
                    type="submit"
                    variant="premium"
                    className="min-h-11 rounded-xl"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "解析中…" : "开始结构化解析"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 rounded-xl"
                    onClick={() => {
                      setPreviewText("");
                      setOptionalNotes("");
                      setFiles([]);
                      setResult(null);
                      setPendingParseResult(null);
                      setActiveMaterialId(null);
                      setSaveMessage(null);
                      setConsultationMessage(null);
                      setError(null);
                    }}
                    disabled={isSubmitting}
                  >
                    清空重填
                  </Button>
                </div>
              </form>
            </SectionCard>

            <SectionCard
              title="提取到的关键信息"
              description="这里先展示从材料中整理出的事实信息，便于老师快速核对。"
            >
              <div className="space-y-3">
                {result ? (
                  result.extractedFacts.length > 0 ? (
                    result.extractedFacts.map((fact) => <FactCard key={`${fact.label}-${fact.detail}`} fact={fact} />)
                  ) : (
                    <p className="text-sm text-slate-500">当前材料里还没有提取到明确事实信息。</p>
                  )
                ) : (
                  <p className="text-sm text-slate-500">发起解析后，这里会显示整理出的关键信息。</p>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="需重点留意"
              description="系统会先标出值得进一步核对的风险提醒，方便老师结合原始材料复查。"
            >
              <div className="space-y-3">
                {result ? (
                  result.riskItems.length > 0 ? (
                    result.riskItems.map((risk) => <RiskCard key={`${risk.title}-${risk.detail}`} risk={risk} />)
                  ) : (
                    <p className="text-sm text-slate-500">当前材料里没有提取到明确的风险提醒。</p>
                  )
                ) : (
                  <p className="text-sm text-slate-500">发起解析后，这里会显示需重点留意的内容。</p>
                )}
              </div>
            </SectionCard>

            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard
                title="谨慎事项"
                description="这里整理材料中提到的谨慎事项，方便老师后续处理时一并核对。"
              >
                <div className="space-y-3">
                  {result ? (
                    result.contraindications.length > 0 ? (
                      result.contraindications.map((item) => (
                        <DetailCard key={`${item.title}-${item.detail}`} title={item.title} detail={item.detail} />
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">当前材料里没有提取到明确的谨慎事项。</p>
                    )
                  ) : (
                    <p className="text-sm text-slate-500">发起解析后，这里会显示谨慎事项。</p>
                  )}
                </div>
              </SectionCard>

              <SectionCard
                title="后续提醒"
                description="这里展示材料里提到的复查或后续跟进提示，便于老师继续安排。"
              >
                <div className="space-y-3">
                  {result ? (
                    result.followUpHints.length > 0 ? (
                      result.followUpHints.map((item) => (
                        <DetailCard key={`${item.title}-${item.detail}`} title={item.title} detail={item.detail} />
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">当前材料里没有提取到明确的后续提醒。</p>
                    )
                  ) : (
                    <p className="text-sm text-slate-500">发起解析后，这里会显示后续提醒。</p>
                  )}
                </div>
              </SectionCard>
            </div>
          </div>
        }
        aside={
          <div className="space-y-6">
            <SectionCard
              title="使用说明"
              description="这一步先帮助老师把材料内容整理清楚，后续处置仍需结合原始材料判断。"
            >
              <ul className="space-y-3 text-sm leading-6 text-slate-600">
                <li>当前先返回结构化整理结果，方便老师快速核对重点。</li>
                <li>如材料信息较复杂，请优先以原始文件内容为准。</li>
                <li>解析结果可作为后续沟通和处理的参考，但不替代老师判断。</li>
                <li>如需进一步处置，建议结合班级情况继续跟进。</li>
              </ul>
            </SectionCard>

            <SectionCard
              title="本次解析信息"
              description="方便老师确认当前提交的是哪位幼儿、哪类材料与多少份文件。"
            >
              <div className="space-y-3 text-sm text-slate-600">
                <div className="rounded-lg bg-white p-4">
                  <p className="font-semibold text-slate-900">关联幼儿</p>
                  <p className="mt-1">
                    {selectedChild ? `${selectedChild.name} · ${selectedChild.className}` : "暂不关联具体幼儿"}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-4">
                  <p className="font-semibold text-slate-900">补充来源</p>
                  <p className="mt-1">{getSourceRoleLabel(sourceRole)}</p>
                </div>
                <div className="rounded-lg bg-white p-4">
                  <p className="font-semibold text-slate-900">材料类型</p>
                  <p className="mt-1">{getFileKindLabel(fileKind)}</p>
                </div>
                <div className="rounded-lg bg-white p-4">
                  <p className="font-semibold text-slate-900">材料数量</p>
                  <p className="mt-1">{files.length} 份</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="解析结果摘要"
              description="这里先汇总本次结果的完整度与老师需要继续复核的部分。"
            >
              {result ? (
                  <div data-testid="d05-parse-result" className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="info">{`识别置信度 ${Math.round(result.confidence * 100)}%`}</Badge>
                    <Badge variant="secondary">{`材料类型 ${getFileKindLabel(result.fileType)}`}</Badge>
                    <Badge variant="warning">{LOCAL_DEMO_PARSE_LABEL}</Badge>
                    {result.fallback || result.mock ? (
                      <Badge variant="warning">当前使用本地兜底结果</Badge>
                    ) : null}
                    {result.liveReadyButNotVerified ? formatResultBadge("建议继续复核原件", true) : null}
                  </div>
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-indigo-600" />
                      <p className="text-sm font-semibold text-slate-900">结果摘要</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{result.summary}</p>
                    <p className="mt-3 text-xs leading-5 text-slate-500">{result.disclaimer}</p>
                  </div>
                  {saveMessage ? (
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-3 text-sm text-emerald-700">
                      {saveMessage}
                    </div>
                  ) : null}
                  {consultationMessage ? (
                    <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-3 text-sm text-indigo-700">
                      {consultationMessage}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    <Button
                      data-testid="d05-save-parse"
                      type="button"
                      variant="premium"
                      className="rounded-xl"
                      onClick={handleSaveParseResult}
                      disabled={!pendingParseResult || !activeMaterialId}
                    >
                      保存解析结果
                    </Button>
                    <Button
                      data-testid="d05-create-consultation"
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      onClick={handleCreateConsultationFromResult}
                      disabled={!activeMaterialId || Boolean(pendingParseResult)}
                    >
                      从结果创建高风险会诊
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">发起解析后，这里会汇总结果摘要与复核提醒。</p>
              )}
            </SectionCard>

            <SectionCard
              title="历史解析任务"
              description="这些任务来自 D01 共享演示数据，刷新后仍会保留。"
            >
              <div data-testid="d05-health-history" className="space-y-3">
                {childMaterials.length > 0 ? (
                  childMaterials.slice(0, 5).map((material) => {
                    const savedResponse = readSavedRawResponse(material.parseResult);
                    return (
                      <button
                        key={material.materialId}
                        type="button"
                        className="w-full rounded-lg border border-slate-100 bg-white p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40"
                        onClick={() => {
                          const rawResponse = readSavedRawResponse(material.parseResult);
                          if (rawResponse) {
                            setResult(rawResponse);
                            setPendingParseResult(null);
                            setActiveMaterialId(material.materialId);
                            setSaveMessage(`已打开 ${material.filename} 的保存结果。`);
                            setConsultationMessage(null);
                          }
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{material.filename}</p>
                          <Badge variant={material.parseStatus === "failed" ? "destructive" : material.parseStatus === "completed" ? "success" : "secondary"}>
                            {getParseStatusLabel(material.parseStatus)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          {savedResponse?.summary ?? material.description ?? material.parseError ?? "暂无解析摘要。"}
                        </p>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500">当前幼儿还没有健康材料解析任务。</p>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="老师处理建议"
              description="先用解析结果缩短阅读时间，再结合原始材料做最后确认。"
            >
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <p className="text-sm font-semibold text-slate-900">先看重点，再核对原件</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    当前结果更适合作为老师快速读材料的第一步，遇到关键结论时仍建议回看原始图片或 PDF。
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-slate-700" />
                    <p className="text-sm font-semibold text-slate-900">先完成解析，再决定后续动作</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    这一步会先整理事实、风险提示和后续提醒，后续处置建议仍需要老师结合班级情况继续判断。
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>
        }
      />
    </RolePageShell>
  );
}
