"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Baby } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function LoginPage() {
  const router = useRouter();
  const { users, login, isAuthenticated, authLoading } = useApp();

  const [userId, setUserId] = useState(users[0]?.id ?? "u-teacher");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const nextPath = new URLSearchParams(window.location.search).get("next") || "/";
      router.replace(nextPath);
      router.refresh();
    }
  }, [authLoading, isAuthenticated, router]);

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
    const nextPath = new URLSearchParams(window.location.search).get("next") || "/";
    router.replace(nextPath);
    router.refresh();
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-gradient-to-b from-sky-50 to-white px-6 py-10 page-enter">
      <Card className="w-full max-w-md border-sky-100 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl text-slate-800">
            <Baby className="h-6 w-6 text-sky-600" />
            登录普惠托育平台
          </CardTitle>
          <CardDescription>请选择账号并输入密码后进入系统。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user">账号</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id="user">
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
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                required
              />
            </div>
            {message ? <p className="text-sm text-red-600">{message}</p> : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "登录中..." : "登录"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
