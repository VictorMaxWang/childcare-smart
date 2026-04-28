import { LoadingState, SkeletonBlock } from "@/components/ui/state-block";

export default function GlobalLoading() {
  return (
    <div className="app-page page-enter">
      <LoadingState
        className="mb-6 min-h-44"
        title="正在加载页面"
        description="系统正在整理当前角色的页面内容、列表记录和最新状态。"
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-32" />
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="rounded-[1.6rem] border border-indigo-100 bg-white/92 p-5 shadow-[0_18px_52px_rgb(79_70_229_/_0.08)] xl:col-span-2">
          <SkeletonBlock className="h-5 min-h-0 w-32" />
          <SkeletonBlock className="mt-5 h-70" />
        </div>
        <div className="rounded-[1.6rem] border border-indigo-100 bg-white/92 p-5 shadow-[0_18px_52px_rgb(79_70_229_/_0.08)]">
          <SkeletonBlock className="h-5 min-h-0 w-28" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-16 min-h-0" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
