import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/state-block";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-(--background) px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <ErrorState
          title="页面不存在"
          description="请返回当前角色首页，或重新从导航进入目标功能。"
          action={
            <Button asChild>
              <Link href="/login">返回登录页</Link>
            </Button>
          }
        />
      </div>
    </main>
  );
}
