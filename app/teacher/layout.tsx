"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import TeacherVoiceAssistantLayer from "@/components/teacher/TeacherVoiceAssistantLayer";

export default function TeacherLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const shouldShowVoiceAssistant = pathname !== "/teacher";

  return (
    <div className="teacher-voice-safe-space relative">
      {children}
      {shouldShowVoiceAssistant ? <TeacherVoiceAssistantLayer /> : null}
    </div>
  );
}
