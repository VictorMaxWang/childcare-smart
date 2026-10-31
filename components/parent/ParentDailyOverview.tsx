"use client";

import { useMemo, useState } from "react";
import { buildParentDailyOverview, parentRecordDateKey, type ParentDailyRecord } from "@/lib/parent/daily-overview";

/** 首页只展示当前授权儿童的一日事实，AI 故事与建议不写入事实时间线。 */
export default function ParentDailyOverview({ childId, childName, records }: {
  childId: string; childName: string; records: readonly ParentDailyRecord[];
}) {
  const overview = useMemo(() => buildParentDailyOverview(records, childId), [records, childId]);
  const [chosenDate, setChosenDate] = useState("");
  const date = chosenDate || overview[0]?.date || parentRecordDateKey(new Date().toISOString());
  const visible = overview.filter(record => record.date === date);
  return <section className="mb-5 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm" data-testid="parent-daily-overview">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold text-slate-900">{childName} 的一日记录</h2>
        <p className="mt-1 text-xs text-slate-500">健康、饮食、成长观察与照片，均来自已保存记录。</p></div>
      <label className="text-sm text-slate-600">发生日期 <input type="date" value={date} onChange={event => setChosenDate(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1" /></label>
    </div>
    {visible.length === 0 ? <p className="mt-3 text-sm text-slate-500">这一天还没有已同步的记录。</p> :
      <details className="mt-3" open><summary className="cursor-pointer text-sm text-sky-800">当天已同步 {visible.length} 条记录</summary>
        <div className="mt-3 grid max-h-[28rem] gap-3 overflow-y-auto sm:grid-cols-2">
          {visible.map(record => <article key={record.id} className="rounded-xl border border-slate-100 p-3" data-record-id={record.id}>
            <h3 className="text-sm font-semibold text-slate-900">{record.title}</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{record.summary}</p>
            <p className="mt-2 text-xs text-slate-500">记录人：{record.recorder}</p>
            <p className="mt-1 text-xs text-slate-500">发生：{record.occurredAt} · 更新：{record.updatedAt}</p>
            {record.mediaUrls.length > 0 ? <div className="mt-2 flex gap-2">{record.mediaUrls.map(url =>
              // 私有图片继续通过已授权的媒体地址读取，不复制成公共访问链接。
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt={`${childName} ${record.title}照片`} loading="lazy" width={96} height={72} className="h-18 w-24 rounded-lg object-cover" />)}</div> : null}
          </article>)}
        </div>
      </details>}
  </section>;
}
