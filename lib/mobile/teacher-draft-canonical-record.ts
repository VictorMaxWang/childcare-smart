import { createRecord, listRecords, updateRecord } from "@/lib/api/records";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";
import type { TeacherDraftRecord } from "@/lib/mobile/teacher-draft-records";

type HealthInput = Omit<
  Partial<AppStateSnapshot["health"][number]>,
  "id"
> & { childId: string };
type MealInput = Omit<
  Partial<AppStateSnapshot["meals"][number]>,
  "id"
> & { childId: string };
type GrowthInput = Omit<
  Partial<AppStateSnapshot["growth"][number]>,
  "id"
> & { childId: string };
type AttendanceInput = Omit<
  Partial<AppStateSnapshot["attendance"][number]>,
  "id"
> & { childId: string };

export type CanonicalTeacherDraftRecord =
  | { type: "health"; input: HealthInput }
  | { type: "meal"; input: MealInput }
  | { type: "growth"; input: GrowthInput }
  | { type: "attendance"; input: AttendanceInput };

function effectiveSummary(record: TeacherDraftRecord) {
  return record.editedSummary?.trim() || record.summary.trim();
}

function effectiveFields(record: TeacherDraftRecord) {
  return record.editedStructuredFields ?? record.structuredFields;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0
      )
    : [];
}

function extractWaterMl(text: string) {
  const match = text.match(/(\d{2,4})\s*(?:ml|毫升)/iu);
  return match ? Number(match[1]) : 0;
}

function mealLabel(value: string) {
  if (value === "breakfast") return "早餐";
  if (value === "dinner") return "晚餐";
  if (value === "snack") return "加餐";
  return "午餐";
}

function foodCategory(name: string) {
  if (/奶|酸奶/u.test(name)) return "奶制品" as const;
  if (/蛋|肉|鱼|虾|豆/u.test(name)) return "蛋白" as const;
  if (/饭|面|粥|馒头|点心/u.test(name)) return "主食" as const;
  if (/水|汤|饮/u.test(name)) return "饮品" as const;
  if (/菜|果/u.test(name)) return "蔬果" as const;
  return "其他" as const;
}

export function buildCanonicalTeacherDraftRecord(
  record: TeacherDraftRecord,
  today = new Date().toLocaleDateString("sv-SE")
): CanonicalTeacherDraftRecord {
  const childId = record.childId?.trim();
  if (!childId) {
    throw new Error("草稿未关联幼儿，无法写入业务记录。");
  }

  const summary = effectiveSummary(record);
  const fields = effectiveFields(record);

  if (record.category === "HEALTH") {
    const temperature = readNumber(fields.temperature_c) ?? 36.6;
    const symptoms = readStringArray(fields.symptoms);
    const severity = readString(fields.severity_hint);
    const isAbnormal =
      temperature >= 37.5 ||
      symptoms.length > 0 ||
      severity === "medium" ||
      severity === "high";
    return {
      type: "health",
      input: {
        childId,
        date: today,
        temperature,
        mood: /哭|焦虑/u.test(summary) ? "需安抚" : "稳定",
        handMouthEye: /红疹|皮肤|口腔|眼/u.test(summary) ? "异常" : "正常",
        isAbnormal,
        remark: [
          summary,
          symptoms.length ? `症状：${symptoms.join("、")}` : "",
        ]
          .filter(Boolean)
          .join("；"),
      },
    };
  }

  if (record.category === "DIET") {
    const appetite = readString(fields.appetite);
    const allergyFlag = fields.allergy_flag === true;
    const foods = readStringArray(fields.food_items).map((name, index) => ({
      id: `voice-food-${index + 1}`,
      name,
      category: foodCategory(name),
      amount: "语音提及",
    }));
    return {
      type: "meal",
      input: {
        childId,
        date: today,
        meal: mealLabel(readString(fields.meal_period)),
        foods,
        intakeLevel: appetite === "low" ? "少量" : "适中",
        preference: appetite === "low" ? "拒食" : "正常",
        allergyReaction: allergyFlag
          ? "语音记录提示可能存在过敏反应，需人工复核"
          : undefined,
        waterMl: extractWaterMl(`${summary} ${record.rawExcerpt}`),
        nutritionScore: appetite === "low" || allergyFlag ? 65 : 80,
      },
    };
  }

  if (record.category === "LEAVE") {
    return {
      type: "attendance",
      input: {
        childId,
        date: today,
        isPresent: false,
        absenceReason: summary || "语音记录请假",
      },
    };
  }

  const isSleep = record.category === "SLEEP";
  const mood = readString(fields.mood);
  const sleepQuality = readString(fields.sleep_quality);
  const needsAttention =
    mood === "crying" ||
    mood === "anxious" ||
    sleepQuality === "interrupted" ||
    sleepQuality === "poor" ||
    record.warnings.length > 0;
  return {
    type: "growth",
    input: {
      childId,
      category: isSleep ? "睡眠情况" : "情绪表现",
      tags: [
        isSleep ? sleepQuality : mood,
        ...record.suggestedActions.slice(0, 2),
      ].filter(Boolean),
      description: summary || record.rawExcerpt,
      needsAttention,
      followUpAction: record.suggestedActions[0],
      reviewStatus: needsAttention ? "待复查" : "已完成",
    },
  };
}

export async function persistConfirmedTeacherDraftRecord(
  record: TeacherDraftRecord,
  options: { today?: string; sourceDraftId?: string } = {}
) {
  const today = options.today ?? new Date().toLocaleDateString("sv-SE");
  const canonical = buildCanonicalTeacherDraftRecord(record, today);
  const sourceMetadata = options.sourceDraftId
    ? {
        sourceDraftId: options.sourceDraftId,
        sourceRecordId: record.recordId,
      }
    : {};

  if (canonical.type === "health") {
    const existing = (
      await listRecords("health", { childId: canonical.input.childId })
    ).find((item) => item.date === canonical.input.date);
    const saved = existing
      ? await updateRecord("health", existing.id, {
          ...canonical.input,
          ...sourceMetadata,
        })
      : await createRecord("health", {
          ...canonical.input,
          ...sourceMetadata,
        });
    return { recordId: saved.id, recordType: canonical.type };
  }

  if (canonical.type === "meal") {
    const existing = (
      await listRecords("meal", { childId: canonical.input.childId })
    ).find(
      (item) =>
        item.date === canonical.input.date &&
        item.meal === canonical.input.meal
    );
    const saved = existing
      ? await updateRecord("meal", existing.id, {
          ...canonical.input,
          ...sourceMetadata,
        })
      : await createRecord("meal", {
          ...canonical.input,
          ...sourceMetadata,
        });
    return { recordId: saved.id, recordType: canonical.type };
  }

  if (canonical.type === "attendance") {
    const existing = (
      await listRecords("attendance", { childId: canonical.input.childId })
    ).find((item) => item.date === canonical.input.date);
    const saved = existing
      ? await updateRecord("attendance", existing.id, {
          ...canonical.input,
          ...sourceMetadata,
        })
      : await createRecord("attendance", {
          ...canonical.input,
          ...sourceMetadata,
        });
    return { recordId: saved.id, recordType: canonical.type };
  }

  const saved = await createRecord("growth", {
    ...canonical.input,
    ...sourceMetadata,
  });
  return { recordId: saved.id, recordType: canonical.type };
}
