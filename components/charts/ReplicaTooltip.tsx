"use client";

import { formatChartNumber, type ReplicaChartSeries } from "./chart-theme";

type TooltipPayloadItem = {
  color?: string;
  dataKey?: string | number;
  name?: string | number;
  value?: unknown;
  payload?: {
    label?: unknown;
  };
};

export function ReplicaTooltip({
  active,
  label,
  payload,
  series,
}: {
  active?: boolean;
  label?: unknown;
  payload?: TooltipPayloadItem[];
  series?: ReplicaChartSeries[];
}) {
  if (!active || !payload || payload.length === 0) return null;

  const seriesByKey = new Map((series ?? []).map((item) => [item.key, item]));
  const title = String(label ?? payload[0]?.payload?.label ?? "");

  return (
    <div
      data-testid="r03-chart-tooltip"
      className="rounded-[14px] border border-[#E2E8F0] bg-white/96 px-3 py-2 text-xs shadow-[0_18px_42px_rgb(15_23_42_/_0.14)] backdrop-blur"
    >
      {title ? <p className="mb-2 font-bold text-[#172554]">{title}</p> : null}
      <div className="space-y-1.5">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "");
          const meta = seriesByKey.get(key);
          const color = item.color ?? meta?.color ?? "#655BFF";
          return (
            <div key={`${key}-${String(item.value)}`} className="flex min-w-36 items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-[#64748B]">
                <i className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {meta?.label ?? item.name ?? key}
              </span>
              <strong className="text-[#172554]">{formatChartNumber(item.value, meta?.unit)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}
