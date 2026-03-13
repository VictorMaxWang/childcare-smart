"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Baby, Eye, EyeOff, HeartPulse, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { users, login, isAuthenticated, authLoading } = useApp();

  const [userId, setUserId] = useState(users[0]?.id ?? "u-teacher");
  const [password, setPassword] = useState("123456");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const nextPath = useMemo(() => {
    const rawNextPath = searchParams.get("next") || "/";
    if (rawNextPath === "/login" || rawNextPath === "/auth/login") {
      return "/";
    }
    return rawNextPath;
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace(nextPath);
    }
  }, [authLoading, isAuthenticated, nextPath, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const result = await login(userId, password);
    setLoading(false);
    if (!result.ok) {
      setMessage(result.error || "登录失败");
      return;
    }
    router.replace(nextPath);
  }

  return (
    <div className="relative min-h-[calc(100vh-64px)] overflow-hidden px-6 py-10 page-enter spotlight-bg">
      <div className="absolute inset-0 pointer-events-none">
        <div className="float-soft absolute left-[6%] top-[14%] h-24 w-24 rounded-[28px] bg-white/20 blur-sm" />
        <div className="float-soft absolute right-[10%] top-[20%] h-40 w-40 rounded-full bg-cyan-300/20 blur-2xl" style={{ animationDelay: "1s" }} />
        <div className="float-soft absolute bottom-[8%] left-[35%] h-28 w-28 rounded-full bg-violet-300/20 blur-2xl" style={{ animationDelay: "2s" }} />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-144px)] max-w-7xl overflow-hidden rounded-4xl border border-white/60 bg-white/40 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur-sm lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative overflow-hidden bg-linear-to-br from-indigo-600 via-violet-600 to-sky-600 px-8 py-10 text-white sm:px-10 lg:px-12 lg:py-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.24),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(125,211,252,0.22),transparent_32%)]" />
          <div className="relative z-10 flex h-full flex-col justify-between gap-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-sm">
                <Sparkles className="h-4 w-4" />
                商业级智慧托育运营中台
              </div>
              <h1 className="mt-8 max-w-xl text-4xl font-black leading-tight sm:text-5xl">
                智慧普惠托育平台
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-white/82 sm:text-base">
                将晨检、饮食、成长观察、家园共育与 AI 干预串成一个真正可运营、可展示、可复盘的商业产品界面。
              </p>
            </div>

            <div className="grid gap-4">
              <FeatureRow icon={<Workflow className="h-5 w-5" />} title="家园共育闭环" description="从园内观察到家长反馈，再到机构复盘，全流程联动可追踪。" />
              <FeatureRow icon={<HeartPulse className="h-5 w-5" />} title="IoT 健康监测联动" description="实时感知健康指标与环境数据，提升平台的智能硬件产品感。" />
              <FeatureRow icon={<ShieldCheck className="h-5 w-5" />} title="AI 干预与机构决策" description="把周报、异常预警和干预建议直接转化为管理动作。" />
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-8 sm:px-8 lg:px-10">
          <Card className="glass w-full max-w-xl rounded-[28px] border-white/60 bg-white/75 shadow-[0_18px_60px_rgba(15,23,42,0.14)]">
            <CardHeader className="space-y-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-100 to-sky-100 shadow-sm">
                  <Baby className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <CardTitle className="text-2xl text-slate-800">欢迎登录</CardTitle>
                  <CardDescription className="mt-1">选择体验角色并进入系统控制台。</CardDescription>
                </div>
              </div>
              <div className="section-divider" />
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="user">体验账号</Label>
                  <Select value={userId} onValueChange={setUserId}>
                    <SelectTrigger id="user" className="h-11 rounded-xl bg-white/90">
                      <SelectValue placeholder="选择账号" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.avatar} {user.name}（{user.role}）
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">登录密码</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="请输入密码"
                      autoComplete="current-password"
                      required
                      className="h-11 rounded-xl bg-white/90 pr-11"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "当前为明文密码，点击隐藏" : "当前为隐藏密码，点击显示"}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                    >
                      {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {message ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">{message}</p> : null}

                <Button type="submit" variant="premium" className="h-11 w-full rounded-xl" disabled={loading}>
                  {loading ? "登录中..." : "进入平台"}
                </Button>

                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
                  演示建议：先使用教师或机构管理员账号进入，可完整查看监控大屏、成长干预和 AI 报告能力。
                </div>

                <p className="text-center text-xs text-slate-400">© 2026 智慧普惠托育研究课题组</p>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function FeatureRow({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-white/14 bg-white/10 px-5 py-4 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 text-white">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-white/76">{description}</p>
        </div>
      </div>
    </div>
  );
}
