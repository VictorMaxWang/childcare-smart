"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Pencil, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type InstitutionItem = {
  id: string;
  name: string;
  created_at?: string;
};

type ClassItem = {
  id: string;
  institution_id: string;
  class_name: string;
  created_at?: string;
};

type TeacherItem = {
  id: string;
  name: string;
  class_name: string | null;
};

type ChildItem = {
  id: string;
  name: string;
  class_name: string;
};

type DeleteConflict = {
  childCount: number;
  teacherCount: number;
};

type AuditLogItem = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  actor_id: string;
  actor_name?: string | null;
};

type RecentTeacherChange = {
  id: string;
  name: string;
  className: string | null;
};

type RecentChildChange = {
  id: string;
  name: string;
  className: string;
};

const ACTION_LABELS: Record<string, string> = {
  institution_name_updated: "更新机构名称",
  class_created: "新增班级",
  class_renamed: "重命名班级",
  class_deleted: "删除班级",
  teacher_class_reassigned: "教师调班",
  child_class_reassigned: "幼儿转班",
};

const ENTITY_LABELS: Record<string, string> = {
  institution: "机构",
  class: "班级",
  teacher: "教师",
  child: "幼儿",
};

function getActionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

function getEntityLabel(entityType: string) {
  return ENTITY_LABELS[entityType] ?? entityType;
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getLogSummary(log: AuditLogItem) {
  const payload = log.payload ?? {};

  if (log.action === "institution_name_updated") {
    const name = asText(payload.name);
    return name ? `新机构名称：${name}` : "机构名称已更新";
  }

  if (log.action === "class_created") {
    const className = asText(payload.class_name);
    return className ? `新增班级：${className}` : "新增班级";
  }

  if (log.action === "class_renamed") {
    const oldName = asText(payload.old_class_name);
    const newName = asText(payload.new_class_name);
    if (oldName && newName) return `班级由“${oldName}”改为“${newName}”`;
    return "班级名称已调整";
  }

  if (log.action === "class_deleted") {
    const className = asText(payload.class_name);
    return className ? `已删除班级：${className}` : "班级已删除";
  }

  if (log.action === "teacher_class_reassigned") {
    const targetClass = asText(payload.target_class_name);
    return targetClass ? `目标班级：${targetClass}` : "教师班级已调整";
  }

  if (log.action === "child_class_reassigned") {
    const targetClass = asText(payload.target_class_name);
    return targetClass ? `目标班级：${targetClass}` : "幼儿班级已调整";
  }

  const payloadKeys = Object.keys(payload);
  return payloadKeys.length > 0 ? `变更字段：${payloadKeys.join("、")}` : "主数据已变更";
}

export default function MasterDataPage() {
  const { currentUser } = useApp();
  const [institution, setInstitution] = useState<InstitutionItem | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [children, setChildren] = useState<ChildItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [institutionName, setInstitutionName] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingClassName, setEditingClassName] = useState("");
  const [targetDeleteClass, setTargetDeleteClass] = useState<ClassItem | null>(null);
  const [deleteConflict, setDeleteConflict] = useState<DeleteConflict | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [targetClassName, setTargetClassName] = useState("");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [targetChildClassName, setTargetChildClassName] = useState("");
  const [teacherSourceClassFilter, setTeacherSourceClassFilter] = useState("");
  const [childSourceClassFilter, setChildSourceClassFilter] = useState("");
  const [recentTeacherChange, setRecentTeacherChange] = useState<RecentTeacherChange | null>(null);
  const [recentChildChange, setRecentChildChange] = useState<RecentChildChange | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isAdmin = currentUser.role === "机构管理员";

  const sortedClasses = useMemo(
    () => [...classes].sort((a, b) => a.class_name.localeCompare(b.class_name, "zh-CN")),
    [classes]
  );

  const filteredTeachers = useMemo(() => {
    if (!teacherSourceClassFilter) return teachers;
    return teachers.filter((item) => (item.class_name ?? "") === teacherSourceClassFilter);
  }, [teachers, teacherSourceClassFilter]);

  const filteredChildren = useMemo(() => {
    if (!childSourceClassFilter) return children;
    return children.filter((item) => item.class_name === childSourceClassFilter);
  }, [children, childSourceClassFilter]);

  const getClassUsageCounts = useCallback(
    (className: string) => {
      const childCount = children.filter((item) => item.class_name === className).length;
      const teacherCount = teachers.filter((item) => (item.class_name ?? "") === className).length;
      return { childCount, teacherCount };
    },
    [children, teachers]
  );

  function getFirstAlternativeClass(sourceClassName: string) {
    const candidate = sortedClasses.find((item) => item.class_name !== sourceClassName);
    return candidate?.class_name ?? "";
  }

  useEffect(() => {
    if (!targetDeleteClass || !deleteConflict) return;

    const latest = getClassUsageCounts(targetDeleteClass.class_name);
    if (latest.childCount === deleteConflict.childCount && latest.teacherCount === deleteConflict.teacherCount) {
      return;
    }

    setDeleteConflict(latest);
  }, [deleteConflict, getClassUsageCounts, targetDeleteClass]);

  const loadMasterData = useCallback(async () => {
    if (!isAdmin) return;

    setLoading(true);
    setError("");

    try {
      const [institutionRes, classesRes, teachersRes, childrenRes, auditLogsRes] = await Promise.all([
        fetch("/api/admin/institutions", { method: "GET" }),
        fetch("/api/admin/classes", { method: "GET" }),
        fetch("/api/admin/teachers", { method: "GET" }),
        fetch("/api/admin/children", { method: "GET" }),
        fetch("/api/admin/audit-logs?limit=20", { method: "GET" }),
      ]);

      if (!institutionRes.ok) {
        const body = (await institutionRes.json()) as { error?: string };
        throw new Error(body.error ?? "读取机构信息失败");
      }

      if (!classesRes.ok) {
        const body = (await classesRes.json()) as { error?: string };
        throw new Error(body.error ?? "读取班级信息失败");
      }

      if (!teachersRes.ok) {
        const body = (await teachersRes.json()) as { error?: string };
        throw new Error(body.error ?? "读取教师信息失败");
      }

      if (!childrenRes.ok) {
        const body = (await childrenRes.json()) as { error?: string };
        throw new Error(body.error ?? "读取幼儿信息失败");
      }

      if (!auditLogsRes.ok) {
        const body = (await auditLogsRes.json()) as { error?: string };
        throw new Error(body.error ?? "读取操作日志失败");
      }

      const institutionBody = (await institutionRes.json()) as { institutions?: InstitutionItem[] };
      const classesBody = (await classesRes.json()) as { classes?: ClassItem[] };
      const teachersBody = (await teachersRes.json()) as { teachers?: TeacherItem[] };
      const childrenBody = (await childrenRes.json()) as { children?: ChildItem[] };
      const auditBody = (await auditLogsRes.json()) as { logs?: AuditLogItem[] };

      const institutionItem = institutionBody.institutions?.[0] ?? null;
      setInstitution(institutionItem);
      setInstitutionName(institutionItem?.name ?? "");
      setClasses(Array.isArray(classesBody.classes) ? classesBody.classes : []);
      setTeachers(Array.isArray(teachersBody.teachers) ? teachersBody.teachers : []);
      setChildren(Array.isArray(childrenBody.children) ? childrenBody.children : []);
      setAuditLogs(Array.isArray(auditBody.logs) ? auditBody.logs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载主数据失败");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadMasterData();
  }, [loadMasterData]);

  async function saveInstitutionName() {
    const nextName = institutionName.trim();
    if (!nextName) {
      setError("机构名称不能为空");
      return;
    }

    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/institutions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const body = (await res.json()) as { error?: string; institution?: InstitutionItem };
      if (!res.ok) {
        throw new Error(body.error ?? "更新机构名称失败");
      }
      if (body.institution) {
        setInstitution(body.institution);
        setInstitutionName(body.institution.name);
      }
      void loadMasterData();
      setMessage("机构名称已更新");
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新机构名称失败");
    } finally {
      setLoading(false);
    }
  }

  async function addClass() {
    const className = newClassName.trim();
    if (!className) {
      setError("请输入班级名称");
      return;
    }

    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ className }),
      });
      const body = (await res.json()) as { error?: string; classItem?: ClassItem };
      if (!res.ok) {
        throw new Error(body.error ?? "新增班级失败");
      }

      if (body.classItem) {
        setClasses((prev) => [...prev, body.classItem as ClassItem]);
      }
      setNewClassName("");
      void loadMasterData();
      setMessage("班级已新增");
    } catch (e) {
      setError(e instanceof Error ? e.message : "新增班级失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveClass(classId: string) {
    const className = editingClassName.trim();
    if (!className) {
      setError("班级名称不能为空");
      return;
    }

    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/classes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: classId, className }),
      });
      const body = (await res.json()) as { error?: string; classItem?: ClassItem };
      if (!res.ok) {
        throw new Error(body.error ?? "更新班级失败");
      }

      if (body.classItem) {
        setClasses((prev) => prev.map((item) => (item.id === classId ? (body.classItem as ClassItem) : item)));
      }
      setEditingClassId(null);
      setEditingClassName("");
      void loadMasterData();
      setMessage("班级已更新");
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新班级失败");
    } finally {
      setLoading(false);
    }
  }

  async function removeClass(classId: string) {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/classes?id=${encodeURIComponent(classId)}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as { error?: string; childCount?: number; teacherCount?: number };
      if (!res.ok) {
        if (res.status === 409) {
          setDeleteConflict({ childCount: body.childCount ?? 0, teacherCount: body.teacherCount ?? 0 });
        }
        throw new Error(body.error ?? "删除班级失败");
      }

      setClasses((prev) => prev.filter((item) => item.id !== classId));
      setMessage("班级已删除");
      setTargetDeleteClass(null);
      setDeleteConflict(null);
      void loadMasterData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除班级失败");
    } finally {
      setLoading(false);
    }
  }

  async function reassignTeacherClass() {
    if (!selectedTeacherId || !targetClassName) {
      setError("请选择教师和目标班级");
      return;
    }

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/teachers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId: selectedTeacherId, targetClassName }),
      });

      const body = (await res.json()) as { error?: string; teacher?: TeacherItem };
      if (!res.ok) {
        throw new Error(body.error ?? "教师调班失败");
      }

      if (body.teacher) {
        setTeachers((prev) => prev.map((item) => (item.id === body.teacher?.id ? body.teacher : item)));
        setRecentTeacherChange({
          id: body.teacher.id,
          name: body.teacher.name,
          className: body.teacher.class_name,
        });
        setTeacherSourceClassFilter("");
        setSelectedTeacherId(body.teacher.id);
      }
      void loadMasterData();
      setMessage("教师班级已更新");
    } catch (e) {
      setError(e instanceof Error ? e.message : "教师调班失败");
    } finally {
      setLoading(false);
    }
  }

  async function reassignChildClass() {
    if (!selectedChildId || !targetChildClassName) {
      setError("请选择幼儿和目标班级");
      return;
    }

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/children", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: selectedChildId, targetClassName: targetChildClassName }),
      });

      const body = (await res.json()) as { error?: string; child?: ChildItem };
      if (!res.ok) {
        throw new Error(body.error ?? "幼儿转班失败");
      }

      if (body.child) {
        setChildren((prev) => prev.map((item) => (item.id === body.child?.id ? body.child : item)));
        setRecentChildChange({
          id: body.child.id,
          name: body.child.name,
          className: body.child.class_name,
        });
        setChildSourceClassFilter("");
        setSelectedChildId(body.child.id);
      }
      void loadMasterData();
      setMessage("幼儿班级已更新");
    } catch (e) {
      setError(e instanceof Error ? e.message : "幼儿转班失败");
    } finally {
      setLoading(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>无权限访问</CardTitle>
            <CardDescription>该页面仅对机构管理员开放。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-800">
            <Building2 className="h-8 w-8 text-indigo-600" />
            机构与班级管理
          </h1>
          <p className="mt-2 text-sm text-slate-500">维护机构主数据后，注册页将自动同步最新选项。</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => void loadMasterData()} disabled={loading}>
          <RefreshCcw className="h-4 w-4" />
          刷新
        </Button>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mb-4 text-sm text-emerald-600">{message}</p> : null}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>机构信息</CardTitle>
          <CardDescription>仅可编辑当前账号所属机构。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="institutionName">机构名称</Label>
            <Input
              id="institutionName"
              value={institutionName}
              onChange={(event) => setInstitutionName(event.target.value)}
              placeholder="请输入机构名称"
            />
            <p className="text-xs text-slate-400">机构 ID：{institution?.id ?? currentUser.institutionId}</p>
          </div>
          <Button onClick={() => void saveInstitutionName()} disabled={loading} className="gap-2">
            <Save className="h-4 w-4" />
            保存机构名称
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>班级列表</CardTitle>
          <CardDescription>新增或调整班级后，教师注册时可直接选择。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <Input
              value={newClassName}
              onChange={(event) => setNewClassName(event.target.value)}
              placeholder="例如：星光班"
            />
            <Button onClick={() => void addClass()} disabled={loading} className="gap-2">
              <Plus className="h-4 w-4" />
              新增班级
            </Button>
          </div>

          <div className="space-y-3">
            {sortedClasses.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">暂无班级数据</p>
            ) : (
              sortedClasses.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 md:flex-row md:items-center md:justify-between">
                  {editingClassId === item.id ? (
                    <Input
                      value={editingClassName}
                      onChange={(event) => setEditingClassName(event.target.value)}
                      className="md:max-w-sm"
                    />
                  ) : (
                    <div>
                      <p className="font-medium text-slate-700">{item.class_name}</p>
                      <p className="text-xs text-slate-400">ID：{item.id}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {editingClassId === item.id ? (
                      <Button size="sm" onClick={() => void saveClass(item.id)} disabled={loading} className="gap-1">
                        <Save className="h-3.5 w-3.5" />
                        保存
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingClassId(item.id);
                          setEditingClassName(item.class_name);
                          setError("");
                          setMessage("");
                        }}
                        disabled={loading}
                        className="gap-1"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setTargetDeleteClass(item);
                        setDeleteConflict(getClassUsageCounts(item.class_name));
                        setTeacherSourceClassFilter("");
                        setChildSourceClassFilter("");
                        setError("");
                        setMessage("");
                      }}
                      disabled={loading}
                      className="gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>教师调班</CardTitle>
          <CardDescription>先为教师调整班级，再删除旧班级可避免占用冲突。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 md:items-end">
          {recentTeacherChange ? (
            <div className="md:col-span-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              已定位最近变更教师：{recentTeacherChange.name}，当前班级 {recentTeacherChange.className ?? "未分班"}。
            </div>
          ) : null}

          {teacherSourceClassFilter ? (
            <div className="md:col-span-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              当前仅显示来源班级为“{teacherSourceClassFilter}”的教师（{filteredTeachers.length} 人）。
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setTeacherSourceClassFilter("")}
              >
                清除筛选
              </button>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>教师</Label>
            <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
              <SelectTrigger>
                <SelectValue placeholder="选择教师" />
              </SelectTrigger>
              <SelectContent>
                {filteredTeachers.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    {teacher.id === recentTeacherChange?.id ? "[最新] " : ""}
                    {teacher.name}（当前：{teacher.class_name ?? "未分班"}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>目标班级</Label>
            <Select value={targetClassName} onValueChange={setTargetClassName}>
              <SelectTrigger>
                <SelectValue placeholder="选择目标班级" />
              </SelectTrigger>
              <SelectContent>
                {sortedClasses.map((item) => (
                  <SelectItem key={item.id} value={item.class_name}>
                    {item.class_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={() => void reassignTeacherClass()} disabled={loading}>
            执行调班
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>幼儿转班</CardTitle>
          <CardDescription>当删除班级提示有幼儿占用时，可在此快速完成转班。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 md:items-end">
          {recentChildChange ? (
            <div className="md:col-span-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              已定位最近转班幼儿：{recentChildChange.name}，当前班级 {recentChildChange.className}。
            </div>
          ) : null}

          {childSourceClassFilter ? (
            <div className="md:col-span-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              当前仅显示来源班级为“{childSourceClassFilter}”的幼儿（{filteredChildren.length} 人）。
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setChildSourceClassFilter("")}
              >
                清除筛选
              </button>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>幼儿</Label>
            <Select value={selectedChildId} onValueChange={setSelectedChildId}>
              <SelectTrigger>
                <SelectValue placeholder="选择幼儿" />
              </SelectTrigger>
              <SelectContent>
                {filteredChildren.map((child) => (
                  <SelectItem key={child.id} value={child.id}>
                    {child.id === recentChildChange?.id ? "[最新] " : ""}
                    {child.name}（当前：{child.class_name}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>目标班级</Label>
            <Select value={targetChildClassName} onValueChange={setTargetChildClassName}>
              <SelectTrigger>
                <SelectValue placeholder="选择目标班级" />
              </SelectTrigger>
              <SelectContent>
                {sortedClasses.map((item) => (
                  <SelectItem key={item.id} value={item.class_name}>
                    {item.class_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={() => void reassignChildClass()} disabled={loading}>
            执行转班
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(targetDeleteClass)}
        onOpenChange={(open) => {
          if (!open) {
            setTargetDeleteClass(null);
            setDeleteConflict(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除班级</DialogTitle>
            <DialogDescription>
              你将删除“{targetDeleteClass?.class_name ?? ""}”，该操作不可恢复。
            </DialogDescription>
          </DialogHeader>

          {deleteConflict && (deleteConflict.childCount > 0 || deleteConflict.teacherCount > 0) ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              当前班级仍被占用：幼儿 {deleteConflict.childCount} 人，教师 {deleteConflict.teacherCount} 人。请先完成转班。
            </p>
          ) : null}

          {deleteConflict && deleteConflict.childCount === 0 && deleteConflict.teacherCount === 0 ? (
            <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">
              当前班级占用已清零，可以直接确认删除。
            </p>
          ) : null}

          {targetDeleteClass ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const sourceClass = targetDeleteClass.class_name;
                  setTeacherSourceClassFilter(sourceClass);
                  setSelectedTeacherId("");
                  const fallbackTargetClass = getFirstAlternativeClass(sourceClass);
                  if (fallbackTargetClass) {
                    setTargetClassName(fallbackTargetClass);
                  }
                }}
              >
                快速筛选教师占用
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const sourceClass = targetDeleteClass.class_name;
                  setChildSourceClassFilter(sourceClass);
                  setSelectedChildId("");
                  const fallbackTargetClass = getFirstAlternativeClass(sourceClass);
                  if (fallbackTargetClass) {
                    setTargetChildClassName(fallbackTargetClass);
                  }
                }}
              >
                快速筛选幼儿占用
              </Button>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTargetDeleteClass(null);
                setDeleteConflict(null);
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!targetDeleteClass || loading}
              onClick={() => {
                if (!targetDeleteClass) return;
                void removeClass(targetDeleteClass.id);
              }}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>最近操作日志</CardTitle>
          <CardDescription>记录机构主数据与班级分配的最近变更，便于审计追踪。</CardDescription>
        </CardHeader>
        <CardContent>
          {auditLogs.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">暂无操作日志</p>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div key={log.id} className="rounded-md border border-slate-200 p-3 text-sm">
                  <p className="font-medium text-slate-700">
                    {getActionLabel(log.action)} · {getEntityLabel(log.entity_type)}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    操作者：{log.actor_name?.trim() || "未知用户"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">{getLogSummary(log)}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(log.created_at).toLocaleString("zh-CN", { hour12: false })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}