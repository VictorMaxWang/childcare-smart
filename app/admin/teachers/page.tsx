"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Copy, Eye, GraduationCap, KeyRound, Pencil, RotateCcw, Search, UserPlus, UsersRound } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { ErrorState, LoadingState } from "@/components/ui/state-block";
import { StatusTag } from "@/components/ui/status-tag";
import { ApiClientError } from "@/lib/api/errors";
import {
  createMemberInvitation,
  type CreatedMemberInvitation,
} from "@/lib/api/member-invitations";
import { archiveTeacher, createTeacher, listTeachers, updateTeacher } from "@/lib/api/teachers";
import type { ApiTeacher, ApiTeacherInput } from "@/lib/api/types";
import { INSTITUTION_NAME } from "@/lib/store";
import { toast } from "sonner";

type TeacherFormState = {
  name: string;
  className: string;
};

const DEFAULT_FORM: TeacherFormState = {
  name: "",
  className: "向阳班",
};

function apiErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return `${error.message}（${error.code}）`;
  }
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

function formFromTeacher(teacher: ApiTeacher): TeacherFormState {
  return {
    name: teacher.name,
    className: teacher.className ?? "",
  };
}

function buildPayload(form: TeacherFormState): ApiTeacherInput {
  return {
    name: form.name.trim(),
    className: form.className.trim() || undefined,
  };
}

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<ApiTeacher[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "archive" | "restore"; teacher: ApiTeacher } | null>(null);
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [form, setForm] = useState<TeacherFormState>(DEFAULT_FORM);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteClassName, setInviteClassName] = useState(DEFAULT_FORM.className);
  const [inviteTeacherId, setInviteTeacherId] = useState<string | undefined>();
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [createdInvitation, setCreatedInvitation] = useState<CreatedMemberInvitation | null>(null);

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTeachers(await listTeachers({ includeArchived }));
    } catch (requestError) {
      const message = apiErrorMessage(requestError);
      setError(message);
      toast.error("教师列表读取失败", { description: message });
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    void loadTeachers();
  }, [loadTeachers]);

  const activeTeachers = useMemo(() => teachers.filter((teacher) => !teacher.archivedAt), [teachers]);
  const archivedTeachers = useMemo(() => teachers.filter((teacher) => teacher.archivedAt), [teachers]);
  const classCount = useMemo(() => {
    return new Set(activeTeachers.map((teacher) => teacher.className).filter(Boolean)).size;
  }, [activeTeachers]);

  const filteredTeachers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return teachers.filter((teacher) => {
      const text = [
        teacher.name,
        teacher.className,
        teacher.teacherId,
        teacher.userId,
        teacher.archivedAt ? "已归档" : "在职",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return !keyword || text.includes(keyword);
    });
  }, [search, teachers]);

  const selectedTeacher = selectedTeacherId
    ? teachers.find((teacher) => teacher.teacherId === selectedTeacherId || teacher.userId === selectedTeacherId) ?? null
    : null;

  function resetForm() {
    setForm(DEFAULT_FORM);
    setEditingTeacherId(null);
    setFormError("");
  }

  function openCreateForm() {
    resetForm();
    setFormOpen(true);
  }

  function openEditForm(teacher: ApiTeacher) {
    setForm(formFromTeacher(teacher));
    setEditingTeacherId(teacher.teacherId);
    setFormError("");
    setFormOpen(true);
  }

  function openInviteForm(teacher?: ApiTeacher) {
    setInviteTeacherId(teacher?.teacherId);
    setInviteClassName(teacher?.className || DEFAULT_FORM.className);
    setInviteError("");
    setCreatedInvitation(null);
    setInviteOpen(true);
  }

  function resetInviteForm() {
    setInviteTeacherId(undefined);
    setInviteClassName(DEFAULT_FORM.className);
    setInviteError("");
    setCreatedInvitation(null);
  }

  async function handleCreateInvitation() {
    if (!inviteClassName.trim()) {
      setInviteError("请填写教师要加入的班级。");
      return;
    }

    setInviteSaving(true);
    setInviteError("");
    try {
      const invitation = await createMemberInvitation({
        role: "教师",
        className: inviteClassName.trim(),
        teacherId: inviteTeacherId,
      });
      setCreatedInvitation(invitation);
      toast.success("教师邀请码已生成", {
        description: "邀请码仅限教师账号使用，24 小时内有效。",
      });
    } catch (requestError) {
      const message = apiErrorMessage(requestError);
      setInviteError(message);
      toast.error("邀请码生成失败", { description: message });
    } finally {
      setInviteSaving(false);
    }
  }

  async function copyInvitationCode() {
    if (!createdInvitation) return;
    try {
      await navigator.clipboard.writeText(createdInvitation.code);
      toast.success("邀请码已复制");
    } catch {
      toast.warning("浏览器未允许复制，请手动记录邀请码。");
    }
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      const message = "请填写教师姓名。";
      setFormError(message);
      toast.warning(message);
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const payload = buildPayload(form);
      if (editingTeacherId) {
        await updateTeacher(editingTeacherId, payload);
        toast.success("教师信息已更新", { description: "姓名和班级分配已写入 E01 teachers API。" });
      } else {
        await createTeacher(payload);
        toast.success("教师已新增", { description: "教师档案已写入 E01 teachers API。" });
      }
      setFormOpen(false);
      resetForm();
      await loadTeachers();
    } catch (requestError) {
      const message = apiErrorMessage(requestError);
      setFormError(message);
      toast.error(editingTeacherId ? "教师信息更新失败" : "教师新增失败", { description: message });
    } finally {
      setSaving(false);
    }
  }

  function requestArchive(teacher: ApiTeacher) {
    setConfirmAction({ type: "archive", teacher });
  }

  function requestRestore(teacher: ApiTeacher) {
    setConfirmAction({ type: "restore", teacher });
  }

  async function performArchive(teacher: ApiTeacher) {
    try {
      await archiveTeacher(teacher.teacherId, { action: "archive", archiveReason: "E02 页面归档" });
      toast.success("教师档案已归档", { description: "删除动作已按产品规则转为软归档。" });
      if (selectedTeacherId === teacher.teacherId) setSelectedTeacherId(null);
      await loadTeachers();
    } catch (requestError) {
      toast.error("教师档案归档失败", { description: apiErrorMessage(requestError) });
    }
  }

  async function performRestore(teacher: ApiTeacher) {
    try {
      await archiveTeacher(teacher.teacherId, { action: "restore" });
      toast.success("教师档案已恢复", { description: "恢复动作已写入审计字段。" });
      await loadTeachers();
    } catch (requestError) {
      toast.error("教师档案恢复失败", { description: apiErrorMessage(requestError) });
    }
  }

  async function handleConfirmAction() {
    if (!confirmAction) return;
    setConfirmSaving(true);
    try {
      if (confirmAction.type === "archive") {
        await performArchive(confirmAction.teacher);
      } else {
        await performRestore(confirmAction.teacher);
      }
      setConfirmAction(null);
    } finally {
      setConfirmSaving(false);
    }
  }

  return (
    <div className="app-page max-w-[86rem] page-enter" data-testid="r05-teachers-page">
      <section className="mb-5 overflow-hidden rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,#f8fbff_0%,#eef2ff_48%,#ecfeff_100%)] p-4 shadow-[0_20px_60px_rgb(79_70_229_/_0.10)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info" className="rounded-full px-3 py-1">
                {INSTITUTION_NAME}
              </Badge>
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                园长专用
              </Badge>
              {includeArchived ? <Badge variant="warning">包含归档</Badge> : null}
            </div>
            <h1 className="mt-4 flex items-center gap-3 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">
              <GraduationCap className="h-7 w-7 text-indigo-500" />
              教师管理
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              管理教师档案、班级分配和归档状态。所有操作都通过 E01 teachers API 和 `lib/server/scope.ts` 完成权限校验。
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <Button variant="premium" className="min-h-11 rounded-2xl" onClick={openCreateForm} data-testid="e02-open-add-teacher">
              <UserPlus className="mr-2 h-4 w-4" />
              新增教师
            </Button>
            <Button variant="outline" className="min-h-11 rounded-2xl" onClick={() => openInviteForm()} data-testid="teacher-open-invite">
              <KeyRound className="mr-2 h-4 w-4" />
              邀请注册教师
            </Button>
            <Button variant="outline" className="min-h-11 rounded-2xl" onClick={() => setIncludeArchived((value) => !value)} data-testid="e02-toggle-archived-teachers">
              {includeArchived ? "隐藏归档教师" : "查看归档教师"}
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { label: "在职教师", value: `${activeTeachers.length}位`, bar: "bg-indigo-400" },
            { label: "覆盖班级", value: `${classCount}个`, bar: "bg-emerald-400" },
            { label: "归档教师", value: `${archivedTeachers.length}位`, bar: "bg-amber-400" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/82 bg-white/84 p-4 shadow-sm">
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
              <span className={`mt-3 inline-flex h-1.5 w-12 rounded-full ${item.bar}`} />
            </div>
          ))}
        </div>
      </section>

      <FilterBar
        className="mb-6"
        search={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-10"
              placeholder="搜索教师姓名、班级、账号或归档状态..."
              data-testid="e02-teacher-search"
            />
          </div>
        }
        filters={
          <div className="flex flex-wrap gap-2">
            {Array.from(new Set(activeTeachers.map((teacher) => teacher.className).filter(Boolean))).map((className) => (
              <Badge key={className} variant="secondary" className="px-3 py-1 text-xs">
                {className}
              </Badge>
            ))}
          </div>
        }
      />

      {error ? (
        <div className="mb-5">
          <ErrorState
            title="教师列表读取失败"
            description={error}
            action={
              <Button type="button" variant="outline" onClick={() => void loadTeachers()}>
                重试
              </Button>
            }
          />
        </div>
      ) : null}

      {loading ? (
        <LoadingState title="正在读取教师列表" description="系统正在同步 teachers API 与归档状态。" />
      ) : filteredTeachers.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="h-6 w-6" />}
          title="未找到匹配教师"
          description={includeArchived ? "当前没有匹配的在职或归档教师。" : "默认列表会隐藏归档教师，可切换查看归档。"}
          actionLabel="新增教师"
          onAction={openCreateForm}
        />
      ) : (
        <DataTableShell
          title="教师档案台账"
          description="教师端和家长端不能访问教师管理；直接请求 API 会返回统一 403。"
          footer={<span>共 {filteredTeachers.length} 位教师</span>}
        >
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-5 py-3">教师</th>
                <th className="px-5 py-3">班级分配</th>
                <th className="px-5 py-3">账号绑定</th>
                <th className="px-5 py-3">状态</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredTeachers.map((teacher) => (
                <tr key={teacher.teacherId} className="transition hover:bg-slate-50/80" data-testid={`e02-teacher-row-${teacher.teacherId}`}>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      className="font-semibold text-slate-900 underline-offset-4 transition hover:text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                      onClick={() => setSelectedTeacherId(teacher.teacherId)}
                    >
                      {teacher.name}
                    </button>
                    <p className="mt-1 text-xs text-slate-500">{teacher.teacherId}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{teacher.className ?? "未分配"}</td>
                  <td className="px-5 py-4 text-slate-600">{teacher.userId ?? "未绑定登录账号"}</td>
                  <td className="px-5 py-4">
                    <StatusTag variant={teacher.archivedAt ? "warning" : "success"} showDot>
                      {teacher.archivedAt ? "已归档" : "在职"}
                    </StatusTag>
                    {teacher.archivedAt ? <p className="mt-2 text-xs text-slate-500">归档于 {teacher.archivedAt.slice(0, 10)}</p> : null}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedTeacherId(teacher.teacherId)}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        详情
                      </Button>
                      {teacher.archivedAt ? (
                        <Button variant="outline" size="sm" onClick={() => requestRestore(teacher)} data-testid={`e02-restore-teacher-${teacher.teacherId}`}>
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          恢复
                        </Button>
                      ) : (
                        <>
                          {!teacher.userId ? (
                            <Button variant="outline" size="sm" onClick={() => openInviteForm(teacher)} data-testid={`teacher-invite-${teacher.teacherId}`}>
                              <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                              绑定账号
                            </Button>
                          ) : null}
                          <Button variant="outline" size="sm" onClick={() => openEditForm(teacher)} data-testid={`e02-edit-teacher-${teacher.teacherId}`}>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            编辑
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => requestArchive(teacher)} data-testid={`e02-archive-teacher-${teacher.teacherId}`}>
                            <Archive className="mr-1.5 h-3.5 w-3.5" />
                            归档
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      )}

      <Dialog open={formOpen} onOpenChange={(value) => (!value ? (setFormOpen(false), resetForm()) : setFormOpen(true))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTeacherId ? "编辑教师" : "新增教师"}</DialogTitle>
            <DialogDescription>教师管理 MVP 支持姓名和班级分配。手机号、账号邀请和停用登录留给后续产品范围。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <FormField label="教师姓名" required error={formError && !form.name.trim() ? "请填写教师姓名。" : undefined}>
              <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} data-testid="e02-teacher-name" />
            </FormField>
            <FormField label="分配班级" description="可填写现有班级名，例如：向阳班、晨曦班。">
              <Input value={form.className} onChange={(event) => setForm((prev) => ({ ...prev, className: event.target.value }))} data-testid="e02-teacher-class" />
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
            <Button onClick={() => void handleSubmit()} loading={saving} data-testid="e02-save-teacher">
              {editingTeacherId ? "保存修改" : "新增教师"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={inviteOpen}
        onOpenChange={(value) => {
          setInviteOpen(value);
          if (!value) resetInviteForm();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>邀请注册教师加入机构</DialogTitle>
            <DialogDescription>
              邀请码限定教师角色和班级，教师需登录自己的真实账号后主动接受。
            </DialogDescription>
          </DialogHeader>
          {createdInvitation ? (
            <div className="space-y-4 py-2">
              <div className="border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-900">一次性邀请码</p>
                <code className="mt-2 block break-all text-xl font-semibold text-emerald-950" data-testid="teacher-invite-code">
                  {createdInvitation.code}
                </code>
                <p className="mt-2 text-xs text-emerald-800">
                  班级：{createdInvitation.className} · 有效期至{" "}
                  {new Date(createdInvitation.expiresAt).toLocaleString("zh-CN")}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => void copyInvitationCode()} className="w-full">
                <Copy className="mr-2 h-4 w-4" />
                复制邀请码
              </Button>
            </div>
          ) : (
            <div className="py-2">
              <FormField label="分配班级" required description={inviteTeacherId ? "接受后会绑定到选中的教师档案。" : "接受后会自动创建登录账号对应的教师档案。"}>
                <Input
                  value={inviteClassName}
                  onChange={(event) => setInviteClassName(event.target.value)}
                  data-testid="teacher-invite-class"
                />
              </FormField>
            </div>
          )}
          {inviteError ? (
            <p className="border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              {inviteError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              {createdInvitation ? "完成" : "取消"}
            </Button>
            {!createdInvitation ? (
              <Button onClick={() => void handleCreateInvitation()} loading={inviteSaving} data-testid="teacher-create-invite">
                生成邀请码
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Drawer open={Boolean(selectedTeacher)} onOpenChange={(value) => !value && setSelectedTeacherId(null)}>
        <DrawerContent side="right">
          {selectedTeacher ? (
            <>
              <DrawerHeader>
                <DrawerTitle className="text-xl font-semibold text-slate-950">{selectedTeacher.name}</DrawerTitle>
                <DrawerDescription className="mt-2 text-sm leading-6 text-slate-500">查看教师基础信息、班级分配和归档状态。</DrawerDescription>
              </DrawerHeader>
              <DrawerBody className="space-y-4">
                <InfoItem label="教师 ID" value={selectedTeacher.teacherId} />
                <InfoItem label="登录账号绑定" value={selectedTeacher.userId ?? "未绑定登录账号"} />
                <InfoItem label="机构" value={selectedTeacher.institutionId} />
                <InfoItem label="班级分配" value={selectedTeacher.className ?? "未分配"} />
                <InfoItem label="状态" value={selectedTeacher.archivedAt ? `已归档：${selectedTeacher.archivedAt.slice(0, 10)}` : "在职"} />
                <InfoItem label="最后更新" value={selectedTeacher.updatedAt.slice(0, 10)} />
              </DrawerBody>
              <DrawerFooter>
                <Button variant="outline" onClick={() => setSelectedTeacherId(null)}>
                  关闭
                </Button>
                {selectedTeacher.archivedAt ? (
                  <Button onClick={() => requestRestore(selectedTeacher)} data-testid="e02-detail-restore-teacher">
                    恢复教师
                  </Button>
                ) : (
                  <Button onClick={() => openEditForm(selectedTeacher)} data-testid="e02-detail-edit-teacher">
                    编辑教师
                  </Button>
                )}
              </DrawerFooter>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
      <ConfirmDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={confirmAction?.type === "archive" ? "确认归档教师档案" : "确认恢复教师档案"}
        description={
          confirmAction
            ? `${confirmAction.teacher.name} 的档案将在确认后${
                confirmAction.type === "archive" ? "从默认列表隐藏" : "重新回到默认列表"
              }。取消不会写入数据。`
            : undefined
        }
        confirmLabel={confirmAction?.type === "archive" ? "确认归档" : "确认恢复"}
        cancelLabel="取消"
        variant={confirmAction?.type === "archive" ? "danger" : "default"}
        loading={confirmSaving}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 break-words font-medium text-slate-700">{value}</p>
    </div>
  );
}
