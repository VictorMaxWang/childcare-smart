"use client";

import { useMemo, useState } from "react";
import { Clock3, Search, Trash2, UserPlus, Users } from "lucide-react";
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
import AnimatedNumber from "@/components/AnimatedNumber";
import ScrollReveal from "@/components/ScrollReveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
    <div className="mx-auto max-w-7xl px-6 py-8 page-enter">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-800">
            <Users className="h-8 w-8 text-indigo-500" />
            儿童档案
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            已升级为“出生日期 + 自动年龄段 + 每日出勤记录”模型，支持到离园统计、缺勤原因和后续周/月报表扩展。
          </p>
          <div className="section-divider mt-5" />
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
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard title="当前可见幼儿" value={`${visibleChildren.length}位`} />
        <SummaryCard title="今日出勤" value={`${todayAttendance.filter((item) => item.isPresent).length}位`} />
        <SummaryCard title="今日缺勤" value={`${todayAttendance.filter((item) => !item.isPresent).length}位`} />
        <SummaryCard
          title="机构 / 班级"
          value={currentUser.className ? `${INSTITUTION_NAME} · ${currentUser.className}` : INSTITUTION_NAME}
        />
      </div>
      </ScrollReveal>

      <Card className="mb-6">
        <CardContent className="grid gap-4 py-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-10"
              placeholder="搜索姓名、监护人、班级、年龄段、出勤状态…"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ageBandStats).map(([label, count]) => (
              <Badge key={label} variant="secondary" className="px-3 py-1 text-xs">
                {label}：{count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {filteredChildren.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="未找到匹配档案"
          description="请尝试调整搜索关键词，或先新增一位幼儿档案。"
          actionLabel={canManage ? "新增幼儿档案" : undefined}
          onAction={canManage ? () => setOpen(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
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
      )}

      <Dialog open={open} onOpenChange={(value) => (!value ? (setOpen(false), resetForm()) : setOpen(true))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新增儿童档案</DialogTitle>
            <DialogDescription>使用出生日期自动计算年龄段，无需手填年龄数字。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label>姓名</Label>
              <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>昵称</Label>
              <Input value={form.nickname} onChange={(event) => setForm((prev) => ({ ...prev, nickname: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>出生日期</Label>
              <Input
                type="date"
                value={form.birthDate}
                onChange={(event) => setForm((prev) => ({ ...prev, birthDate: event.target.value }))}
              />
              <p className="text-xs text-slate-400">自动年龄段：{getAgeBandFromBirthDate(form.birthDate)}</p>
            </div>
            <div className="space-y-2">
              <Label>性别</Label>
              <div className="flex gap-2">
                {(["男", "女"] as Gender[]).map((gender) => (
                  <Button
                    key={gender}
                    type="button"
                    variant={form.gender === gender ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => setForm((prev) => ({ ...prev, gender }))}
                  >
                    {gender}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>身高（cm）</Label>
              <Input value={form.heightCm} onChange={(event) => setForm((prev) => ({ ...prev, heightCm: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>体重（kg）</Label>
              <Input value={form.weightKg} onChange={(event) => setForm((prev) => ({ ...prev, weightKg: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>监护人姓名</Label>
              <Input value={form.guardianName} onChange={(event) => setForm((prev) => ({ ...prev, guardianName: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>关系 / 联系电话</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={form.guardianRelation}
                  onChange={(event) => setForm((prev) => ({ ...prev, guardianRelation: event.target.value }))}
                />
                <Input
                  value={form.guardianPhone}
                  onChange={(event) => setForm((prev) => ({ ...prev, guardianPhone: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>过敏信息（逗号分隔）</Label>
              <Input
                value={form.allergies}
                onChange={(event) => setForm((prev) => ({ ...prev, allergies: event.target.value }))}
                placeholder="如：牛奶，芒果"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>所属机构 / 班级</Label>
              <Input
                value={form.className}
                onChange={(event) => setForm((prev) => ({ ...prev, className: event.target.value }))}
                placeholder="如：向阳班"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>特殊关注项</Label>
              <Textarea
                value={form.specialNotes}
                onChange={(event) => setForm((prev) => ({ ...prev, specialNotes: event.target.value }))}
                placeholder="如：午睡困难、过渡期社交适应等"
              />
            </div>
          </div>
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
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

function SummaryCard({ title, value }: { title: string; value: string }) {
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  const suffix = value.replace(/[\d.-]/g, "");
  return (
    <Card className="kpi-accent card-hover border-l-4 border-l-indigo-300">
      <CardContent className="py-5">
        <p className="text-sm text-slate-500">{title}</p>
        <p className="mt-2 text-lg font-semibold text-slate-800">
          {Number.isNaN(parsed) ? value : <AnimatedNumber value={parsed} suffix={suffix} />}
        </p>
      </CardContent>
    </Card>
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
