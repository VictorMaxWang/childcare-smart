"use client";

import ProviderTraceBadge from "./ProviderTraceBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FollowUp48hCardData } from "@/lib/consultation/trace-types";

export default function FollowUp48hCard({ data }: { data: FollowUp48hCardData }) {
  return (
    <Card className="border-emerald-100 bg-linear-to-br from-emerald-50/80 via-white to-sky-50/60 shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">48 小时复查</Badge>
          {data.providerTrace ? <ProviderTraceBadge trace={data.providerTrace} compact /> : null}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-emerald-500">Follow-up plan</p>
          <CardTitle className="text-xl text-slate-900">{data.title}</CardTitle>
          <p className="text-sm leading-7 text-slate-600">把今天的处理动作延续成可复查、可追踪的下一步观察点。</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
          <p className="text-sm font-semibold text-slate-900">复查节点</p>
          <p className="mt-2 text-sm leading-7 text-slate-600">{data.reviewIn48h || "48 小时后回看本轮干预是否落实到位，并补充新的观察记录。"}</p>
        </div>

        {data.items.length ? (
          <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
            <p className="text-sm font-semibold text-slate-900">后续观察</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {data.items.map((item, index) => (
                <li key={`${data.title}-${index}`}>- {item}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-emerald-200 bg-white/75 p-4 text-sm leading-6 text-slate-600">
            当前未返回额外的后续观察清单，建议按复查节点回看本次干预是否闭环。
          </div>
        )}
      </CardContent>
    </Card>
  );
}
