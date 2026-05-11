"use client";

import { createElement, type ReactNode } from "react";

export type ReplicaChartDatum = {
  label: string;
  [key: string]: string | number | null | undefined;
};

export type ReplicaChartKind = "line" | "bar";

export type ReplicaChartSeries = {
  key: string;
  label: string;
  color?: string;
  unit?: string;
  kind?: ReplicaChartKind;
};

export type ReplicaDonutDatum = {
  label: string;
  value: number;
  color?: string;
  detail?: ReactNode;
};

export const replicaChartColors = {
  primary: "#655BFF",
  cyan: "#21C6C1",
  sky: "#38BDF8",
  amber: "#F59E0B",
  red: "#EF4444",
  green: "#10B981",
  violet: "#8B5CF6",
  slate: "#64748B",
  grid: "#E8ECF7",
  axis: "#94A3B8",
  text: "#172554",
} as const;

export const replicaSeriesPalette = [
  replicaChartColors.primary,
  replicaChartColors.cyan,
  replicaChartColors.sky,
  replicaChartColors.amber,
  replicaChartColors.red,
  replicaChartColors.green,
  replicaChartColors.violet,
  replicaChartColors.slate,
];

export function colorForSeries(index: number, override?: string) {
  return override ?? replicaSeriesPalette[index % replicaSeriesPalette.length];
}

export function readNumericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function hasChartData(data: ReplicaChartDatum[], series: ReplicaChartSeries[]) {
  return data.some((item) => series.some((entry) => readNumericValue(item[entry.key]) !== null));
}

export function hasDonutData(data: ReplicaDonutDatum[]) {
  return data.some((item) => readNumericValue(item.value) !== null);
}

export function formatChartNumber(value: unknown, unit = "") {
  const numeric = readNumericValue(value);
  if (numeric === null) return "--";
  const rounded = Math.abs(numeric) >= 100 ? Math.round(numeric) : Number(numeric.toFixed(1));
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded}${unit}`;
}

export function replicaChartEmptyNode(message = "暂无可展示的真实图表数据。") {
  return createElement(
    "div",
    {
      "data-testid": "r03-chart-empty",
      className:
        "flex min-h-[180px] items-center justify-center rounded-[18px] border border-dashed border-[#D8DEEF] bg-[#FBFCFF] px-4 text-center text-sm font-semibold text-[#7A86A6]",
    },
    message
  );
}
