"use client";

import { Square, Volume2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getBrowserTtsSupport,
  speakBrowserText,
  stopBrowserTts,
  type BrowserTtsStatus,
} from "@/lib/voice/browser-tts";
import { cn } from "@/lib/utils";

interface ParentSpeakButtonProps {
  text: string;
  label?: string;
  careMode?: boolean;
  className?: string;
  variant?: "outline" | "secondary" | "premium";
}

function getStatusCopy(status: BrowserTtsStatus) {
  switch (status) {
    case "speaking":
      return "正在用当前浏览器朗读，你可以随时停止。";
    case "unsupported":
      return "当前浏览器暂不支持朗读，请改用支持语音播报的浏览器。";
    case "error":
      return "这次浏览器朗读没有完成，请稍后再试。";
    default:
      return "仅在当前浏览器里朗读，方便家里直接听一遍。";
  }
}

export default function ParentSpeakButton({
  text,
  label = "读给我听",
  careMode = false,
  className,
  variant = "outline",
}: ParentSpeakButtonProps) {
  const [status, setStatus] = useState<BrowserTtsStatus>(() =>
    getBrowserTtsSupport().supported ? "idle" : "unsupported"
  );

  function handleClick() {
    if (status === "speaking") {
      stopBrowserTts();
      return;
    }

    const didStart = speakBrowserText({
      text,
      onStatusChange: setStatus,
    });

    if (!didStart && getBrowserTtsSupport().supported) {
      setStatus("error");
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button
        type="button"
        variant={status === "speaking" ? "secondary" : variant}
        className={cn(careMode ? "min-h-12 rounded-2xl px-4 text-base" : "min-h-10 rounded-xl")}
        onClick={handleClick}
        aria-pressed={status === "speaking"}
        disabled={status === "unsupported"}
      >
        {status === "speaking" ? (
          <Square className="mr-2 h-4 w-4" />
        ) : (
          <Volume2 className="mr-2 h-4 w-4" />
        )}
        {status === "speaking" ? "\u505c\u6b62\u64ad\u62a5" : label}
      </Button>
      <p className={cn(careMode ? "text-sm leading-6 text-slate-600" : "text-xs leading-5 text-slate-500")}>
        {getStatusCopy(status)}
      </p>
    </div>
  );
}
