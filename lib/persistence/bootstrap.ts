import type { AccountRole } from "@/lib/auth/accounts";
import { DEFAULT_PARENT_CHILD_CLASS_NAME } from "@/lib/auth/accounts";
import type { AppStateSnapshot, AppStateUsageLimits, AppStateWorkspaceKind } from "@/lib/persistence/snapshot";

function createId(prefix: string) {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

export const DEFAULT_REGISTRATION_USAGE_LIMITS: AppStateUsageLimits = {
  maxChildren: 5,
  maxStorybooksPerMonth: 20,
  maxAiCallsPerDay: 50,
};

export function emptyInstitutionSnapshot(updatedAt = new Date().toISOString()): AppStateSnapshot {
  return {
    demoPersistenceSchemaVersion: "d01-v1",
    children: [],
    attendance: [],
    meals: [],
    growth: [],
    feedback: [],
    health: [],
    taskCheckIns: [],
    interventionCards: [],
    consultations: [],
    mobileDrafts: [],
    reminders: [],
    tasks: [],
    messages: [],
    conversations: [],
    healthMaterials: [],
    nutritionMenus: [],
    storybooks: [],
    updatedAt,
  };
}

function workspaceKindForRole(role: AccountRole): AppStateWorkspaceKind {
  if (role === "教师") return "teacher_trial";
  if (role === "家长") return "family";
  return "institution";
}

export interface RegistrationWorkspaceSnapshotInput {
  institutionId: string;
  ownerUserId: string;
  ownerRole: AccountRole;
  createdAt?: string;
}

export function registrationWorkspaceSnapshot(input: RegistrationWorkspaceSnapshotInput): AppStateSnapshot {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return {
    ...emptyInstitutionSnapshot(createdAt),
    meta: {
      workspace: {
        kind: workspaceKindForRole(input.ownerRole),
        institutionId: input.institutionId,
        ownerUserId: input.ownerUserId,
        ownerRole: input.ownerRole,
        isDemo: false,
        createdAt,
      },
      usageLimits: { ...DEFAULT_REGISTRATION_USAGE_LIMITS },
    },
  };
}

export interface ParentStarterSnapshotInput {
  institutionId: string;
  parentUserId: string;
  parentName: string;
  guardianPhone?: string;
  childName: string;
  childBirthDate: string;
  childGender: "男" | "女";
  childHeightCm?: number;
  childWeightKg?: number;
}

export function parentStarterSnapshot(input: ParentStarterSnapshotInput) {
  const snapshot = emptyInstitutionSnapshot();
  const childId = createId("c");

  snapshot.children = [
    {
      id: childId,
      name: input.childName.trim(),
      birthDate: input.childBirthDate,
      gender: input.childGender,
      allergies: [],
      heightCm: input.childHeightCm && input.childHeightCm > 0 ? input.childHeightCm : 0,
      weightKg: input.childWeightKg && input.childWeightKg > 0 ? input.childWeightKg : 0,
      guardians: [
        {
          name: input.parentName.trim(),
          relation: "家长",
          phone: input.guardianPhone?.trim() || "待补充",
        },
      ],
      institutionId: input.institutionId,
      className: DEFAULT_PARENT_CHILD_CLASS_NAME,
      specialNotes: "",
      avatar: input.childGender === "女" ? "👧" : "👦",
      parentUserId: input.parentUserId,
    },
  ];
  snapshot.updatedAt = new Date().toISOString();

  return {
    snapshot,
    childId,
  };
}
