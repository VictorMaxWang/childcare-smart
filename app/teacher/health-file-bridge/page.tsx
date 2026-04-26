"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertTriangle, ArrowLeft, FileText, ShieldAlert, Stethoscope, Upload } from "lucide-react";
import EmptyState from "@/components/EmptyState";
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
    <div className="rounded-3xl border border-slate-100 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">{fact.label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{fact.detail}</p>
    </div>
  );
}

function RiskCard({ risk }: { risk: HealthFileBridgeRiskItem }) {
  return (
    <div className="rounded-3xl border border-rose-100 bg-rose-50/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-900">{risk.title}</p>
        <Badge variant={riskVariant(risk.severity)}>{getRiskSeverityLabel(risk.severity)}</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{risk.detail}</p>
    </div>
  );
}

function DetailCard({
  title,
  detail,
}: Pick<HealthFileBridgeContraindication, "title" | "detail"> | Pick<HealthFileBridgeFollowUpHint, "title" | "detail">) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

export default function TeacherHealthFileBridgePage() {
  const { currentUser, visibleChildren } = useApp();
  const [childId, setChildId] = useState<string>(NONE_CHILD_VALUE);
  const [sourceRole, setSourceRole] = useState<HealthFileBridgeSourceRole>("teacher");
  const [fileKind, setFileKind] = useState<string>(UNSPECIFIED_FILE_KIND_VALUE);
  const [previewText, setPreviewText] = useState("");
  const [optionalNotes, setOptionalNotes] = useState("");
  const [files, setFiles] = useState<HealthFileBridgeFile[]>([]);
  const [result, setResult] = useState<HealthFileBridgeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (files.length === 0) {
      setError("请至少选择一份图片或 PDF 材料。");
      return;
    }

    setIsSubmitting(true);

    const requestPayload: HealthFileBridgeRequest = {
      childId: childId === NONE_CHILD_VALUE ? undefined : childId,
      sourceRole,
      files: files.map((file) => ({
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

      setResult(body as HealthFileBridgeResponse);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : "健康文件解析失败，请稍后重试。"
      );
    } finally {
      setIsSubmitting(false);
    }
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
    >
      <RoleSplitLayout
        main={
          <div className="space-y-6">
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
                    <Input type="file" accept="image/*,.pdf" multiple onChange={handleFileChange} />
                    <p className="text-xs leading-5 text-slate-500">
                      当前会先结合文件信息与补充文字整理重点内容，最终仍建议老师结合原始材料复核。
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">OCR 预览 / 已提取文字</p>
                  <Textarea
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

                <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4 text-indigo-500" />
                    <p className="text-sm font-semibold text-slate-900">已选材料</p>
                  </div>
                  <div className="mt-3 space-y-3">
                    {files.length > 0 ? (
                      files.map((file) => (
                        <div key={file.fileId ?? file.name} className="rounded-2xl bg-white p-3">
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
                  <Button type="submit" variant="premium" className="min-h-11 rounded-xl" disabled={isSubmitting}>
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
                <div className="rounded-2xl bg-white p-4">
                  <p className="font-semibold text-slate-900">关联幼儿</p>
                  <p className="mt-1">
                    {selectedChild ? `${selectedChild.name} · ${selectedChild.className}` : "暂不关联具体幼儿"}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="font-semibold text-slate-900">补充来源</p>
                  <p className="mt-1">{getSourceRoleLabel(sourceRole)}</p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="font-semibold text-slate-900">材料类型</p>
                  <p className="mt-1">{getFileKindLabel(fileKind)}</p>
                </div>
                <div className="rounded-2xl bg-white p-4">
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
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="info">{`识别置信度 ${Math.round(result.confidence * 100)}%`}</Badge>
                    <Badge variant="secondary">{`材料类型 ${getFileKindLabel(result.fileType)}`}</Badge>
                    {result.fallback || result.mock ? (
                      <Badge variant="warning">当前使用本地兜底结果</Badge>
                    ) : null}
                    {result.liveReadyButNotVerified ? formatResultBadge("建议继续复核原件", true) : null}
                  </div>
                  <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-indigo-600" />
                      <p className="text-sm font-semibold text-slate-900">结果摘要</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{result.summary}</p>
                    <p className="mt-3 text-xs leading-5 text-slate-500">{result.disclaimer}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">发起解析后，这里会汇总结果摘要与复核提醒。</p>
              )}
            </SectionCard>

            <SectionCard
              title="老师处理建议"
              description="先用解析结果缩短阅读时间，再结合原始材料做最后确认。"
            >
              <div className="space-y-3">
                <div className="rounded-3xl border border-amber-100 bg-amber-50/60 p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <p className="text-sm font-semibold text-slate-900">先看重点，再核对原件</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    当前结果更适合作为老师快速读材料的第一步，遇到关键结论时仍建议回看原始图片或 PDF。
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-white p-4">
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
