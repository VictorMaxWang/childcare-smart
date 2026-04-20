"use client";

import { useState } from "react";
import { Square, Volume2 } from "lucide-react";
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
      return "Reading with the current browser. You can stop playback at any time.";
    case "unsupported":
      return "This browser does not support speech playback. Please switch to a supported browser.";
    case "error":
      return "The speech playback did not complete. Please try again in a moment.";
    default:
      return "Playback runs only in the current browser for a quick parent-side preview.";
  }
}

export default function ParentSpeakButton({
  text,
  label = "Play audio",
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
        {status === "speaking" ? "Stop playback" : label}
      </Button>
      <p className={cn(careMode ? "text-sm leading-6 text-white/68" : "text-xs leading-5 text-white/56")}>
        {getStatusCopy(status)}
      </p>
    </div>
  );
}
