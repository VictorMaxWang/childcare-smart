import type { AccountRole } from "@/lib/auth/accounts";
import {
  normalizeGuardianFeedbackCollection,
  normalizeParentStructuredFeedback,
} from "@/lib/feedback/normalize";
import type { GuardianFeedback, GuardianFeedbackInput } from "@/lib/feedback/types";

export function upsertGuardianFeedbackWriteback(params: {
  previous: GuardianFeedback[];
  input: GuardianFeedbackInput;
  currentUserName: string;
  currentUserRole: AccountRole;
  fallbackFeedbackId: string;
}) {
  const requestedFeedbackId =
    typeof params.input.feedbackId === "string" && params.input.feedbackId.trim()
      ? params.input.feedbackId.trim()
      : typeof params.input.id === "string" && params.input.id.trim()
        ? params.input.id.trim()
        : params.fallbackFeedbackId;

  const normalized = normalizeParentStructuredFeedback(
    {
      ...params.input,
      feedbackId: requestedFeedbackId,
      id: requestedFeedbackId,
      createdBy: params.input.createdBy ?? params.currentUserName,
      createdByRole: params.input.createdByRole ?? params.currentUserRole,
    },
    {
      feedbackId: requestedFeedbackId,
      createdBy: params.input.createdBy ?? params.currentUserName,
      createdByRole: params.input.createdByRole ?? params.currentUserRole,
      submittedAt: params.input.submittedAt ?? params.input.date,
      allowGenerateId: false,
    }
  );

  if (!normalized) return params.previous;

  const withoutExisting = params.previous.filter(
    (item) =>
      item.feedbackId !== normalized.feedbackId &&
      item.id !== normalized.feedbackId &&
      item.feedbackId !== normalized.id &&
      item.id !== normalized.id
  );

  return normalizeGuardianFeedbackCollection([normalized, ...withoutExisting]) ?? [normalized, ...withoutExisting];
}
