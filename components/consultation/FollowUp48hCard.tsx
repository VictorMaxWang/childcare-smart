"use client";

import ProviderTraceBadge from "./ProviderTraceBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FollowUp48hCardData } from "@/lib/consultation/trace-types";

export default function FollowUp48hCard({
  data,
}: {
  data: FollowUp48hCardData;
}) {
  return (
    <Card
      surface="luminous"
      glow="brand"
      interactive={false}
      className="overflow-hidden border-white/14 bg-[linear-gradient(180deg,rgba(19,25,58,0.94),rgba(10,12,32,0.9))]"
    >
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">48 灏忔椂澶嶆煡</Badge>
          {data.providerTrace ? (
            <ProviderTraceBadge trace={data.providerTrace} compact />
          ) : null}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-violet-100/60">
            Follow-up Plan
          </p>
          <CardTitle className="text-xl text-white">{data.title}</CardTitle>
          <p className="text-sm leading-7 text-white/72">
            鎶婁粖澶╃殑澶勭悊鍔ㄤ綔寤剁画鎴愬彲澶嶆煡銆佸彲杩借釜鐨勪笅涓€姝ヨ瀵熺偣銆?
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-[1.4rem] border border-white/12 bg-white/6 p-4">
          <p className="text-sm font-semibold text-white">澶嶆煡鑺傜偣</p>
          <p className="mt-2 text-sm leading-7 text-white/70">
            {data.reviewIn48h ||
              "48 灏忔椂鍚庡洖鐪嬫湰杞共棰勬槸鍚﹁惤瀹炲埌浣嶏紝骞惰ˉ鍏呮柊鐨勮瀵熻褰曘€?"}
          </p>
        </div>

        {data.items.length ? (
          <div className="rounded-[1.4rem] border border-white/12 bg-white/6 p-4">
            <p className="text-sm font-semibold text-white">鍚庣画瑙傚療</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-white/68">
              {data.items.map((item, index) => (
                <li key={`${data.title}-${index}`}>- {item}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-[1.4rem] border border-dashed border-white/14 bg-white/5 p-4 text-sm leading-6 text-white/60">
            褰撳墠鏈繑鍥為澶栫殑鍚庣画瑙傚療娓呭崟锛屽缓璁寜澶嶆煡鑺傜偣鍥炵湅鏈骞查鏄惁闂幆銆?
          </div>
        )}
      </CardContent>
    </Card>
  );
}
