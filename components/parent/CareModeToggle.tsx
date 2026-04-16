"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CareModeToggleProps {
  careMode: boolean;
  onChange: (nextValue: boolean) => void;
  className?: string;
}

export default function CareModeToggle({
  careMode,
  onChange,
  className,
}: CareModeToggleProps) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm",
        className
      )}
    >
      <p className="text-sm font-semibold text-slate-900">浏览方式</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        关怀模式更适合祖辈和低数字熟练度照护者。
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant={careMode ? "outline" : "premium"}
          className="min-h-12 rounded-2xl text-base"
          aria-pressed={!careMode}
          onClick={() => onChange(false)}
        >
          普通模式
        </Button>
        <Button
          type="button"
          variant={careMode ? "premium" : "outline"}
          className="min-h-12 rounded-2xl text-base"
          aria-pressed={careMode}
          onClick={() => onChange(true)}
        >
          关怀模式
        </Button>
      </div>
    </div>
  );
}
