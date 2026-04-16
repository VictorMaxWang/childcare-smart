export type TeacherCopilotTone = "info" | "warning";

export interface TeacherCopilotHint {
  id?: string;
  title: string;
  detail?: string;
  tone?: TeacherCopilotTone;
  tags?: string[];
}

export interface TeacherCopilotStep {
  title: string;
  detail?: string;
}

export interface TeacherCopilotSOP {
  title: string;
  summary?: string;
  durationLabel?: string;
  steps: TeacherCopilotStep[];
}

export interface TeacherCopilotCommunicationScript {
  title: string;
  opening?: string;
  situation?: string;
  ask?: string;
  closing?: string;
  bullets?: string[];
}

export interface TeacherCopilotPayload {
  recordCompletionHints?: TeacherCopilotHint[];
  microTrainingSOP?: TeacherCopilotSOP | null;
  parentCommunicationScript?: TeacherCopilotCommunicationScript | null;
}

export type TeacherCopilotSectionId =
  | "recordCompletionHints"
  | "microTrainingSOP"
  | "parentCommunicationScript";
