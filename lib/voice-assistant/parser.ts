import { canRoleAccessPath } from "@/lib/auth/route-access";
import {
  appendChildIdQuery,
  appendChildQuery,
  getAssistantRoleHomePath,
  makeCommandId,
  ROLE_EXAMPLES,
} from "@/lib/voice-assistant/intents";
import type {
  AssistantChildRef,
  AssistantCommand,
  AssistantIntent,
  AssistantParseContext,
  AssistantSafetyLevel,
  AssistantTeacherRef,
  AssistantUtterance,
} from "@/lib/voice-assistant/types";

const CHINESE_DIGITS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const MEAL_WORDS = [
  { word: "早餐", value: "早餐" },
  { word: "早饭", value: "早餐" },
  { word: "午餐", value: "午餐" },
  { word: "午饭", value: "午餐" },
  { word: "晚餐", value: "晚餐" },
  { word: "晚饭", value: "晚餐" },
  { word: "加餐", value: "加餐" },
];

function normalizeText(text: string) {
  return text.replace(/\s+/g, "").replace(/[，。！？!?,.;；：:]/g, "，").trim();
}

export function parseChineseNumber(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  const direct = Number(raw.replace("点", "."));
  if (Number.isFinite(direct)) return direct;

  const [integerRaw, decimalRaw] = raw.split("点");
  let integer = 0;
  if (integerRaw.includes("十")) {
    const [tensRaw, onesRaw] = integerRaw.split("十");
    integer = (tensRaw ? CHINESE_DIGITS[tensRaw] ?? 0 : 1) * 10 + (onesRaw ? CHINESE_DIGITS[onesRaw] ?? 0 : 0);
  } else {
    integer = CHINESE_DIGITS[integerRaw] ?? Number(integerRaw);
  }

  if (!Number.isFinite(integer)) return null;
  if (!decimalRaw) return integer;

  const decimal = decimalRaw
    .split("")
    .map((char) => String(CHINESE_DIGITS[char] ?? char))
    .join("");
  const parsed = Number(`${integer}.${decimal}`);
  return Number.isFinite(parsed) ? parsed : null;
}

function readTemperature(text: string) {
  const match = /(?:体温|温度)?([0-9]{2}(?:\.[0-9])?|[三四五六七八九十零一二两点]{2,8})度?/.exec(text);
  if (!match?.[1]) return undefined;
  const parsed = parseChineseNumber(match[1]);
  if (parsed === null || parsed < 30 || parsed > 43) return undefined;
  return parsed;
}

function findByName<T extends { name: string; className?: string }>(items: T[] | undefined, text: string) {
  return (items ?? [])
    .slice()
    .sort((left, right) => right.name.length - left.name.length)
    .find((item) => text.includes(item.name) || (item.name.length > 1 && text.includes(item.name.slice(1))));
}

function childAliases(child: AssistantChildRef) {
  return [child.name, child.nickname, child.name.length > 1 ? child.name.slice(1) : "", ...(child.guardianNames ?? [])]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.length - left.length);
}

function childNameAliases(child: AssistantChildRef) {
  return [child.name, child.nickname, child.name.length > 1 ? child.name.slice(1) : ""]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.length - left.length);
}

function findChildByText(items: AssistantChildRef[] | undefined, text: string) {
  const sorted = (items ?? [])
    .slice()
    .sort((left, right) => right.name.length - left.name.length);
  return (
    sorted.find((child) => childNameAliases(child).some((alias) => text.includes(alias))) ??
    sorted.find((child) => childAliases(child).some((alias) => text.includes(alias)))
  );
}

export function findMentionedChild(context: AssistantParseContext, text: string): AssistantChildRef | undefined {
  const childId = context.objects?.childId ?? context.currentQuery?.childId ?? context.currentQuery?.child;
  const allChildren = context.allChildren ?? context.children;
  const byId = childId ? allChildren?.find((child) => child.id === childId) : undefined;
  return findChildByText(allChildren, text) ?? byId ?? (context.role === "parent" ? context.children?.[0] : undefined);
}

function findMentionedTeacher(context: AssistantParseContext, text: string): AssistantTeacherRef | undefined {
  return findByName(context.teachers, text);
}

function findMentionedClassName(context: AssistantParseContext, text: string) {
  const classNames = Array.from(new Set((context.allChildren ?? context.children ?? []).map((child) => child.className).filter(Boolean)));
  return classNames.find((className) => className && text.includes(className)) ?? undefined;
}

function contentAfter(text: string, markers: string[]) {
  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index >= 0) {
      return text.slice(index + marker.length).replace(/^，+/, "").trim();
    }
  }
  return "";
}

function commandBase(params: {
  context: AssistantParseContext;
  utterance: AssistantUtterance;
  intent: AssistantIntent;
  confidence: number;
  safetyLevel: AssistantSafetyLevel;
  previewText: string;
  execute: string;
  params?: Record<string, unknown>;
  missingParams?: string[];
  deeplink?: string;
  riskText?: string;
  status?: AssistantCommand["status"];
}): AssistantCommand {
  const missingParams = params.missingParams ?? [];
  const requiredConfirmation = params.safetyLevel !== "safe";
  const status =
    params.status ??
    (missingParams.length > 0 ? "needs_params" : requiredConfirmation ? "needs_confirmation" : "ready");

  return {
    id: makeCommandId(),
    intent: params.intent,
    confidence: params.confidence,
    role: params.context.role,
    requiredConfirmation,
    params: params.params ?? {},
    missingParams,
    safetyLevel: params.safetyLevel,
    previewText: params.previewText,
    execute: params.execute,
    status,
    riskText: params.riskText,
    examples: ROLE_EXAMPLES[params.context.role],
    utterance: params.utterance,
    deeplink: params.deeplink,
  };
}

function unknownCommand(context: AssistantParseContext, utterance: AssistantUtterance, reason = "暂时不能理解这条指令。") {
  return commandBase({
    context,
    utterance,
    intent: "unknown",
    confidence: 0.1,
    safetyLevel: "safe",
    previewText: reason,
    execute: "unknown",
    params: { reason },
    status: "unknown",
  });
}

function forbiddenNavigateCommand(
  context: AssistantParseContext,
  utterance: AssistantUtterance,
  deeplink: string,
  label: string
) {
  return commandBase({
    context,
    utterance,
    intent: "navigate",
    confidence: 0.9,
    safetyLevel: "safe",
    previewText: `当前角色不能打开「${label}」。`,
    execute: "navigate",
    params: { path: deeplink, label },
    deeplink,
    status: "forbidden",
  });
}

function navigateCommand(
  context: AssistantParseContext,
  utterance: AssistantUtterance,
  deeplink: string,
  label: string,
  confidence = 0.9
) {
  if (!canRoleAccessPath(context.accountRole, deeplink)) {
    return forbiddenNavigateCommand(context, utterance, deeplink, label);
  }
  return commandBase({
    context,
    utterance,
    intent: "navigate",
    confidence,
    safetyLevel: "safe",
    previewText: `打开${label}`,
    execute: "navigate",
    params: { path: deeplink, label },
    deeplink,
  });
}

function childParams(child?: AssistantChildRef) {
  return child ? { childId: child.id, childName: child.name } : {};
}

function missingChild(child?: AssistantChildRef) {
  return child ? [] : ["childId"];
}

function latestPendingReminder(context: AssistantParseContext, childId?: string) {
  return (context.reminders ?? [])
    .filter((reminder) => (!childId || reminder.childId === childId) && reminder.status !== "done" && reminder.status !== "acknowledged")
    .sort((left, right) => (right.scheduledAt ?? "").localeCompare(left.scheduledAt ?? ""))[0];
}

function latestStorybook(context: AssistantParseContext, childId?: string) {
  return (context.storybooks ?? [])
    .filter((storybook) => !childId || storybook.childId === childId)
    .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))[0];
}

function inferChildStatusSection(text: string) {
  if (/饮食|餐食|吃了什么|吃了啥|早餐|午餐|晚餐|加餐/.test(text)) return "meal";
  if (/健康记录|健康|晨检|体温|咳嗽|发烧/.test(text)) return "health";
  if (/成长|档案|行为|表现/.test(text)) return "growth";
  return "today";
}

function inferStorybookExportFormat(text: string) {
  if (/markdown|md|文档/.test(text)) return "markdown";
  if (/网页|html|打印/.test(text)) return "html";
  return "json";
}

function inferMeal(text: string) {
  return MEAL_WORDS.find((item) => text.includes(item.word))?.value ?? "午餐";
}

function inferMealIntake(text: string) {
  if (/吃完|吃光|全部|很好/.test(text)) return "充足";
  if (/没吃|很少|少量/.test(text)) return "少量";
  return "适中";
}

function inferGrowthCategory(text: string) {
  if (/穿鞋|穿衣|吃饭|如厕|自己/.test(text)) return "生活自理";
  if (/午睡|睡/.test(text)) return "睡眠情况";
  if (/说话|表达|语言/.test(text)) return "语言表达";
  if (/朋友|同伴|分享|合作/.test(text)) return "社交互动";
  if (/跑|跳|走|平衡/.test(text)) return "大动作";
  if (/画|搭|拼|握笔/.test(text)) return "精细动作";
  return "情绪表现";
}

function createNavigationIfMatched(context: AssistantParseContext, utterance: AssistantUtterance, text: string) {
  const child = findMentionedChild(context, text);

  if (/返回首页|回首页|打开首页|回到首页|园长首页|园长端首页|园所首页/.test(text)) {
    const home = getAssistantRoleHomePath(context.role);
    return navigateCommand(context, utterance, context.role === "parent" ? appendChildQuery(home, child?.id) : home, "首页");
  }

  if (/教师管理|老师管理/.test(text)) {
    return navigateCommand(context, utterance, "/admin/teachers", "教师管理");
  }

  if (/健康材料解析|材料解析/.test(text) && /打开|查看|跳转|进入/.test(text)) {
    return navigateCommand(context, utterance, "/teacher/health-file-bridge", "健康材料解析");
  }

  if (/高风险|会诊/.test(text) && /打开|查看|跳转/.test(text) && context.role !== "director") {
    return navigateCommand(context, utterance, "/teacher/high-risk-consultation", "高风险会诊");
  }

  if (/家园沟通|沟通|留言/.test(text) && /打开|跳转/.test(text)) {
    const rolePath = context.role === "parent" ? "/parent/agent" : context.role === "teacher" ? "/teacher/agent" : "/admin/agent";
    return navigateCommand(context, utterance, appendChildQuery(rolePath, child?.id), "家园沟通");
  }

  if (/成长绘本|绘本/.test(text) && /分享|导出/.test(text)) {
    return null;
  }

  if (/成长绘本|绘本/.test(text)) {
    return navigateCommand(context, utterance, appendChildQuery("/parent/storybook", child?.id), "成长绘本");
  }

  if (/健康记录|晨检|健康/.test(text) && /打开|跳转|进入/.test(text)) {
    return navigateCommand(context, utterance, appendChildQuery("/health", child?.id), "健康记录");
  }

  if (/今天吃了什么|饮食|吃了什么|餐食|营养餐谱|餐谱|菜谱|食谱/.test(text) && /打开|跳转|进入/.test(text)) {
    return navigateCommand(context, utterance, appendChildQuery("/diet", child?.id), "饮食记录");
  }

  if (/成长档案|成长记录|成长/.test(text) && /打开|跳转|进入/.test(text)) {
    return navigateCommand(context, utterance, appendChildQuery("/growth", child?.id), "成长档案");
  }

  if (/儿童档案|幼儿档案|孩子档案|档案/.test(text) && /打开|查看|跳转/.test(text)) {
    return child
      ? commandBase({
          context,
          utterance,
          intent: "open_child_profile",
          confidence: 0.86,
          safetyLevel: "safe",
          previewText: `打开${child.name}的儿童档案`,
          execute: "child.open_profile",
          params: childParams(child),
          deeplink: appendChildIdQuery("/children", child.id),
        })
      : navigateCommand(context, utterance, "/children", "儿童档案");
  }

  if (/提醒|待办|任务/.test(text) && /打开|跳转|进入/.test(text)) {
    const path = context.role === "parent" ? appendChildQuery("/parent/reminders", child?.id) : getAssistantRoleHomePath(context.role);
    return navigateCommand(context, utterance, path, "今天的提醒");
  }

  return null;
}

function consultationIntent(context: AssistantParseContext, utterance: AssistantUtterance, text: string) {
  const child = findMentionedChild(context, text);
  const consultationId = context.objects?.consultationId;

  if (/添加|新增|记录|补充/.test(text) && /会诊/.test(text) && /备注|记录|说明/.test(text)) {
    const note = contentAfter(text, ["备注", "说明", "记录"]) || utterance.text;
    return commandBase({
      context,
      utterance,
      intent: "add_consultation_note",
      confidence: 0.74,
      safetyLevel: "write",
      previewText: `为当前会诊补充备注：${note}`,
      execute: "consultation.add_note",
      params: { consultationId, note },
      missingParams: consultationId ? [] : ["consultationId"],
    });
  }

  if (/更新|标记|改成|设为/.test(text) && /会诊/.test(text)) {
    const status = /完成|结束|已处理/.test(text) ? "resolved" : /跟进|处理中|进行/.test(text) ? "in-progress" : "";
    return commandBase({
      context,
      utterance,
      intent: "update_consultation_status",
      confidence: 0.72,
      safetyLevel: "write",
      previewText: status ? `将当前会诊状态更新为 ${status}` : "更新当前会诊状态",
      execute: "consultation.update_status",
      params: { consultationId, status },
      missingParams: [...(consultationId ? [] : ["consultationId"]), ...(status ? [] : ["status"])],
    });
  }

  if (/创建|新增|发起/.test(text) && /会诊/.test(text)) {
    const riskLevel = /高风险|严重|高/.test(text) ? "high" : /低风险|低/.test(text) ? "low" : "medium";
    const summary = contentAfter(text, ["会诊", "，"]) || "语音助手创建的会诊";
    return commandBase({
      context,
      utterance,
      intent: "create_consultation",
      confidence: 0.78,
      safetyLevel: "write",
      previewText: child ? `为${child.name}创建${riskLevel === "high" ? "高风险" : "风险"}会诊：${summary}` : "创建会诊",
      execute: "consultation.create",
      params: { ...childParams(child), riskLevel, summary, notes: summary },
      missingParams: missingChild(child),
    });
  }

  return null;
}

function inferDirectorTrendMetric(text: string) {
  if (/饮食|餐食|午餐|早餐|晚餐/.test(text)) return "meal";
  if (/晨检|健康|体温|异常/.test(text)) return "health-abnormal";
  if (/成长|观察|行为/.test(text)) return "growth";
  if (/反馈|家长/.test(text)) return "feedback";
  if (/会诊|风险/.test(text)) return "high-risk-consultation";
  return "records";
}

function directorIntent(context: AssistantParseContext, utterance: AssistantUtterance, text: string) {
  if (context.role !== "director") return null;
  const child = findMentionedChild(context, text);
  const teacher = findMentionedTeacher(context, text);
  const feedbackId = context.objects?.feedbackId;
  const assignmentId = context.objects?.assignmentId ?? context.objects?.dispatchId;

  if (/反馈/.test(text) && /标记|设为|改成|已处理|完成|解决/.test(text)) {
    return commandBase({
      context,
      utterance,
      intent: "mark_feedback_resolved",
      confidence: 0.86,
      safetyLevel: "write",
      previewText: child ? `将${child.name}最近一条未处理反馈标记为已处理` : "将当前反馈标记为已处理",
      execute: "feedback.mark_resolved",
      params: { feedbackId, ...childParams(child), status: "resolved" },
      missingParams: feedbackId || child ? [] : ["feedbackId"],
    });
  }

  if (/(派单|任务)/.test(text) && /接收|标记|改成|设为|跟进中|已完成|完成|关闭|闭环/.test(text)) {
    const status = /完成|已完成|处理完|关闭|闭环/.test(text) ? "completed" : "in_progress";
    return commandBase({
      context,
      utterance,
      intent: "update_assignment_status",
      confidence: 0.82,
      safetyLevel: "write",
      previewText: status === "completed" ? "将当前派单标记为已完成" : "将当前派单标记为跟进中",
      execute: "assignment.update_status",
      params: { assignmentId, ...childParams(child), teacherId: teacher?.id, status },
      missingParams: assignmentId || child || teacher ? [] : ["assignmentId"],
    });
  }

  if (/派单|分派|指派|派给|安排给|交给|让.*跟进|请.*复查/.test(text)) {
    const task = contentAfter(text, ["派单", "分派", "指派", "派给", "安排给", "交给", "跟进", "复查"]) || utterance.text;
    return commandBase({
      context,
      utterance,
      intent: "assign_task",
      confidence: 0.86,
      safetyLevel: "risky",
      previewText: teacher ? `准备给${teacher.name}派单：${task}` : "准备派单",
      execute: "assignment.create",
      params: { teacherId: teacher?.id, teacherName: teacher?.name, ...childParams(child), task, title: child ? `${child.name}跟进任务` : "园长派单" },
      missingParams: [...(teacher ? [] : ["teacherId"]), ...missingChild(child), ...(task ? [] : ["task"])],
      riskText: "派单会写入教师待办并刷新后保留，请确认教师和任务内容正确。",
    });
  }

  if (/未处理反馈|待处理反馈|未解决反馈|反馈列表/.test(text)) {
    return commandBase({
      context,
      utterance,
      intent: "query_director_feedback",
      confidence: 0.86,
      safetyLevel: "safe",
      previewText: "查看未处理反馈",
      execute: "query.director_feedback",
      params: { status: "open", ...childParams(child) },
    });
  }

  if (/趋势|怎么样|质量指标|覆盖率/.test(text) && /饮食|餐食|晨检|健康|成长|反馈|会诊|运营|记录/.test(text)) {
    const metric = inferDirectorTrendMetric(text);
    return commandBase({
      context,
      utterance,
      intent: "query_director_trend",
      confidence: 0.84,
      safetyLevel: "safe",
      previewText: `查询${metric === "meal" ? "饮食" : metric === "health-abnormal" ? "健康异常" : "运营"}趋势`,
      execute: "query.director_trend",
      params: { metric, timeRange: /本周|周/.test(text) ? "week" : "recent7", windowDays: /本周|周/.test(text) ? 7 : 7 },
    });
  }

  if (/高风险会诊|会诊状态|会诊进展|风险会诊/.test(text)) {
    return commandBase({
      context,
      utterance,
      intent: "query_consultation_status",
      confidence: 0.86,
      safetyLevel: "safe",
      previewText: "查看高风险会诊状态",
      execute: "query.consultation_status",
      params: { riskLevel: /高风险|高/.test(text) ? "high" : undefined, ...childParams(child) },
    });
  }

  if (/高风险(?:儿童|孩子)|风险(?:儿童|孩子)|优先关注|哪些孩子|异常晨检|晨检异常/.test(text)) {
    const focusType = /异常晨检|晨检异常|多少/.test(text) ? "morning_abnormal" : "risk";
    return commandBase({
      context,
      utterance,
      intent: "query_director_risk",
      confidence: 0.86,
      safetyLevel: "safe",
      previewText: focusType === "morning_abnormal" ? "查询今日异常晨检" : "查看重点跟进记录",
      execute: "query.director_risk",
      params: { focusType, ...childParams(child) },
    });
  }

  if (/本周运营报表|运营报表|园所报表/.test(text)) {
    return commandBase({
      context,
      utterance,
      intent: "query_dashboard",
      confidence: 0.82,
      safetyLevel: "safe",
      previewText: "查看本周运营报表",
      execute: "query.dashboard",
      params: { focusType: "operation_report" },
    });
  }

  return null;
}

function directorOnlyIntentFor(text: string): AssistantIntent | null {
  if (/未处理反馈|待处理反馈|未解决反馈|高风险(?:儿童|孩子)|风险(?:儿童|孩子)|异常晨检|晨检异常/.test(text)) {
    return /反馈/.test(text) ? "query_director_feedback" : "query_director_risk";
  }
  if (/园长首页|园长端首页|园所首页/.test(text)) return "navigate";
  if (!/创建|新增|发起|建立/.test(text) && /高风险会诊|会诊状态|会诊进展|风险会诊/.test(text)) return "query_consultation_status";
  if (/本周运营报表|运营报表|园所报表|饮食.*趋势|餐食.*趋势|晨检.*趋势/.test(text)) return "query_director_trend";
  if (
    /派单|分派|指派|派给|安排给|交给|让.*跟进|请.*复查/.test(text) &&
    !/接收|标记|改成|设为|跟进中|已完成|完成|关闭|闭环/.test(text)
  ) return "assign_task";
  if (/教师管理|老师管理/.test(text)) return "navigate";
  return null;
}

function forbiddenDirectorIntent(
  context: AssistantParseContext,
  utterance: AssistantUtterance,
  intent: AssistantIntent
) {
  return commandBase({
    context,
    utterance,
    intent,
    confidence: 0.8,
    safetyLevel: intent === "assign_task" ? "risky" : "safe",
    previewText: "当前角色不能执行园长语音命令。",
    execute: "director.forbidden",
    status: "forbidden",
  });
}

export function parseAssistantCommand(context: AssistantParseContext, utterance: AssistantUtterance): AssistantCommand {
  const text = normalizeText(utterance.text);
  if (!text) return unknownCommand(context, utterance, "请输入文字指令，或点击语音按钮后再说。");

  if (context.role !== "director") {
    const directorOnlyIntent = directorOnlyIntentFor(text);
    if (directorOnlyIntent) return forbiddenDirectorIntent(context, utterance, directorOnlyIntent);
  }

  const director = context.role === "director" ? directorIntent(context, utterance, text) : null;
  if (director) return director;

  const navigation = createNavigationIfMatched(context, utterance, text);
  if (navigation) return navigation;

  const child = findMentionedChild(context, text);
  const className = findMentionedClassName(context, text);

  if (/导出/.test(text) && /成长绘本|绘本/.test(text)) {
    const storybook = latestStorybook(context, child?.id);
    return commandBase({
      context,
      utterance,
      intent: "export_storybook",
      confidence: 0.86,
      safetyLevel: "risky",
      previewText: child ? `导出${child.name}的成长绘本` : "导出成长绘本",
      execute: "storybook.export",
      params: {
        ...childParams(child),
        storybookId: context.objects?.storybookId ?? storybook?.id,
        format: inferStorybookExportFormat(text),
      },
      missingParams: child || storybook ? [] : ["childId"],
      riskText: "导出会生成本地下载文件，未接入外部分享服务时只生成本地 HTML/Markdown/JSON。",
    });
  }

  if (/分享/.test(text) && /成长绘本|绘本/.test(text)) {
    const storybook = latestStorybook(context, child?.id);
    return commandBase({
      context,
      utterance,
      intent: "share_storybook",
      confidence: 0.84,
      safetyLevel: "risky",
      previewText: child ? `分享${child.name}的成长绘本` : "分享成长绘本",
      execute: "storybook.share",
      params: {
        ...childParams(child),
        storybookId: context.objects?.storybookId ?? storybook?.id,
      },
      missingParams: child || storybook ? [] : ["childId"],
      riskText: "当前没有外部分享服务时，将生成本地分享摘要和可复制文案，请确认后生成。",
    });
  }

  if (context.role === "parent" && /查看|查询|看看/.test(text) && /老师回复|教师回复|老师消息|回复/.test(text)) {
    return commandBase({
      context,
      utterance,
      intent: "query_teacher_replies",
      confidence: 0.86,
      safetyLevel: "safe",
      previewText: child ? `查看${child.name}的老师回复` : "查看老师回复",
      execute: "query.teacher_replies",
      params: { ...childParams(child) },
      missingParams: missingChild(child),
    });
  }

  if (/未回复|未处理|待回复/.test(text) && /(家长消息|家长留言|消息|留言)/.test(text)) {
    return commandBase({
      context,
      utterance,
      intent: "query_parent_messages",
      confidence: 0.86,
      safetyLevel: "safe",
      previewText: "查询未回复家长消息",
      execute: "query.parent_messages",
      params: { ...childParams(child), className },
    });
  }

  if (/派单|分派|指派/.test(text) && /接收|标记|改成|设为|跟进中|已完成|完成/.test(text)) {
    const status = /完成|已完成|处理完/.test(text) ? "resolved" : /跟进|处理中|进行|接收/.test(text) ? "in-progress" : "";
    return commandBase({
      context,
      utterance,
      intent: "update_dispatch_status",
      confidence: 0.82,
      safetyLevel: "write",
      previewText:
        status === "resolved"
          ? "将当前园长派单标记为已完成"
          : status === "in-progress"
            ? "将当前园长派单标记为跟进中"
            : "更新当前园长派单状态",
      execute: "dispatch.update_status",
      params: {
        consultationId: context.objects?.consultationId ?? context.objects?.dispatchId,
        status,
        ...childParams(child),
      },
      missingParams: status ? [] : ["status"],
    });
  }

  if (/健康材料解析任务|材料解析任务/.test(text) && /创建|新增|发起|建立/.test(text)) {
    const description = contentAfter(text, ["解析任务", "材料", "，"]) || utterance.text;
    return commandBase({
      context,
      utterance,
      intent: "create_health_material_task",
      confidence: 0.78,
      safetyLevel: "write",
      previewText: child ? `为${child.name}创建健康材料解析任务：${description}` : "创建健康材料解析任务",
      execute: "health_material.create_task",
      params: {
        ...childParams(child),
        filename: "voice-health-material-note.txt",
        fileType: "text/plain",
        description,
      },
      missingParams: missingChild(child),
      deeplink: child ? appendChildIdQuery("/teacher/health-file-bridge", child.id) : "/teacher/health-file-bridge",
    });
  }

  if (/派单|分派|指派/.test(text)) {
    const teacher = findMentionedTeacher(context, text);
    const task = contentAfter(text, ["派单", "分派", "指派", "跟进"]) || utterance.text;
    return commandBase({
      context,
      utterance,
      intent: "assign_task",
      confidence: 0.68,
      safetyLevel: "risky",
      previewText: teacher ? `准备给${teacher.name}派单：${task}` : "准备派单",
      execute: "task.assign",
      params: { teacherId: teacher?.id, teacherName: teacher?.name, ...childParams(child), task },
      missingParams: teacher ? [] : ["teacherId"],
      status: "unsupported",
      riskText: "E06 尚未发现稳定的 E01 任务派单 API，本命令只做预览和权限校验，不会显示执行成功。",
    });
  }

  if (/生成/.test(text) && /周报/.test(text)) {
    return commandBase({
      context,
      utterance,
      intent: "generate_weekly_report",
      confidence: 0.86,
      safetyLevel: "write",
      previewText: "生成本周周报草稿",
      execute: "weekly_report.generate",
      params: {
        scopeType: context.role === "director" ? "institution" : context.role === "teacher" ? "class" : "child",
        scopeId: context.role === "director" ? context.user.institutionId : context.role === "teacher" ? context.user.className : child?.id,
        title: "本周周报",
      },
      missingParams: context.role === "parent" ? missingChild(child) : context.role === "teacher" && !context.user.className ? ["className"] : [],
    });
  }

  if (/导出/.test(text) && /周报/.test(text)) {
    return commandBase({
      context,
      utterance,
      intent: "export_weekly_report",
      confidence: 0.82,
      safetyLevel: "risky",
      previewText: "导出最近一份可访问周报",
      execute: "weekly_report.export",
      params: { weeklyReportId: context.objects?.weeklyReportId, format: /文档|markdown|md/.test(text) ? "markdown" : "json" },
      riskText: "导出会生成可下载内容，请确认数据范围正确。",
    });
  }

  if (/分享/.test(text) && /周报/.test(text)) {
    return commandBase({
      context,
      utterance,
      intent: "share_weekly_report",
      confidence: 0.8,
      safetyLevel: "risky",
      previewText: "分享最近一份可访问周报",
      execute: "weekly_report.share",
      params: { weeklyReportId: context.objects?.weeklyReportId },
      riskText: "分享会改变周报状态并生成分享文案，请二次确认。",
    });
  }

  const consultation = consultationIntent(context, utterance, text);
  if (consultation) return consultation;

  if (/标记/.test(text) && /提醒/.test(text) && /已读|读过|完成|知道/.test(text)) {
    const reminder = latestPendingReminder(context, child?.id);
    const reminderId = context.objects?.reminderId ?? reminder?.id;
    return commandBase({
      context,
      utterance,
      intent: "mark_reminder_read",
      confidence: 0.82,
      safetyLevel: "write",
      previewText: reminder?.title ? `将提醒「${reminder.title}」标记为已读` : "将当前提醒标记为已读",
      execute: "reminder.mark_read",
      params: { reminderId, ...childParams(child), status: "acknowledged" },
      missingParams: reminderId || child ? [] : ["reminderId"],
    });
  }

  if (/反馈/.test(text) && /查看|打开|详情/.test(text)) {
    return commandBase({
      context,
      utterance,
      intent: "view_feedback_detail",
      confidence: 0.74,
      safetyLevel: "safe",
      previewText: child ? `查看${child.name}的反馈详情` : "查看反馈详情",
      execute: "feedback.view",
      params: { feedbackId: context.objects?.feedbackId, ...childParams(child) },
      missingParams: context.objects?.feedbackId || child ? [] : ["feedbackId"],
    });
  }

  if (/反馈|建议|投诉|问题/.test(text) && /新增|创建|提交|记录|我要|我想|想要/.test(text)) {
    const content = contentAfter(text, ["反馈", "建议", "投诉", "问题"]) || utterance.text;
    return commandBase({
      context,
      utterance,
      intent: "create_feedback",
      confidence: 0.72,
      safetyLevel: "write",
      previewText: child ? `为${child.name}提交反馈：${content}` : `提交反馈：${content}`,
      execute: "feedback.create",
      params: { ...childParams(child), content, title: content.slice(0, 24) || "语音反馈" },
      missingParams: missingChild(child),
    });
  }

  if (/回复/.test(text) && /(妈妈|爸爸|家长|老师|消息|留言)/.test(text)) {
    const content = contentAfter(text, ["回复林妈妈", "回复老师", "回复家长", "回复"]);
    return commandBase({
      context,
      utterance,
      intent: "reply_message",
      confidence: 0.82,
      safetyLevel: "write",
      previewText: child ? `回复${child.name}相关会话：${content || utterance.text}` : `回复会话：${content || utterance.text}`,
      execute: "message.reply",
      params: { messageId: context.objects?.messageId, ...childParams(child), content: content || utterance.text },
      missingParams: content ? missingChild(child) : [...missingChild(child), "content"],
    });
  }

  if (/留言|问老师|给老师|告诉老师|发消息/.test(text)) {
    const content = contentAfter(text, ["给老师留言", "问老师", "告诉老师", "发消息", "留言"]) || utterance.text;
    return commandBase({
      context,
      utterance,
      intent: "send_message",
      confidence: 0.78,
      safetyLevel: "write",
      previewText: child ? `给老师发送${child.name}相关留言：${content}` : `发送留言：${content}`,
      execute: "message.send",
      params: { ...childParams(child), content },
      missingParams: content ? missingChild(child) : [...missingChild(child), "content"],
    });
  }

  if (/晨检|体温|咳嗽|发烧|状态/.test(text) && /记录|新增|今天/.test(text)) {
    const temperature = readTemperature(text);
    const abnormal = /咳嗽|发烧|异常|不舒服|流鼻涕|腹泻|提醒/.test(text);
    return commandBase({
      context,
      utterance,
      intent: "create_morning_check",
      confidence: 0.86,
      safetyLevel: "write",
      previewText: child
        ? `为${child.name}记录晨检：体温 ${temperature ?? "未填写"}，${abnormal ? "需关注" : "状态正常"}`
        : "记录晨检",
      execute: "record.create.health",
      params: {
        ...childParams(child),
        type: "health",
        temperature,
        mood: abnormal ? "needs-attention" : "stable",
        handMouthEye: abnormal ? "异常" : "正常",
        isAbnormal: abnormal,
        remark: utterance.text,
      },
      missingParams: [...missingChild(child), ...(temperature || abnormal ? [] : ["temperature"])],
    });
  }

  if (
    /午餐|早餐|晚餐|加餐|吃完|吃了什么|饮食/.test(text) &&
    (/记录|新增/.test(text) || (context.role !== "parent" && /今天|吃完|吃了/.test(text)))
  ) {
    const meal = inferMeal(text);
    const intakeLevel = inferMealIntake(text);
    const isClassRecord = Boolean(className) || /全班|班级|大部分孩子|多数孩子|孩子们/.test(text);
    const targetClassName = className ?? (isClassRecord ? context.user.className : undefined);
    return commandBase({
      context,
      utterance,
      intent: "create_diet_record",
      confidence: 0.8,
      safetyLevel: "write",
      previewText: child
        ? `为${child.name}记录${meal}：${intakeLevel}`
        : targetClassName
          ? `为${targetClassName}记录${meal}：${intakeLevel}`
          : `记录${meal}：${intakeLevel}`,
      execute: "record.create.meal",
      params: {
        ...childParams(child),
        className: targetClassName,
        bulkClass: Boolean(targetClassName && !child),
        type: "meal",
        meal,
        foods: [],
        intakeLevel,
        preference: "正常",
        nutritionScore: intakeLevel === "充足" ? 88 : intakeLevel === "少量" ? 62 : 78,
        remark: utterance.text,
      },
      missingParams: child || targetClassName ? [] : ["childId"],
    });
  }

  if (/成长|会自己|学会|表现|行为/.test(text) && /记录|新增|写一条|添加/.test(text)) {
    const description = contentAfter(text, ["成长记录", "记录", "新增一条", "添加"]) || utterance.text;
    return commandBase({
      context,
      utterance,
      intent: "create_growth_record",
      confidence: 0.78,
      safetyLevel: "write",
      previewText: child ? `为${child.name}新增成长记录：${description}` : `新增成长记录：${description}`,
      execute: "record.create.growth",
      params: {
        ...childParams(child),
        type: "growth",
        category: inferGrowthCategory(text),
        tags: ["voice-assistant"],
        description,
        needsAttention: /异常|风险|关注|困难/.test(text),
      },
      missingParams: description ? missingChild(child) : [...missingChild(child), "description"],
    });
  }

  if (/查看|查询/.test(text) && /(今天的提醒|今天提醒|提醒|任务|待办)/.test(text)) {
    return commandBase({
      context,
      utterance,
      intent: "query_today_tasks",
      confidence: 0.82,
      safetyLevel: "safe",
      previewText: "查询今天的提醒和待办",
      execute: "query.today_tasks",
      params: { ...childParams(child) },
    });
  }

  if (/查看|查询/.test(text) && /(状态|健康|饮食|餐食|吃了什么|晨检|儿童)/.test(text)) {
    const isClassQuery = Boolean(className) || /班级|全班|本班/.test(text);
    const targetClassName = className ?? (isClassQuery ? context.user.className : undefined);
    const section = inferChildStatusSection(text);
    return commandBase({
      context,
      utterance,
      intent: "query_child_status",
      confidence: 0.76,
      safetyLevel: "safe",
      previewText: child
        ? `查询${child.name}${section === "meal" ? "今日饮食" : section === "health" ? "健康记录" : "当前状态"}`
        : targetClassName
          ? `查询${targetClassName}儿童状态`
          : "查询儿童状态",
      execute: "query.child_status",
      params: { ...childParams(child), className: targetClassName, section },
      missingParams: child || targetClassName ? [] : ["childId"],
    });
  }

  if (/查看|查询/.test(text) && /(看板|概览|高风险(?:儿童|孩子)|未处理反馈|数据)/.test(text)) {
    return commandBase({
      context,
      utterance,
      intent: "query_dashboard",
      confidence: 0.74,
      safetyLevel: "safe",
      previewText: "查询当前角色看板摘要",
      execute: "query.dashboard",
      params: {},
    });
  }

  return unknownCommand(context, utterance);
}
