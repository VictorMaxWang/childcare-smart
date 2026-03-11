export default function GlobalLoading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8 page-enter">
      <div className="mb-8 rounded-3xl border border-slate-100 bg-white p-7 shadow-sm">
        <div className="h-6 w-48 rounded bg-slate-100 skeleton-pulse" />
        <div className="mt-4 h-4 w-3/5 rounded bg-slate-100 skeleton-pulse" />
        <div className="mt-2 h-4 w-2/5 rounded bg-slate-100 skeleton-pulse" />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="h-4 w-20 rounded bg-slate-100 skeleton-pulse" />
            <div className="mt-4 h-8 w-16 rounded bg-slate-100 skeleton-pulse" />
            <div className="mt-4 h-3 w-24 rounded bg-slate-100 skeleton-pulse" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="h-5 w-32 rounded bg-slate-100 skeleton-pulse" />
          <div className="mt-5 h-[280px] rounded-3xl bg-slate-50 skeleton-pulse" />
        </div>
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="h-5 w-28 rounded bg-slate-100 skeleton-pulse" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 rounded-2xl bg-slate-50 skeleton-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}