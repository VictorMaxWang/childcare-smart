"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpenCheck,
  Clock3,
  Eye,
  HeartPulse,
  Pencil,
  RotateCcw,
  Search,
  UserPlus,
  Users,
  Utensils,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { TeacherActionTile, TeacherMiniPanel } from "@/components/teacher/TeacherOperationKit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTableShell } from "@/components/ui/data-table-shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { FilterBar } from "@/components/ui/filter-bar";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { StatusTag } from "@/components/ui/status-tag";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError } from "@/lib/api/errors";
import {
  archiveChild,
  createChild,
  listChildren,
  updateChild,
} from "@/lib/api/children";
import { createRecord, listRecords, updateRecord } from "@/lib/api/records";
import type { ApiChild, ApiChildInput } from "@/lib/api/types";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";
import {
  formatDisplayDate,
  getAgeBandFromBirthDate,
  getAgeText,
  INSTITUTION_NAME,
  type Gender,
  type Guardian,
  useApp,
} from "@/lib/store";
import { toast } from "sonner";

type AttendanceRecord = AppStateSnapshot["attendance"][number] & { archivedAt?: string; updatedAt?: string };

type ChildFormState = {
  name: string;
  nickname: string;
  birthDate: string;
  gender: Gender;
  allergies: string;
  heightCm: string;
  weightKg: string;
  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  className: string;
  specialNotes: string;
};

const DEFAULT_FORM: ChildFormState = {
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
  className: "向阳班",
  specialNotes: "",
};

function todayString() {
  return new Date().toLocaleDateString("sv-SE");
}

function apiErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return `${error.message}（${error.code}）`;
  }
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

function formFromChild(child: ApiChild): ChildFormState {
  const guardian = child.guardians[0];
  return {
    name: child.name,
    nickname: child.nickname ?? "",
    birthDate: child.birthDate,
    gender: child.gender,
    allergies: child.allergies.join("，"),
    heightCm: String(child.heightCm || ""),
    weightKg: String(child.weightKg || ""),
    guardianName: guardian?.name ?? "",
    guardianRelation: guardian?.relation ?? "母亲",
    guardianPhone: guardian?.phone ?? "",
    className: child.className,
    specialNotes: child.specialNotes,
  };
}

function buildPayload(form: ChildFormState): ApiChildInput {
  const guardian: Guardian = {
    name: form.guardianName.trim(),
    relation: form.guardianRelation.trim() || "监护人",
    phone: form.guardianPhone.trim() || "待补充",
  };

  return {
    name: form.name.trim(),
    nickname: form.nickname.trim() || undefined,
    birthDate: form.birthDate,
    gender: form.gender,
    allergies: form.allergies
      .split(/[，,]/)
      .map((item) => item.trim())
      .filter(Boolean),
    heightCm: Number(form.heightCm) || 0,
    weightKg: Number(form.weightKg) || 0,
    guardians: [guardian],
    className: form.className.trim() || "待分班",
    specialNotes: form.specialNotes.trim(),
  };
}

export default function ChildrenPage() {
  const { currentUser } = useApp();
  const [children, setChildren] = useState<ApiChild[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<ChildFormState>({
    ...DEFAULT_FORM,
    className: currentUser.className ?? DEFAULT_FORM.className,
  });

  const canManageChildren = currentUser.role === "机构管理员";
  const canManageAttendance = currentUser.role === "机构管理员" || currentUser.role === "教师";
  const isTeacher = currentUser.role === "教师";
  const today = todayString();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [childData, attendanceData] = await Promise.all([
        listChildren({ includeArchived }),
        listRecords("attendance", { includeArchived: true }),
      ]);
      setChildren(childData);
      setAttendance(attendanceData);
    } catch (requestError) {
      const message = apiErrorMessage(requestError);
      setError(message);
      toast.error("儿童档案读取失败", { description: message });
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const todayAttendance = useMemo(
    () => attendance.filter((item) => item.date === today && !item.archivedAt),
    [attendance, today]
  );

  const attendanceMap = useMemo(() => {
    return new Map(todayAttendance.map((item) => [item.childId, item]));
  }, [todayAttendance]);

  const activeChildren = useMemo(() => children.filter((child) => !child.archivedAt), [children]);

  const filteredChildren = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return children.filter((child) => {
      const attendanceRecord = attendanceMap.get(child.id);
      const text = [
        child.name,
        child.nickname,
        child.className,
        child.guardians.map((guardian) => guardian.name).join(" "),
        child.allergies.join(" "),
        getAgeBandFromBirthDate(child.birthDate),
        child.archivedAt ? "已归档" : "在册",
        attendanceRecord?.isPresent ? "出勤" : "缺勤",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return !keyword || text.includes(keyword);
    });
  }, [attendanceMap, children, search]);

  const ageBandStats = activeChildren.reduce<Record<string, number>>((acc, child) => {
    const band = getAgeBandFromBirthDate(child.birthDate);
    acc[band] = (acc[band] ?? 0) + 1;
    return acc;
  }, {});

  const selectedDetailChild = selectedDetailId
    ? children.find((child) => child.id === selectedDetailId) ?? null
    : null;
  const selectedDetailAttendance = selectedDetailChild ? attendanceMap.get(selectedDetailChild.id) : undefined;

  function resetForm() {
    setForm({
      ...DEFAULT_FORM,
      className: currentUser.className ?? DEFAULT_FORM.className,
    });
    setEditingChildId(null);
    setFormError("");
  }

  function openCreateForm() {
    resetForm();
    setFormOpen(true);
  }

  function openEditForm(child: ApiChild) {
    setForm(formFromChild(child));
    setEditingChildId(child.id);
    setFormError("");
    setFormOpen(true);
  }

  async function handleSubmit() {
    if (!canManageChildren) return;
    if (!form.name.trim() || !form.birthDate || !form.guardianName.trim()) {
      const message = "请至少填写姓名、出生日期和一位监护人信息。";
      setFormError(message);
      toast.warning(message);
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const payload = buildPayload(form);
      if (editingChildId) {
        await updateChild(editingChildId, payload);
        toast.success("儿童档案已更新", { description: "修改已写入 E01 API 数据层，刷新后保留。" });
      } else {
        await createChild(payload);
        toast.success("儿童档案已保存", { description: "新档案已写入 E01 API 数据层，刷新后保留。" });
      }
      setFormOpen(false);
      resetForm();
      await loadData();
    } catch (requestError) {
      const message = apiErrorMessage(requestError);
      setFormError(message);
      toast.error(editingChildId ? "儿童档案更新失败" : "儿童档案保存失败", { description: message });
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(child: ApiChild) {
    if (!canManageChildren) return;
    const confirmed = window.confirm(`确认归档 ${child.name} 的儿童档案？归档后默认列表会隐藏该档案。`);
    if (!confirmed) return;

    try {
      await archiveChild(child.id, { action: "archive", archiveReason: "E02 页面归档" });
      toast.success("儿童档案已归档", { description: "删除动作已按产品规则转为软归档。" });
      if (selectedDetailId === child.id) setSelectedDetailId(null);
      await loadData();
    } catch (requestError) {
      toast.error("儿童档案归档失败", { description: apiErrorMessage(requestError) });
    }
  }

  async function handleRestore(child: ApiChild) {
    if (!canManageChildren) return;
    const confirmed = window.confirm(`确认恢复 ${child.name} 的儿童档案？恢复后会重新出现在默认列表。`);
    if (!confirmed) return;

    try {
      await archiveChild(child.id, { action: "restore" });
      toast.success("儿童档案已恢复", { description: "恢复动作已写入审计字段。" });
      await loadData();
    } catch (requestError) {
      toast.error("儿童档案恢复失败", { description: apiErrorMessage(requestError) });
    }
  }

  async function handleToggleAttendance(child: ApiChild) {
    if (!canManageAttendance || child.archivedAt) return;
    const existing = attendanceMap.get(child.id);

    try {
      if (existing) {
        await updateRecord("attendance", existing.id, {
          isPresent: !existing.isPresent,
          absenceReason: existing.isPresent ? "临时请假" : undefined,
          checkInAt: existing.isPresent ? undefined : "08:35",
          checkOutAt: existing.isPresent ? undefined : "17:15",
        });
      } else {
        await createRecord("attendance", {
          childId: child.id,
          date: today,
          isPresent: true,
          checkInAt: "08:30",
          checkOutAt: "17:10",
        });
      }
      toast.success(`已切换 ${child.name} 的今日出勤状态`, {
        description: "出勤状态已写入 E01 /api/records 服务。",
      });
      await loadData();
    } catch (requestError) {
      toast.error("出勤状态保存失败", { description: apiErrorMessage(requestError) });
    }
  }

  return (
    <div className="app-page max-w-[86rem] page-enter" data-testid="r05-children-page">
      <section className="mb-5 overflow-hidden rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,#f8fbff_0%,#eef2ff_48%,#ecfeff_100%)] p-4 shadow-[0_20px_60px_rgb(79_70_229_/_0.10)] sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info" className="rounded-full px-3 py-1">
                    {currentUser.role === "教师" ? currentUser.className ?? "当前班级" : INSTITUTION_NAME}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    {currentUser.role === "教师" ? "班级名册" : currentUser.role === "家长" ? "孩子档案" : "全园档案"}
                  </Badge>
                  {includeArchived ? <Badge variant="warning">包含归档</Badge> : null}
                </div>
                <h1 className="mt-4 flex items-center gap-3 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">
                  <Users className="h-7 w-7 text-indigo-500" />
                  儿童档案管理
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  儿童档案从 E01 API 数据层读取，新增、编辑、归档和恢复都会经过服务端 scope 校验。
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <Button
                  onClick={openCreateForm}
                  disabled={!canManageChildren}
                  variant="premium"
                  className="min-h-11 rounded-2xl"
                  title={canManageChildren ? undefined : "仅园长可新增儿童档案"}
                  data-testid="e02-open-add-child"
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  {canManageChildren ? "新增幼儿档案" : "仅可查看档案"}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 rounded-2xl"
                  onClick={() => setIncludeArchived((value) => !value)}
                  data-testid="e02-toggle-archived-children"
                >
                  {includeArchived ? "隐藏归档档案" : "查看归档档案"}
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "在册幼儿", value: `${activeChildren.length}位`, bar: "bg-indigo-400" },
                { label: "今日出勤", value: `${todayAttendance.filter((item) => item.isPresent).length}位`, bar: "bg-emerald-400" },
                { label: "今日缺勤", value: `${todayAttendance.filter((item) => !item.isPresent).length}位`, bar: "bg-amber-400" },
                { label: "归档档案", value: `${children.filter((child) => child.archivedAt).length}份`, bar: "bg-slate-400" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/82 bg-white/84 p-4 shadow-sm">
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
                  <span className={`mt-3 inline-flex h-1.5 w-12 rounded-full ${item.bar}`} />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/82 bg-white/78 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                <Clock3 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-950">名册洞察</p>
                <p className="mt-1 text-xs text-slate-500">{currentUser.role === "教师" ? "教师端工作顺序" : "园长端管理视角"}</p>
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>{currentUser.role === "教师" ? "教师只能查看本班儿童并记录出勤。" : "园长可维护全园儿童档案和归档状态。"}</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ageBandStats).slice(0, 4).map(([label, count]) => (
                  <Badge key={label} variant="secondary">
                    {label}：{count}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {isTeacher ? (
        <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-3 sm:grid-cols-3">
            <TeacherActionTile href="/health" icon={<HeartPulse className="h-5 w-5" />} title="晨检补录" description="按儿童卡片快速进入今日晨检、异常和待检状态。" tone="sky" />
            <TeacherActionTile href="/diet" icon={<Utensils className="h-5 w-5" />} title="饮食记录" description="从班级名单进入餐次录入、饮水和过敏拦截。" tone="emerald" />
            <TeacherActionTile href="/growth" icon={<BookOpenCheck className="h-5 w-5" />} title="成长观察" description="围绕当前班级幼儿补充观察标签和复查动作。" tone="indigo" />
          </div>
          <TeacherMiniPanel title="班级名册状态" badge={currentUser.className ?? "当前班级"} tone="sky">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-semibold text-slate-950">{activeChildren.length}</p>
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
              placeholder="搜索姓名、监护人、班级、年龄段、出勤或归档状态…"
              data-testid="e02-child-search"
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

      {error ? (
        <div className="mb-5 rounded-lg border border-(--danger-border) bg-(--danger-soft) px-4 py-3 text-sm text-(--danger-foreground)" role="alert">
          {error}
          <Button variant="outline" size="sm" className="ml-3" onClick={() => void loadData()}>
            重试
          </Button>
        </div>
      ) : null}

      {loading ? (
        <Card className="border-indigo-100 p-6 text-sm text-slate-600">正在读取儿童档案...</Card>
      ) : filteredChildren.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="未找到匹配档案"
          description={includeArchived ? "当前没有匹配的在册或归档档案。" : "默认列表会隐藏归档档案，可切换查看归档。"}
          actionLabel={canManageChildren ? "新增幼儿档案" : undefined}
          onAction={canManageChildren ? openCreateForm : undefined}
        />
      ) : (
        <>
          <DataTableShell
            className="hidden lg:block"
            title="幼儿档案台账"
            description="桌面端按管理台账展示，归档后默认隐藏，恢复后重新进入在册列表。"
            footer={<span>共 {filteredChildren.length} 条档案</span>}
          >
            <table className="w-full min-w-[980px] text-left text-sm">
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
                {filteredChildren.map((child) => (
                  <ChildRow
                    key={child.id}
                    child={child}
                    attendance={attendanceMap.get(child.id)}
                    canManageAttendance={canManageAttendance}
                    canManageChildren={canManageChildren}
                    onArchive={() => void handleArchive(child)}
                    onEdit={() => openEditForm(child)}
                    onOpenDetails={() => setSelectedDetailId(child.id)}
                    onRestore={() => void handleRestore(child)}
                    onToggleAttendance={() => void handleToggleAttendance(child)}
                  />
                ))}
              </tbody>
            </table>
          </DataTableShell>

          <div className="grid grid-cols-1 gap-5 lg:hidden">
            {filteredChildren.map((child) => (
              <ChildArchiveCard
                key={child.id}
                child={child}
                attendance={attendanceMap.get(child.id)}
                canManageAttendance={canManageAttendance}
                canManageChildren={canManageChildren}
                onArchive={() => void handleArchive(child)}
                onEdit={() => openEditForm(child)}
                onOpenDetails={() => setSelectedDetailId(child.id)}
                onRestore={() => void handleRestore(child)}
                onToggleAttendance={() => void handleToggleAttendance(child)}
              />
            ))}
          </div>
        </>
      )}

      <Dialog open={formOpen} onOpenChange={(value) => (!value ? (setFormOpen(false), resetForm()) : setFormOpen(true))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingChildId ? "编辑儿童档案" : "新增儿童档案"}</DialogTitle>
            <DialogDescription>保存会写入 E01 children API，并由服务端 scope 重新校验。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <FormField label="姓名" required error={formError && !form.name.trim() ? "请填写幼儿姓名。" : undefined}>
              <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} data-testid="e02-child-name" />
            </FormField>
            <FormField label="昵称" description="可选，用于教师和家长日常识别。">
              <Input value={form.nickname} onChange={(event) => setForm((prev) => ({ ...prev, nickname: event.target.value }))} data-testid="e02-child-nickname" />
            </FormField>
            <FormField label="出生日期" required description={`自动年龄段：${getAgeBandFromBirthDate(form.birthDate)}`}>
              <Input type="date" value={form.birthDate} onChange={(event) => setForm((prev) => ({ ...prev, birthDate: event.target.value }))} data-testid="e02-child-birth-date" />
            </FormField>
            <FormField label="性别">
              <div className="flex gap-2">
                {(["男", "女"] as Gender[]).map((gender) => (
                  <Button key={gender} type="button" variant={form.gender === gender ? "default" : "outline"} className="min-h-11 flex-1 sm:min-h-10" onClick={() => setForm((prev) => ({ ...prev, gender }))}>
                    {gender}
                  </Button>
                ))}
              </div>
            </FormField>
            <FormField label="身高（cm）">
              <Input value={form.heightCm} onChange={(event) => setForm((prev) => ({ ...prev, heightCm: event.target.value }))} data-testid="e02-child-height" />
            </FormField>
            <FormField label="体重（kg）">
              <Input value={form.weightKg} onChange={(event) => setForm((prev) => ({ ...prev, weightKg: event.target.value }))} data-testid="e02-child-weight" />
            </FormField>
            <FormField label="监护人姓名" required error={formError && !form.guardianName.trim() ? "请填写至少一位监护人。" : undefined}>
              <Input value={form.guardianName} onChange={(event) => setForm((prev) => ({ ...prev, guardianName: event.target.value }))} data-testid="e02-child-guardian" />
            </FormField>
            <FormField label="关系 / 联系电话" description="电话可后续补充，系统会保留监护人关系。">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input value={form.guardianRelation} onChange={(event) => setForm((prev) => ({ ...prev, guardianRelation: event.target.value }))} data-testid="e02-child-guardian-relation" />
                <Input value={form.guardianPhone} onChange={(event) => setForm((prev) => ({ ...prev, guardianPhone: event.target.value }))} data-testid="e02-child-guardian-phone" />
              </div>
            </FormField>
            <FormField label="过敏信息（逗号分隔）" className="md:col-span-2">
              <Input value={form.allergies} onChange={(event) => setForm((prev) => ({ ...prev, allergies: event.target.value }))} placeholder="如：牛奶，芒果" data-testid="e02-child-allergies" />
            </FormField>
            <FormField label="班级" className="md:col-span-2">
              <Input value={form.className} onChange={(event) => setForm((prev) => ({ ...prev, className: event.target.value }))} placeholder="如：向阳班" data-testid="e02-child-class" />
            </FormField>
            <FormField label="特殊关注项" className="md:col-span-2">
              <Textarea value={form.specialNotes} onChange={(event) => setForm((prev) => ({ ...prev, specialNotes: event.target.value }))} placeholder="如：午睡困难、过渡期社交适应等" data-testid="e02-child-notes" />
            </FormField>
          </div>
          {formError ? (
            <p className="rounded-lg border border-(--danger-border) bg-(--danger-soft) px-3 py-2 text-sm leading-6 text-(--danger-foreground)" role="alert">
              {formError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => (setFormOpen(false), resetForm())}>
              取消
            </Button>
            <Button onClick={() => void handleSubmit()} loading={saving} data-testid="e02-save-child">
              {editingChildId ? "保存修改" : "保存档案"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Drawer open={Boolean(selectedDetailChild)} onOpenChange={(value) => !value && setSelectedDetailId(null)}>
        <DrawerContent side="right">
          {selectedDetailChild ? (
            <>
              <DrawerHeader>
                <DrawerTitle className="text-xl font-semibold text-slate-950">{selectedDetailChild.name} 档案详情</DrawerTitle>
                <DrawerDescription className="mt-2 text-sm leading-6 text-slate-500">
                  查看幼儿基础信息、监护人、健康关注项、今日出勤和归档状态。
                </DrawerDescription>
              </DrawerHeader>
              <DrawerBody className="space-y-5">
                <section className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-4xl" role="img" aria-label={`${selectedDetailChild.name} 的头像`}>
                      {selectedDetailChild.avatar}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-semibold text-slate-950">{selectedDetailChild.name}</h3>
                        <Badge variant={selectedDetailChild.gender === "男" ? "info" : "warning"}>{selectedDetailChild.gender}</Badge>
                        {selectedDetailChild.archivedAt ? <Badge variant="warning">已归档</Badge> : <Badge variant="success">在册</Badge>}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {selectedDetailChild.nickname ? `昵称：${selectedDetailChild.nickname} · ` : ""}
                        {selectedDetailChild.className} · {getAgeText(selectedDetailChild.birthDate)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="secondary">出生：{formatDisplayDate(selectedDetailChild.birthDate)}</Badge>
                        <Badge variant="info">年龄段：{getAgeBandFromBirthDate(selectedDetailChild.birthDate)}</Badge>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="grid gap-3 sm:grid-cols-2">
                  <InfoItem label="身高体重" value={`${selectedDetailChild.heightCm > 0 ? `${selectedDetailChild.heightCm} cm` : "--"} / ${selectedDetailChild.weightKg > 0 ? `${selectedDetailChild.weightKg} kg` : "--"}`} />
                  <InfoItem label="机构班级" value={`${INSTITUTION_NAME} · ${selectedDetailChild.className}`} />
                  <InfoItem label="监护人" value={selectedDetailChild.guardians.map((guardian) => `${guardian.name}（${guardian.relation}）`).join("、") || "待补充"} />
                  <InfoItem label="联系电话" value={selectedDetailChild.guardians.map((guardian) => guardian.phone).filter(Boolean).join(" / ") || "待补充"} />
                </section>

                <section className="rounded-3xl border border-slate-100 bg-white p-5 text-sm text-slate-600 shadow-sm">
                  <p className="font-semibold text-slate-900">健康与特殊关注</p>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold text-slate-500">过敏信息</p>
                      <p className="mt-2 leading-6">{selectedDetailChild.allergies.length > 0 ? selectedDetailChild.allergies.join("、") : "暂无过敏记录"}</p>
                    </div>
                    <div className="rounded-2xl bg-indigo-50 p-4">
                      <p className="text-xs font-semibold text-indigo-700">特殊关注项</p>
                      <p className="mt-2 leading-6">{selectedDetailChild.specialNotes || "暂无特殊关注项"}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-100 bg-white p-5 text-sm text-slate-600 shadow-sm">
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    <Clock3 className="h-4 w-4" />
                    今日到离园信息
                  </p>
                  {selectedDetailAttendance?.isPresent ? (
                    <p className="mt-3 leading-6">今日出勤，入园 {selectedDetailAttendance.checkInAt ?? "--"}，离园 {selectedDetailAttendance.checkOutAt ?? "--"}。</p>
                  ) : (
                    <p className="mt-3 leading-6">今日缺勤，原因：{selectedDetailAttendance?.absenceReason || "未登记"}。</p>
                  )}
                </section>
              </DrawerBody>
              <DrawerFooter>
                <Button variant="outline" onClick={() => setSelectedDetailId(null)}>
                  关闭
                </Button>
                {canManageChildren ? (
                  selectedDetailChild.archivedAt ? (
                    <Button onClick={() => void handleRestore(selectedDetailChild)} data-testid="e02-detail-restore-child">
                      恢复档案
                    </Button>
                  ) : (
                    <Button onClick={() => openEditForm(selectedDetailChild)} data-testid="e02-detail-edit-child">
                      编辑档案
                    </Button>
                  )
                ) : null}
              </DrawerFooter>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function ChildRow({
  child,
  attendance,
  canManageAttendance,
  canManageChildren,
  onArchive,
  onEdit,
  onOpenDetails,
  onRestore,
  onToggleAttendance,
}: {
  child: ApiChild;
  attendance?: AttendanceRecord;
  canManageAttendance: boolean;
  canManageChildren: boolean;
  onArchive: () => void;
  onEdit: () => void;
  onOpenDetails: () => void;
  onRestore: () => void;
  onToggleAttendance: () => void;
}) {
  const isPresent = attendance?.isPresent ?? false;
  return (
    <tr className="transition hover:bg-slate-50/80" data-testid={`e02-child-row-${child.id}`}>
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-xl">{child.avatar}</div>
          <div>
            <button type="button" className="font-semibold text-slate-900 underline-offset-4 transition hover:text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200" onClick={onOpenDetails}>
              {child.name}
            </button>
            <p className="text-xs text-slate-500">{child.nickname || "无昵称"} · {child.gender}</p>
            {child.archivedAt ? <p className="mt-1 text-xs font-semibold text-amber-600">已归档</p> : null}
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
          {isPresent ? `入园 ${attendance?.checkInAt ?? "--"} · 离园 ${attendance?.checkOutAt ?? "--"}` : `原因：${attendance?.absenceReason || "未登记"}`}
        </p>
      </td>
      <td className="px-5 py-4">
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onOpenDetails}>
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            详情
          </Button>
          {canManageAttendance && !child.archivedAt ? (
            <Button variant="outline" size="sm" onClick={onToggleAttendance} data-testid={`e02-attendance-toggle-${child.id}`}>
              切换出勤
            </Button>
          ) : null}
          {canManageChildren ? (
            child.archivedAt ? (
              <Button variant="outline" size="sm" onClick={onRestore} data-testid={`e02-restore-child-${child.id}`}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                恢复
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={onEdit} data-testid={`e02-edit-child-${child.id}`}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  编辑
                </Button>
                <Button variant="ghost" size="sm" onClick={onArchive} data-testid={`e02-archive-child-${child.id}`}>
                  <Archive className="mr-1.5 h-3.5 w-3.5" />
                  归档
                </Button>
              </>
            )
          ) : (
            <StatusTag variant="neutral">仅查看</StatusTag>
          )}
        </div>
      </td>
    </tr>
  );
}

function ChildArchiveCard({
  child,
  attendance,
  canManageAttendance,
  canManageChildren,
  onArchive,
  onEdit,
  onOpenDetails,
  onRestore,
  onToggleAttendance,
}: {
  child: ApiChild;
  attendance?: AttendanceRecord;
  canManageAttendance: boolean;
  canManageChildren: boolean;
  onArchive: () => void;
  onEdit: () => void;
  onOpenDetails: () => void;
  onRestore: () => void;
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
            <Badge variant={child.archivedAt ? "warning" : isPresent ? "success" : "secondary"}>
              {child.archivedAt ? "已归档" : isPresent ? "今日出勤" : "今日缺勤"}
            </Badge>
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
          <InfoItem label="监护人" value={guardianText || "待补充"} />
          <InfoItem label="联系电话" value={child.guardians.map((guardian) => guardian.phone).join(" / ") || "待补充"} />
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

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onOpenDetails}>
            <Eye className="mr-2 h-4 w-4" />
            查看详情
          </Button>
          {canManageAttendance && !child.archivedAt ? (
            <Button variant="outline" onClick={onToggleAttendance} data-testid={`e02-attendance-toggle-mobile-${child.id}`}>
              切换为{isPresent ? "缺勤" : "出勤"}
            </Button>
          ) : null}
          {canManageChildren ? (
            child.archivedAt ? (
              <Button variant="outline" onClick={onRestore} data-testid={`e02-restore-child-mobile-${child.id}`}>
                恢复
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={onEdit} data-testid={`e02-edit-child-mobile-${child.id}`}>
                  编辑
                </Button>
                <Button variant="ghost" onClick={onArchive} data-testid={`e02-archive-child-mobile-${child.id}`}>
                  归档
                </Button>
              </>
            )
          ) : null}
        </div>
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
