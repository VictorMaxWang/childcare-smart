"use client";

import { useMemo, useState } from "react";
import { BookOpenCheck, Clock3, HeartPulse, Search, Trash2, UserPlus, Users, Utensils } from "lucide-react";
import {
  formatDisplayDate,
  getAgeBandFromBirthDate,
  getAgeText,
  INSTITUTION_NAME,
  type Child,
  type Gender,
  type Guardian,
  useApp,
} from "@/lib/store";
import ScrollReveal from "@/components/ScrollReveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { FilterBar } from "@/components/ui/filter-bar";
import { FormField } from "@/components/ui/form-field";
import EmptyState from "@/components/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusTag } from "@/components/ui/status-tag";
import { Textarea } from "@/components/ui/textarea";
import { TeacherActionTile, TeacherMiniPanel } from "@/components/teacher/TeacherOperationKit";
import { toast } from "sonner";

export default function ChildrenPage() {
  const {
    currentUser,
    visibleChildren,
    getTodayAttendance,
    addChild,
    removeChild,
    toggleTodayAttendance,
  } = useApp();

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    nickname: "",
    birthDate: "2023-01-01",
    gender: "男" as Gender,
    allergies: "",
    heightCm: "95",
    weightKg: "14",
    guardianName: "",
    guardianRelation: "母亲",
    guardianPhone: "",
    className: currentUser.className ?? "向阳班",
    specialNotes: "",
  });
  const [error, setError] = useState("");

  const canManage = currentUser.role !== "家长";
  const isTeacher = currentUser.role === "教师";
  const todayAttendance = getTodayAttendance();

  const attendanceMap = useMemo(() => {
    return new Map(todayAttendance.map((item) => [item.childId, item]));
  }, [todayAttendance]);

  const filteredChildren = useMemo(() => {
    return visibleChildren.filter((child) => {
      const attendance = attendanceMap.get(child.id);
      const text = [
        child.name,
        child.nickname,
        child.className,
        child.guardians.map((guardian) => guardian.name).join(" "),
        child.allergies.join(" "),
        getAgeBandFromBirthDate(child.birthDate),
        attendance?.isPresent ? "出勤" : "缺勤",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(search.toLowerCase());
    });
  }, [attendanceMap, search, visibleChildren]);

  const ageBandStats = visibleChildren.reduce<Record<string, number>>((acc, child) => {
    const band = getAgeBandFromBirthDate(child.birthDate);
    acc[band] = (acc[band] ?? 0) + 1;
    return acc;
  }, {});

  function resetForm() {
    setForm({
      name: "",
      nickname: "",
      birthDate: "2023-01-01",
      gender: "男",
      allergies: "",
      heightCm: "95",
      weightKg: "14",
      guardianName: "",
      guardianRelation: "母亲",
      guardianPhone: "",
      className: currentUser.className ?? "向阳班",
      specialNotes: "",
    });
    setError("");
  }

  function handleSubmit() {
    if (!form.name.trim() || !form.birthDate || !form.guardianName.trim()) {
      setError("请至少填写姓名、出生日期和一位监护人信息。");
      toast.warning("请至少填写姓名、出生日期和一位监护人信息。", {
        description: "补齐必填项后才能保存幼儿档案。",
      });
      return;
    }

    const guardian: Guardian = {
      name: form.guardianName.trim(),
      relation: form.guardianRelation.trim(),
      phone: form.guardianPhone.trim() || "待补充",
    };

    addChild({
      name: form.name.trim(),
      nickname: form.nickname.trim(),
      birthDate: form.birthDate,
      gender: form.gender,
      allergies: form.allergies
        .split(/[，,]/)
        .map((item) => item.trim())
        .filter(Boolean),
      heightCm: Number(form.heightCm) || 0,
      weightKg: Number(form.weightKg) || 0,
      guardians: [guardian],
      institutionId: currentUser.institutionId,
      className: form.className.trim() || currentUser.className || "向阳班",
      specialNotes: form.specialNotes.trim(),
      parentUserId: currentUser.role === "家长" ? currentUser.id : undefined,
    });

    setOpen(false);
    toast.success("幼儿档案已保存", {
      description: `${form.name.trim()} 已加入档案列表。`,
    });
    resetForm();
  }

  return (
    <div className="app-page page-enter">
      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-indigo-100 bg-linear-to-r from-white via-indigo-50/60 to-sky-50 p-5 shadow-[var(--shadow-card)] lg:flex-row lg:items-start lg:justify-between sm:p-6">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-800">
            <Users className="h-8 w-8 text-indigo-500" />
            儿童档案
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            已升级为“出生日期 + 自动年龄段 + 每日出勤记录”模型，支持到离园统计、缺勤原因和后续周/月报表扩展。
          </p>
        </div>
        <Button
          onClick={() => canManage && setOpen(true)}
          disabled={!canManage}
          className="gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <UserPlus className="h-4 w-4" />
          {canManage ? "新增幼儿档案" : "家长端仅可查看"}
        </Button>
      </div>

      <ScrollReveal>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="当前可见幼儿" value={`${visibleChildren.length}位`} tone="primary" />
          <MetricCard label="今日出勤" value={`${todayAttendance.filter((item) => item.isPresent).length}位`} tone="success" />
          <MetricCard label="今日缺勤" value={`${todayAttendance.filter((item) => !item.isPresent).length}位`} tone="warning" />
          <MetricCard
            label="机构 / 班级"
            value={currentUser.className ? `${INSTITUTION_NAME} · ${currentUser.className}` : INSTITUTION_NAME}
            tone="info"
          />
        </div>
      </ScrollReveal>

      {isTeacher ? (
        <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-3 sm:grid-cols-3">
            <TeacherActionTile
              href="/health"
              icon={<HeartPulse className="h-5 w-5" />}
              title="晨检补录"
              description="按儿童卡片快速进入今日晨检、异常和待检状态。"
              tone="sky"
            />
            <TeacherActionTile
              href="/diet"
              icon={<Utensils className="h-5 w-5" />}
              title="饮食记录"
              description="从班级名单进入餐次录入、饮水和过敏拦截。"
              tone="emerald"
            />
            <TeacherActionTile
              href="/growth"
              icon={<BookOpenCheck className="h-5 w-5" />}
              title="成长观察"
              description="围绕当前班级幼儿补充观察标签和复查动作。"
              tone="indigo"
            />
          </div>
          <TeacherMiniPanel title="班级名册状态" badge={currentUser.className ?? "当前班级"} tone="sky">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-semibold text-slate-950">{visibleChildren.length}</p>
                <p className="mt-1 text-xs text-slate-500">可见幼儿</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-emerald-600">{todayAttendance.filter((item) => item.isPresent).length}</p>
                <p className="mt-1 text-xs text-slate-500">今日出勤</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-amber-600">{todayAttendance.filter((item) => !item.isPresent).length}</p>
                <p className="mt-1 text-xs text-slate-500">今日缺勤</p>
              </div>
            </div>
          </TeacherMiniPanel>
        </div>
      ) : null}

      <FilterBar
        className="mb-6"
        search={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-10"
              placeholder="搜索姓名、监护人、班级、年龄段、出勤状态…"
            />
          </div>
        }
        filters={
          <div className="flex flex-wrap gap-2">
            {Object.entries(ageBandStats).map(([label, count]) => (
              <Badge key={label} variant="secondary" className="px-3 py-1 text-xs">
                {label}：{count}
              </Badge>
            ))}
          </div>
        }
      />

      {filteredChildren.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="未找到匹配档案"
          description="请尝试调整搜索关键词，或先新增一位幼儿档案。"
          actionLabel={canManage ? "新增幼儿档案" : undefined}
          onAction={canManage ? () => setOpen(true) : undefined}
        />
      ) : (
        <>
          <DataTableShell
            className="hidden lg:block"
            title="幼儿档案台账"
            description="桌面端按管理台账展示，保留出勤、监护人、过敏、身高体重和操作入口。"
            footer={<span>共 {filteredChildren.length} 条档案</span>}
          >
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-5 py-3">幼儿</th>
                  <th className="px-5 py-3">班级 / 年龄</th>
                  <th className="px-5 py-3">监护人</th>
                  <th className="px-5 py-3">身高体重</th>
                  <th className="px-5 py-3">过敏与关注</th>
                  <th className="px-5 py-3">今日状态</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredChildren.map((child) => {
                  const attendance = attendanceMap.get(child.id);
                  const isPresent = attendance?.isPresent ?? false;
                  return (
                    <tr key={child.id} className="transition hover:bg-slate-50/80">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-xl">
                            {child.avatar}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{child.name}</p>
                            <p className="text-xs text-slate-500">{child.nickname || "无昵称"} · {child.gender}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        <p>{child.className}</p>
                        <p className="mt-1 text-xs text-slate-500">{getAgeText(child.birthDate)}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        <p>{child.guardians.map((guardian) => `${guardian.name}（${guardian.relation}）`).join("、")}</p>
                        <p className="mt-1 text-xs text-slate-500">{child.guardians.map((guardian) => guardian.phone).join(" / ")}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {child.heightCm > 0 ? `${child.heightCm} cm` : "--"} / {child.weightKg > 0 ? `${child.weightKg} kg` : "--"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="max-w-64 space-y-1 text-xs text-slate-600">
                          <p className="line-clamp-2">过敏：{child.allergies.length > 0 ? child.allergies.join("、") : "暂无"}</p>
                          <p className="line-clamp-2">关注：{child.specialNotes || "暂无"}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusTag variant={isPresent ? "success" : "neutral"} showDot>
                          {isPresent ? "今日出勤" : "今日缺勤"}
                        </StatusTag>
                        <p className="mt-2 text-xs text-slate-500">
                          {isPresent
                            ? `入园 ${attendance?.checkInAt ?? "--"} · 离园 ${attendance?.checkOutAt ?? "--"}`
                            : `原因：${attendance?.absenceReason || "未登记"}`}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {canManage ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  toggleTodayAttendance(child.id);
                                  toast.success(`已切换 ${child.name} 的今日出勤状态`);
                                }}
                              >
                                切换出勤
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeleteId(child.id)}>
                                删除
                              </Button>
                            </>
                          ) : (
                            <StatusTag variant="neutral">仅查看</StatusTag>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTableShell>

          <div className="grid grid-cols-1 gap-5 lg:hidden">
            {filteredChildren.map((child) => {
              const attendance = attendanceMap.get(child.id);
              return (
                <ChildArchiveCard
                  key={child.id}
                  child={child}
                  canManage={canManage}
                  attendance={attendance}
                  onDelete={() => setDeleteId(child.id)}
                  onToggleAttendance={() => {
                    toggleTodayAttendance(child.id);
                    toast.success(`已切换 ${child.name} 的今日出勤状态`);
                  }}
                />
              );
            })}
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={(value) => (!value ? (setOpen(false), resetForm()) : setOpen(true))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新增儿童档案</DialogTitle>
            <DialogDescription>使用出生日期自动计算年龄段，无需手填年龄数字。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <FormField label="姓名" required error={error && !form.name.trim() ? "请填写幼儿姓名。" : undefined}>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                aria-invalid={Boolean(error && !form.name.trim())}
              />
            </FormField>
            <FormField label="昵称" description="可选，用于教师和家长日常识别。">
              <Input value={form.nickname} onChange={(event) => setForm((prev) => ({ ...prev, nickname: event.target.value }))} />
            </FormField>
            <FormField
              label="出生日期"
              required
              description={`自动年龄段：${getAgeBandFromBirthDate(form.birthDate)}`}
              error={error && !form.birthDate ? "请填写出生日期。" : undefined}
            >
              <Input
                type="date"
                value={form.birthDate}
                onChange={(event) => setForm((prev) => ({ ...prev, birthDate: event.target.value }))}
                aria-invalid={Boolean(error && !form.birthDate)}
              />
            </FormField>
            <FormField label="性别">
              <div className="flex gap-2">
                {(["男", "女"] as Gender[]).map((gender) => (
                  <Button
                    key={gender}
                    type="button"
                    variant={form.gender === gender ? "default" : "outline"}
                    className="min-h-11 flex-1 sm:min-h-10"
                    onClick={() => setForm((prev) => ({ ...prev, gender }))}
                  >
                    {gender}
                  </Button>
                ))}
              </div>
            </FormField>
            <FormField label="身高（cm）">
              <Input value={form.heightCm} onChange={(event) => setForm((prev) => ({ ...prev, heightCm: event.target.value }))} />
            </FormField>
            <FormField label="体重（kg）">
              <Input value={form.weightKg} onChange={(event) => setForm((prev) => ({ ...prev, weightKg: event.target.value }))} />
            </FormField>
            <FormField label="监护人姓名" required error={error && !form.guardianName.trim() ? "请填写至少一位监护人。" : undefined}>
              <Input
                value={form.guardianName}
                onChange={(event) => setForm((prev) => ({ ...prev, guardianName: event.target.value }))}
                aria-invalid={Boolean(error && !form.guardianName.trim())}
              />
            </FormField>
            <FormField label="关系 / 联系电话" description="电话可后续补充，系统会保留监护人关系。">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  value={form.guardianRelation}
                  onChange={(event) => setForm((prev) => ({ ...prev, guardianRelation: event.target.value }))}
                />
                <Input
                  value={form.guardianPhone}
                  onChange={(event) => setForm((prev) => ({ ...prev, guardianPhone: event.target.value }))}
                />
              </div>
            </FormField>
            <FormField label="过敏信息（逗号分隔）" className="md:col-span-2">
              <Input
                value={form.allergies}
                onChange={(event) => setForm((prev) => ({ ...prev, allergies: event.target.value }))}
                placeholder="如：牛奶，芒果"
              />
            </FormField>
            <FormField label="所属机构 / 班级" className="md:col-span-2">
              <Input
                value={form.className}
                onChange={(event) => setForm((prev) => ({ ...prev, className: event.target.value }))}
                placeholder="如：向阳班"
              />
            </FormField>
            <FormField label="特殊关注项" className="md:col-span-2">
              <Textarea
                value={form.specialNotes}
                onChange={(event) => setForm((prev) => ({ ...prev, specialNotes: event.target.value }))}
                placeholder="如：午睡困难、过渡期社交适应等"
              />
            </FormField>
          </div>
          {error ? (
            <p className="rounded-lg border border-(--danger-border) bg-(--danger-soft) px-3 py-2 text-sm leading-6 text-(--danger-foreground)" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => (setOpen(false), resetForm())}>
              取消
            </Button>
            <Button onClick={handleSubmit}>保存档案</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteId)} onOpenChange={(value) => !value && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除档案</DialogTitle>
            <DialogDescription>删除后会同时清除该幼儿的出勤、饮食、成长与反馈记录，请谨慎操作。</DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-lg border border-(--danger-border) bg-(--danger-soft) p-3 text-sm leading-6 text-(--danger-foreground)">
            <Trash2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>这是不可恢复操作。请只在确认档案确实需要移除时继续。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteId) {
                  const childName = visibleChildren.find((item) => item.id === deleteId)?.name ?? "该幼儿";
                  removeChild(deleteId);
                  toast.success("档案已删除", {
                    description: `${childName} 及其关联记录已从当前视图移除。`,
                  });
                }
                setDeleteId(null);
              }}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChildArchiveCard({
  child,
  canManage,
  attendance,
  onDelete,
  onToggleAttendance,
}: {
  child: Child;
  canManage: boolean;
  attendance?: {
    isPresent: boolean;
    checkInAt?: string;
    checkOutAt?: string;
    absenceReason?: string;
  };
  onDelete: () => void;
  onToggleAttendance: () => void;
}) {
  const ageBand = getAgeBandFromBirthDate(child.birthDate);
  const guardianText = child.guardians.map((guardian) => `${guardian.name}（${guardian.relation}）`).join("、");
  const isPresent = attendance?.isPresent ?? false;
  const heightText = child.heightCm > 0 ? `${child.heightCm} cm` : "--";
  const weightText = child.weightKg > 0 ? `${child.weightKg} kg` : "--";

  return (
    <Card className="overflow-hidden border-slate-100 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="border-b border-slate-100 bg-linear-to-r from-slate-50 to-white pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-3xl" role="img" aria-label={`${child.name} 的头像`}>
              {child.avatar}
            </div>
            <div>
              <CardTitle className="text-xl">{child.name}</CardTitle>
              <CardDescription className="mt-1">
                {child.nickname ? `昵称：${child.nickname} · ` : ""}
                {child.className} · {getAgeText(child.birthDate)}
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={isPresent ? "success" : "secondary"}>{isPresent ? "今日出勤" : "今日缺勤"}</Badge>
            {canManage ? (
              <button aria-label={`删除 ${child.name} 的档案`} onClick={onDelete} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">出生：{formatDisplayDate(child.birthDate)}</Badge>
          <Badge variant="secondary">年龄段：{ageBand}</Badge>
          <Badge variant={child.gender === "男" ? "info" : "warning"}>性别：{child.gender}</Badge>
        </div>

        <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
          <InfoItem label="监护人" value={guardianText} />
          <InfoItem label="联系电话" value={child.guardians.map((guardian) => guardian.phone).join(" / ")} />
          <InfoItem label="身高体重" value={`${heightText} / ${weightText}`} />
          <InfoItem label="机构班级" value={`${INSTITUTION_NAME} · ${child.className}`} />
        </div>

        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-700">过敏信息</p>
          <p className="mt-1">{child.allergies.length > 0 ? child.allergies.join("、") : <span className="text-slate-400 italic">暂无过敏记录</span>}</p>
        </div>

        <div className="rounded-2xl bg-indigo-50 p-4 text-sm text-slate-600">
          <p className="font-medium text-indigo-700">特殊关注项</p>
          <p className="mt-1 leading-6">{child.specialNotes || <span className="text-slate-400 italic">暂无特殊关注项</span>}</p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-600">
          <p className="flex items-center gap-2 font-medium text-slate-700">
            <Clock3 className="h-4 w-4" />
            今日到离园信息
          </p>
          {isPresent ? (
            <p className="mt-2">入园 {attendance?.checkInAt ?? "--"} · 离园 {attendance?.checkOutAt ?? "--"}</p>
          ) : (
            <p className="mt-2">缺勤原因：{attendance?.absenceReason || "未登记"}</p>
          )}
        </div>

        {canManage ? (
          <div className="flex justify-end">
            <Button variant="outline" onClick={onToggleAttendance}>
              切换为{isPresent ? "缺勤" : "出勤"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-medium text-slate-700">{value}</p>
    </div>
  );
}
