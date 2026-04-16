import type { AppStateSnapshot } from "@/lib/persistence/snapshot";
import { DEFAULT_PARENT_CHILD_CLASS_NAME } from "@/lib/auth/accounts";

function createId(prefix: string) {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

export function emptyInstitutionSnapshot(): AppStateSnapshot {
  return {
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
    updatedAt: new Date().toISOString(),
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
