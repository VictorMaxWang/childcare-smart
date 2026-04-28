"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Baby,
  ClipboardCheck,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { FilterBar } from "@/components/ui/filter-bar";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PermissionState, ErrorState, LoadingState, SkeletonBlock } from "@/components/ui/state-block";
import { Textarea } from "@/components/ui/textarea";

type StateKey = "table-filter" | "form-detail" | "modal" | "drawer" | "empty" | "error" | "permission" | "loading";

const demoRows = [
  { name: "林小雨", avatar: "👧", className: "向阳班", age: "2岁8个月", status: "今日出勤", risk: "低风险", time: "08:25" },
  { name: "张浩然", avatar: "👦", className: "向阳班", age: "3岁11个月", status: "今日出勤", risk: "关注睡眠", time: "08:56" },
  { name: "乐乐", avatar: "🧒", className: "小小班", age: "2岁2个月", status: "待晨检", risk: "过敏：牛奶", time: "--" },
  { name: "糖糖", avatar: "👧", className: "托小班", age: "1岁11个月", status: "请假", risk: "饮食观察", time: "请假" },
];

export default function VisualParityStatesPage() {
  const searchParams = useSearchParams();
  const state = parseStateKey(searchParams.get("state"));

  return (
    <div className="app-page max-w-[86rem] page-enter">
      <section className="mb-6 overflow-hidden rounded-[1.8rem] border border-indigo-100 bg-[linear-gradient(135deg,#f8fbff_0%,#eef2ff_48%,#ecfeff_100%)] p-5 shadow-[0_24px_72px_rgb(79_70_229_/_0.10)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info" className="rounded-full px-3 py-1">Visual QA</Badge>
              <Badge variant="secondary" className="rounded-full px-3 py-1">Round 5</Badge>
            </div>
            <h1 className="mt-4 text-3xl font-semibold leading-tight text-slate-950">通用状态视觉还原面板</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              集中验证表格、筛选、表单、弹窗、抽屉、空状态、错误、权限和 loading/skeleton 的视觉一致性。
            </p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
            {(["table-filter", "form-detail", "modal", "drawer", "empty", "error", "permission", "loading"] as StateKey[]).map((item) => (
              <Button key={item} asChild variant={state === item ? "default" : "outline"} className="rounded-2xl">
                <Link href={`/visual-parity/states?state=${item}`}>{item}</Link>
              </Button>
            ))}
          </div>
        </div>
      </section>

      {state === "table-filter" ? <TableFilterDemo /> : null}
      {state === "form-detail" ? <FormDetailDemo /> : null}
      {state === "empty" ? <EmptyDemo /> : null}
      {state === "error" ? <ErrorDemo /> : null}
      {state === "permission" ? <PermissionDemo /> : null}
      {state === "loading" ? <LoadingDemo /> : null}

      <Dialog open={state === "modal"} onOpenChange={() => undefined}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <AlertTriangle className="h-6 w-6" />
              </span>
              确认删除儿童档案
            </DialogTitle>
            <DialogDescription>
              删除后，该儿童的出勤、饮食、成长与反馈记录将从当前视图中移除，请谨慎操作。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">👧</span>
              <div>
                <p className="font-semibold text-slate-950">林小雨 · 向阳班</p>
                <p className="mt-1 text-sm text-slate-500">2岁8个月 · 家长 林妈妈 · 过敏：牛奶、芒果</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            如需保留历史记录，可先将儿童状态设为“离园”，再由园长归档。
          </div>
          <DialogFooter>
            <Button variant="outline">取消</Button>
            <Button variant="destructive">确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Drawer open={state === "drawer"} onOpenChange={() => undefined}>
        <DrawerContent side="left">
          <DrawerHeader>
            <DrawerTitle className="text-xl font-semibold text-slate-950">移动端角色抽屉</DrawerTitle>
            <p className="mt-2 text-sm text-slate-500">教师端 · 李老师 · 向阳班</p>
          </DrawerHeader>
          <DrawerBody>
            <div className="rounded-[1.5rem] border border-indigo-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Sparkles className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-semibold text-slate-950">今日优先处理</p>
                  <p className="mt-1 text-sm text-slate-500">晨检异常 1 人 · 家园沟通 1 条</p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {[
                ["工作台", Users],
                ["晨检与健康", ShieldCheck],
                ["成长行为", Baby],
                ["饮食记录", ClipboardCheck],
              ].map(([label, Icon]) => {
                const NavIcon = Icon as typeof Users;
                return (
                  <div key={label as string} className="flex min-h-14 items-center gap-3 rounded-2xl bg-white px-4 shadow-sm">
                    <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                      <NavIcon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-slate-700">{label as string}</span>
                  </div>
                );
              })}
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="outline">退出登录</Button>
            <Button>进入工作台</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function parseStateKey(value: string | null): StateKey {
  const allowed: StateKey[] = ["table-filter", "form-detail", "modal", "drawer", "empty", "error", "permission", "loading"];
  return allowed.includes(value as StateKey) ? (value as StateKey) : "table-filter";
}

function TableFilterDemo() {
  return (
    <div className="space-y-6">
      <FilterBar
        search={
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-11" placeholder="搜索姓名、监护人、班级、年龄段、健康标签..." />
          </div>
        }
        filters={
          <div className="flex flex-wrap gap-2">
            {["全部", "1-3岁：9", "3-6岁：24", "今日出勤", "待晨检"].map((item) => (
              <Badge key={item} variant="secondary" className="rounded-full px-3 py-1">{item}</Badge>
            ))}
          </div>
        }
        actions={<Button variant="premium" className="gap-2"><UserPlus className="h-4 w-4" />新增档案</Button>}
      />
      <DataTableShell title="儿童档案台账" description="桌面端按管理台账展示，保留状态、风险和操作入口。" footer={<span>共 36 条 · 10条/页</span>}>
        <table className="min-w-[920px] text-left text-sm">
          <thead>
            <tr>
              <th className="px-5 py-4">儿童</th>
              <th className="px-5 py-4">班级 / 年龄</th>
              <th className="px-5 py-4">健康风险</th>
              <th className="px-5 py-4">今日状态</th>
              <th className="px-5 py-4">最近动态</th>
              <th className="px-5 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-indigo-50 bg-white">
            {demoRows.map((row) => (
              <tr key={row.name}>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-xl">{row.avatar}</span>
                    <div>
                      <p className="font-semibold text-slate-950">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.className}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-slate-600">{row.age}</td>
                <td className="px-5 py-4"><Badge variant={row.risk.includes("低") ? "success" : "warning"}>{row.risk}</Badge></td>
                <td className="px-5 py-4 text-slate-600">{row.status}</td>
                <td className="px-5 py-4 text-slate-600">{row.time}</td>
                <td className="px-5 py-4 text-right"><Button variant="ghost" size="sm">查看</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableShell>
    </div>
  );
}

function FormDetailDemo() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-[1.6rem] border border-indigo-100 bg-white/92 p-5 shadow-[0_22px_70px_rgb(79_70_229_/_0.08)]">
        <div className="mb-5 flex items-center gap-4 rounded-[1.4rem] bg-indigo-50/70 p-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-3xl shadow-sm">👧</span>
          <div>
            <p className="text-2xl font-semibold text-slate-950">林小雨</p>
            <p className="mt-1 text-sm text-slate-500">向阳班 · 2岁8个月 · 今日状态良好</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="姓名" required><Input defaultValue="林小雨" /></FormField>
          <FormField label="出生日期" required description="系统会自动计算年龄段"><Input type="date" defaultValue="2023-08-12" /></FormField>
          <FormField label="监护人"><Input defaultValue="林妈妈" /></FormField>
          <FormField label="联系电话"><Input defaultValue="138****1024" /></FormField>
          <FormField label="过敏信息" error="牛奶、芒果过敏，请同步饮食拦截。"><Input defaultValue="牛奶、芒果" /></FormField>
          <FormField label="班级"><Input defaultValue="向阳班" /></FormField>
          <FormField label="特殊关注" className="md:col-span-2" description="用于晨检、饮食和成长记录的协同提醒。">
            <Textarea defaultValue="午睡衔接较慢，近期需要关注饮食摄入和语言表达。" />
          </FormField>
        </div>
      </section>
      <aside className="space-y-4">
        {["晨检 36.5°C", "饮食 91分", "成长记录 12条"].map((item) => (
          <div key={item} className="rounded-[1.4rem] border border-indigo-100 bg-white/92 p-5 shadow-sm">
            <p className="text-sm text-slate-500">摘要</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{item}</p>
          </div>
        ))}
      </aside>
    </div>
  );
}

function EmptyDemo() {
  return <EmptyState icon={<Search className="h-7 w-7" />} title="没有找到匹配记录" description="可以调整搜索词、重置筛选条件，或先新增一条儿童档案记录。" actionLabel="新增档案" onAction={() => undefined} />;
}

function ErrorDemo() {
  return <ErrorState title="数据暂时不可用" description="当前模块没有影响主流程，稍后刷新即可重新加载最新记录。" action={<Button>重新加载</Button>} />;
}

function PermissionDemo() {
  return (
    <PermissionState
      title="当前无权查看健康信息"
      description="为保护儿童隐私，体温、饮食和用药等记录仅对授权角色开放。"
      action={
        <>
          <Button className="gap-2"><LockKeyhole className="h-4 w-4" />申请查看权限</Button>
          <Button variant="outline">联系老师</Button>
        </>
      }
    />
  );
}

function LoadingDemo() {
  return (
    <div className="space-y-6">
      <LoadingState title="正在生成页面骨架" description="保持页面布局稳定，等待业务数据加载完成。" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => <SkeletonBlock key={item} className="h-28" />)}
      </div>
      <div className="rounded-[1.6rem] border border-indigo-100 bg-white/92 p-5">
        <SkeletonBlock className="h-5 min-h-0 w-40" />
        <SkeletonBlock className="mt-5 h-64" />
      </div>
    </div>
  );
}
