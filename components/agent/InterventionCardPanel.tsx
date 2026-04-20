import type { ReactNode } from "react";
import { BrainCircuit, Clock3, Home, School, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInterventionRiskBadgeLabel, type InterventionCard } from "@/lib/agent/intervention-card";

function getInterventionSourceLabel(source: InterventionCard["source"]) {
  if (source === "ai" || source === "vivo") return "智能生成";
  if (source === "mock") return "演示结果";
  return "本地兜底";
}

export default function InterventionCardPanel({
  card,
  title,
  footer,
  audience = "staff",
}: {
  card: InterventionCard;
  title?: string;
  footer?: ReactNode;
  audience?: "staff" | "parent";
}) {
  const displayTitle = title ?? (audience === "parent" ? "今晚行动卡" : "干预卡");
  const showTechnicalBadges = audience !== "parent";
  const showParticipants = audience !== "parent";
  const summaryTitle = audience === "parent" ? "协同说明" : "会诊摘要";

  return (
    <Card
      surface="luminous"
      glow="brand"
      interactive={false}
      className="border-[rgba(164,168,255,0.18)] bg-[linear-gradient(160deg,rgba(26,20,59,0.96),rgba(15,13,39,0.92),rgba(15,19,46,0.88))] shadow-sm"
    >
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={card.riskLevel === "high" ? "warning" : card.riskLevel === "medium" ? "info" : "success"}>
            {getInterventionRiskBadgeLabel(card.riskLevel)}
          </Badge>
          {card.consultationMode && audience !== "parent" ? <Badge variant="warning">会诊模式</Badge> : null}
          {showTechnicalBadges ? (
            <>
              <Badge
                variant={
                  card.source === "ai" || card.source === "vivo"
                    ? "success"
                    : card.source === "mock"
                      ? "info"
                      : "secondary"
                }
              >
                生成方式：{getInterventionSourceLabel(card.source)}
              </Badge>
            </>
          ) : null}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-200">{displayTitle}</p>
          <CardTitle className="mt-2 text-xl text-slate-900">{card.title}</CardTitle>
          <p className="mt-3 text-sm leading-7 text-slate-600">{card.summary}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-[rgba(164,168,255,0.14)] bg-[linear-gradient(180deg,rgba(15,18,44,0.84),rgba(9,11,28,0.74))] p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <BrainCircuit className="h-4 w-4 text-violet-200" />
            触发原因
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{card.triggerReason}</p>
          {card.consultationSummary ? (
            <div className="mt-4 rounded-2xl border border-[rgba(164,168,255,0.14)] bg-[rgba(255,255,255,0.04)] p-4 shadow-[var(--shadow-card)]">
              <p className="text-sm font-semibold text-slate-900">{summaryTitle}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{card.consultationSummary}</p>
              {showParticipants && card.participants?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {card.participants.map((item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[rgba(164,168,255,0.14)] bg-[linear-gradient(180deg,rgba(15,18,44,0.84),rgba(9,11,28,0.74))] p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <School className="h-4 w-4 text-indigo-200" />
              今日园内动作
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{card.todayInSchoolAction}</p>
          </div>
          <div className="rounded-2xl border border-[rgba(164,168,255,0.14)] bg-[linear-gradient(180deg,rgba(15,18,44,0.84),rgba(9,11,28,0.74))] p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Home className="h-4 w-4 text-violet-200" />
              今晚家庭动作
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{card.tonightHomeAction}</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[rgba(164,168,255,0.14)] bg-[linear-gradient(180deg,rgba(15,18,44,0.84),rgba(9,11,28,0.74))] p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Target className="h-4 w-4 text-violet-200" />
              家庭步骤
            </div>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {card.homeSteps.map((item, index) => (
                <li key={`${card.id}-step-${index}`}>{index + 1}. {item}</li>
              ))}
            </ol>
          </div>
          <div className="rounded-2xl border border-[rgba(164,168,255,0.14)] bg-[linear-gradient(180deg,rgba(15,18,44,0.84),rgba(9,11,28,0.74))] p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Clock3 className="h-4 w-4 text-indigo-200" />
              观察与复查
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {card.observationPoints.map((item, index) => (
                <li key={`${card.id}-point-${index}`}>- {item}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm font-medium text-slate-900">明日观察点：{card.tomorrowObservationPoint}</p>
            <p className="mt-2 text-sm text-slate-600">48 小时复查：{card.reviewIn48h}</p>
          </div>
        </div>

        {footer ? <div>{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
