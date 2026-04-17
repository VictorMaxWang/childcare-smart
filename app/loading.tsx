import AmbientBackground from "@/components/visuals/AmbientBackground";

export default function GlobalLoading() {
  return (
    <AmbientBackground intensity="light" interactive={false} className="py-6">
      <div className="mx-auto max-w-7xl px-6 page-enter">
        <div className="surface-luminous mb-8 rounded-[2rem] border border-white/70 p-7 shadow-[var(--shadow-card)]">
          <div className="h-6 w-48 rounded-full bg-slate-100 skeleton-pulse" />
          <div className="mt-4 h-4 w-3/5 rounded-full bg-slate-100 skeleton-pulse" />
          <div className="mt-2 h-4 w-2/5 rounded-full bg-slate-100 skeleton-pulse" />
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="surface-solid rounded-[1.75rem] border border-white/70 p-6 shadow-[var(--shadow-card)]">
              <div className="h-4 w-20 rounded-full bg-slate-100 skeleton-pulse" />
              <div className="mt-4 h-8 w-16 rounded-full bg-slate-100 skeleton-pulse" />
              <div className="mt-4 h-3 w-24 rounded-full bg-slate-100 skeleton-pulse" />
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <div className="surface-solid xl:col-span-2 rounded-[1.75rem] border border-white/70 p-6 shadow-[var(--shadow-card)]">
            <div className="h-5 w-32 rounded-full bg-slate-100 skeleton-pulse" />
            <div className="mt-5 h-70 rounded-[1.75rem] bg-slate-50 skeleton-pulse" />
          </div>
          <div className="surface-solid rounded-[1.75rem] border border-white/70 p-6 shadow-[var(--shadow-card)]">
            <div className="h-5 w-28 rounded-full bg-slate-100 skeleton-pulse" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-16 rounded-2xl bg-slate-50 skeleton-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </AmbientBackground>
  );
}
