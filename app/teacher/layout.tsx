"use client";

import type { ReactNode } from "react";
import TeacherVoiceAssistantLayer from "@/components/teacher/TeacherVoiceAssistantLayer";

export default function TeacherLayout({ children }: { children: ReactNode }) {
  const shouldShowVoiceAssistant = true;

  return (
    <div className="teacher-voice-safe-space relative" data-testid="r06-teacher-voice-layout">
      {children}
      {shouldShowVoiceAssistant ? <TeacherVoiceAssistantLayer /> : null}
    </div>
  );
}
