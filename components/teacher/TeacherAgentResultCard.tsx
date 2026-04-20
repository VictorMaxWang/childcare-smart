"use client";

import { Clock3, MessageSquareText, Target } from "lucide-react";
import InterventionCardPanel from "@/components/agent/InterventionCardPanel";
import TeacherCopilotPanel from "@/components/teacher/TeacherCopilotPanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  buildTeacherAgentTimeLabel,
  type TeacherAgentResult,
} from "@/lib/agent/teacher-agent";
import {
  hasTeacherResultAttentionSignal,
  normalizeTeacherCopilotFromResult,
} from "@/lib/teacher-copilot/normalize";
import type { TeacherCopilotSectionId } from "@/lib/teacher-copilot/types";

function getTeacherResultSourceLabel(source: string) {
  if (source === "ai" || source === "vivo") return "鏅鸿兘鐢熸垚";
  if (source === "mock") return "婕旂ず缁撴灉";
  return "鏈湴鍏滃簳";
}

function MetaPill({
  label,
  value,
  variant = "secondary",
}: {
  label: string;
  value: string;
  variant?: "secondary" | "outline" | "info";
}) {
  return (
    <Card
      surface="glass"
      glow="soft"
      interactive={false}
      className="border-white/12 bg-white/6"
    >
      <CardContent className="space-y-2 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">
          {label}
        </p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">{value}</p>
          <Badge variant={variant}>{value}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultBlock({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (!items.length) return null;

  return (
    <Card
      surface="glass"
      glow="soft"
      interactive={false}
      className="border-white/12 bg-white/6"
    >
      <CardContent className="p-4">
        <p className="text-sm font-semibold text-white">{title}</p>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-white/70">
          {items.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function TeacherAgentResultCard({
  result,
}: {
  result: TeacherAgentResult;
}) {
  const copilotPayload = normalizeTeacherCopilotFromResult(result);
  let defaultOpenSection: TeacherCopilotSectionId | null = null;
  let sectionOrder: TeacherCopilotSectionId[] = [
    "parentCommunicationScript",
    "microTrainingSOP",
    "recordCompletionHints",
  ];

  if (result.workflow === "communication" && copilotPayload?.parentCommunicationScript) {
    defaultOpenSection = "parentCommunicationScript";
  } else if (
    result.workflow === "follow-up" &&
    copilotPayload?.microTrainingSOP &&
    hasTeacherResultAttentionSignal(result)
  ) {
    defaultOpenSection = "microTrainingSOP";
    sectionOrder = [
      "microTrainingSOP",
      "parentCommunicationScript",
      "recordCompletionHints",
    ];
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetaPill
          label="Mode"
          value={result.mode === "class" ? "鐝骇妯″紡" : "鍗曞効绔ユā寮?"}
          variant="info"
        />
        <MetaPill label="Target" value={result.targetLabel} variant="secondary" />
        <MetaPill
          label="Source"
          value={getTeacherResultSourceLabel(result.source)}
          variant={result.source === "ai" ? "info" : "outline"}
        />
        <MetaPill
          label="Generated"
          value={buildTeacherAgentTimeLabel(result.generatedAt)}
          variant="outline"
        />
      </div>

      <Card
        surface="luminous"
        glow="brand"
        interactive={false}
        className="overflow-hidden border-white/14 bg-[linear-gradient(160deg,rgba(27,21,62,0.96),rgba(13,12,35,0.9),rgba(15,21,43,0.88))]"
      >
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">Main Result</Badge>
            {result.consultationMode ? <Badge variant="outline">浼氳瘖妯″紡</Badge> : null}
            {result.model ? <Badge variant="outline">{result.model}</Badge> : null}
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/70">
                Result Stack
              </p>
              <h3 className="text-xl font-semibold text-white">{result.title}</h3>
            </div>
            <p className="max-w-4xl text-sm leading-7 text-white/72">{result.summary}</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <ResultBlock title="鍏抽敭鐐?" items={result.highlights} />
            <ResultBlock title="杩炵画鎬ц鏄?" items={result.continuityNotes ?? []} />
          </div>
        </CardContent>
      </Card>

      {result.consultation ? (
        <Card
          surface="luminous"
          glow="brand"
          interactive={false}
          className="overflow-hidden border-white/14 bg-[linear-gradient(180deg,rgba(18,24,58,0.96),rgba(9,13,30,0.92))]"
        >
          <CardContent className="space-y-5 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info">Consultation</Badge>
              {result.consultation.participants.map((item) => (
                <Badge key={item.id} variant={item.id === "coordinator" ? "info" : "outline"}>
                  {item.label}
                </Badge>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-lg font-semibold text-white">
                {result.consultation.summary}
              </p>
              <p className="text-sm leading-7 text-white/72">
                {result.consultation.coordinatorSummary.finalConclusion}
              </p>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Card
                surface="solid"
                glow="none"
                interactive={false}
                className="border-white/12 bg-white/6"
              >
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-white">瑙﹀彂鍘熷洜</p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                    {result.consultation.triggerReasons.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card
                surface="solid"
                glow="none"
                interactive={false}
                className="border-white/12 bg-white/6"
              >
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-white">鍥暱鍐崇瓥棰勮</p>
                  <p className="mt-3 text-sm leading-6 text-white/70">
                    {result.consultation.directorDecisionCard.reason}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">
                      璐熻矗浜?{result.consultation.directorDecisionCard.recommendedOwnerName}
                    </Badge>
                    <Badge variant="outline">
                      鏃堕棿 {result.consultation.directorDecisionCard.recommendedAt}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {result.consultation.agentFindings.map((item) => (
                <Card
                  key={item.agentId}
                  surface="solid"
                  glow="none"
                  interactive={false}
                  className="border-white/12 bg-white/6"
                >
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{item.title}</Badge>
                      <Badge variant="outline">{item.agentId}</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white/70">
                      {item.riskExplanation}
                    </p>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-white/64">
                      {item.signals.slice(0, 3).map((signal) => (
                        <li key={signal}>- {signal}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <TeacherCopilotPanel
        payload={copilotPayload}
        defaultOpenSection={defaultOpenSection}
        sectionOrder={sectionOrder}
      />

      {result.keyChildren?.length || result.riskTypes?.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {result.keyChildren?.length ? (
            <Card
              surface="glass"
              glow="soft"
              interactive={false}
              className="border-white/12 bg-white/6"
            >
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-white">閲嶇偣鍎跨</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.keyChildren.map((item) => (
                    <Badge key={item} variant="secondary">
                      {item}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {result.riskTypes?.length ? (
            <Card
              surface="glass"
              glow="soft"
              interactive={false}
              className="border-white/12 bg-white/6"
            >
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-white">涓昏椋庨櫓绫诲瀷</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.riskTypes.map((item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {result.actionItems.length > 0 ? (
        <Card
          surface="glass"
          glow="soft"
          interactive={false}
          className="border-white/12 bg-white/6"
        >
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-violet-200" />
              <p className="text-sm font-semibold text-white">琛屽姩鍒楄〃</p>
            </div>
            {result.actionItems.map((item) => (
              <Card
                key={item.id}
                surface="solid"
                glow="none"
                interactive={false}
                className="border-white/12 bg-white/6"
              >
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{item.target}</p>
                    <Badge variant="outline">{item.timing}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/64">
                    鍘熷洜锛?{item.reason}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/78">
                    寤鸿鍔ㄤ綔锛?{item.action}
                  </p>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {result.parentMessageDraft ? (
        <Card
          surface="luminous"
          glow="brand"
          interactive={false}
          className="border-white/14 bg-[linear-gradient(180deg,rgba(21,24,55,0.94),rgba(11,13,31,0.9))]"
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-violet-200" />
              <p className="text-sm font-semibold text-white">家长沟通话术</p>
            </div>
            <p className="mt-3 text-sm leading-7 text-white/74">
              {result.parentMessageDraft}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {result.interventionCard ? (
        <InterventionCardPanel
          card={result.interventionCard}
          title="骞查鍗￠瑙?"
          footer={
            <Card
              surface="solid"
              glow="none"
              interactive={false}
              className="border-white/12 bg-white/6"
            >
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-white">鏁欏笀鍚庣画璺熻繘鑽夌</p>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  {result.interventionCard.teacherFollowupDraft}
                </p>
              </CardContent>
            </Card>
          }
        />
      ) : null}

      {result.tomorrowObservationPoint ? (
        <Card
          surface="glass"
          glow="soft"
          interactive={false}
          className="border-white/12 bg-white/6"
        >
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-white">明日观察点</p>
            <p className="mt-3 text-sm leading-7 text-white/72">
              {result.tomorrowObservationPoint}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/6 px-3 py-2 text-xs text-white/58 shadow-[var(--shadow-card)]">
        <Clock3 className="h-3.5 w-3.5" />
        <span>鐢熸垚鏃堕棿锛?{buildTeacherAgentTimeLabel(result.generatedAt)}</span>
      </div>
    </div>
  );
}
