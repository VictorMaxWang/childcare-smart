import assert from "node:assert/strict";
import test from "node:test";

import { DEMO_ACCOUNTS } from "@/lib/auth/accounts";
import { accountRoleToAssistantRole } from "@/lib/voice-assistant/intents";
import { parseAssistantCommand } from "@/lib/voice-assistant/parser";
import { validateAssistantCommandPermission } from "@/lib/voice-assistant/permissions";
import type { AssistantParseContext } from "@/lib/voice-assistant/types";

function demoUser(accountId: string) {
  const user = DEMO_ACCOUNTS.find((account) => account.id === accountId);
  assert.ok(user);
  return user;
}

function contextFor(accountId: string): AssistantParseContext {
  const user = demoUser(accountId);
  const role = accountRoleToAssistantRole(user.role);
  const allChildren = [
    { id: "c-1", name: "林小雨", className: "向阳班", guardianNames: ["林妈妈"] },
    { id: "c-2", name: "张浩然", className: "向阳班" },
    { id: "c-4", name: "林小明", nickname: "小明", className: "向阳班", guardianNames: ["林妈妈"] },
    { id: "c-5", name: "赵安安", className: "晨曦班" },
    { id: "c-6", name: "钱晨晨", className: "晨曦班" },
  ];
  const children =
    accountId === "u-teacher2"
      ? allChildren.filter((child) => child.className === "晨曦班")
      : accountId === "u-parent"
        ? allChildren.filter((child) => child.id === "c-1" || child.id === "c-4")
        : allChildren.filter((child) => child.className === "向阳班");

  return {
    role,
    accountRole: user.role,
    user,
    children,
    allChildren,
    teachers: [{ id: "u-teacher", name: "李老师", className: "向阳班" }],
    reminders: [
      {
        id: "reminder-c1-daily-feedback",
        childId: "c-1",
        title: "今日反馈提醒",
        status: "pending",
        scheduledAt: "2026-05-02T09:00:00.000Z",
      },
    ],
    storybooks: [
      {
        id: "storybook-c1",
        childId: "c-1",
        title: "小雨的成长绘本",
        generatedAt: "2026-05-02T09:00:00.000Z",
      },
    ],
    currentQuery: { child: "c-1" },
  };
}

function parse(accountId: string, text: string) {
  return parseAssistantCommand(contextFor(accountId), {
    text,
    inputMode: "text",
    transcriptSource: "test",
  });
}

test("parses role-safe navigation", () => {
  const command = parse("u-admin", "打开教师管理");
  assert.equal(command.intent, "navigate");
  assert.equal(command.status, "ready");
  assert.equal(command.params.path, "/admin/teachers");
});

test("blocks role-forbidden navigation", () => {
  const command = parse("u-parent", "打开教师管理");
  assert.equal(command.intent, "navigate");
  assert.equal(command.status, "forbidden");
});

test("parses teacher morning check and requires confirmation", () => {
  const command = parse("u-teacher", "给林小雨记录晨检，体温三十六点八，状态正常");
  assert.equal(command.intent, "create_morning_check");
  assert.equal(command.status, "needs_confirmation");
  assert.equal(command.requiredConfirmation, true);
  assert.equal(command.params.childId, "c-1");
  assert.equal(command.params.temperature, 36.8);
});

test("parses parent message as write command", () => {
  const command = parse("u-parent", "给老师留言，今天晚上孩子有点咳嗽");
  assert.equal(command.intent, "send_message");
  assert.equal(command.status, "needs_confirmation");
  assert.equal(command.params.childId, "c-1");
});

test("parses E09 parent voice commands", () => {
  const cases: Array<[string, string, string]> = [
    ["给老师留言，今天晚上孩子有点咳嗽", "send_message", "needs_confirmation"],
    ["问老师今天午睡怎么样", "send_message", "needs_confirmation"],
    ["查看今天吃了什么", "query_child_status", "ready"],
    ["打开成长绘本", "navigate", "ready"],
    ["打开成长档案", "navigate", "ready"],
    ["查看健康记录", "query_child_status", "ready"],
    ["打开营养餐谱", "navigate", "ready"],
    ["标记这个提醒已读", "mark_reminder_read", "needs_confirmation"],
    ["我要反馈，孩子最近睡眠不太好", "create_feedback", "needs_confirmation"],
    ["分享成长绘本", "share_storybook", "needs_confirmation"],
    ["导出成长绘本", "export_storybook", "needs_confirmation"],
    ["查看老师回复", "query_teacher_replies", "ready"],
    ["查看今天的提醒", "query_today_tasks", "ready"],
  ];

  for (const [text, intent, status] of cases) {
    const command = parse("u-parent", text);
    assert.equal(command.intent, intent, text);
    assert.equal(command.status, status, text);
    if (command.intent !== "navigate") assert.equal(command.params.childId, "c-1", text);
  }

  assert.equal(parse("u-parent", "查看今天吃了什么").params.section, "meal");
  assert.equal(parse("u-parent", "查看健康记录").params.section, "health");
  assert.equal(parse("u-parent", "标记这个提醒已读").params.reminderId, "reminder-c1-daily-feedback");
  assert.equal(parse("u-parent", "导出成长绘本").params.storybookId, "storybook-c1");
});

test("E09 parent child scope rejects forged child and deeplink", () => {
  const context = contextFor("u-parent");
  const command = parseAssistantCommand(context, { text: "查看张浩然今天状态", inputMode: "text" });
  const permission = validateAssistantCommandPermission(command, context);
  assert.equal(command.params.childId, "c-2");
  assert.equal(permission.ok, false);
  assert.equal(permission.status, "forbidden");

  const nav = parseAssistantCommand(context, { text: "打开成长档案", inputMode: "text" });
  const forged = {
    ...nav,
    params: { ...nav.params, path: "/growth?child=c-2" },
    deeplink: "/growth?child=c-2",
  };
  const forgedPermission = validateAssistantCommandPermission(forged, context);
  assert.equal(forgedPermission.ok, false);
  assert.equal(forgedPermission.status, "forbidden");
});

test("unknown command does not pass permission validation", () => {
  const context = contextFor("u-teacher");
  const command = parseAssistantCommand(context, { text: "帮我变一个魔法", inputMode: "text" });
  assert.equal(command.intent, "unknown");
  const permission = validateAssistantCommandPermission(command, context);
  assert.equal(permission.ok, false);
  assert.equal(permission.status, "unknown");
});

test("assign task is previewable for director and requires confirmation", () => {
  const command = parse("u-admin", "给李老师派单，跟进林小雨的晨检异常");
  assert.equal(command.intent, "assign_task");
  assert.equal(command.status, "needs_confirmation");
  assert.equal(command.requiredConfirmation, true);
});

test("parses E07 director commands", () => {
  const cases: Array<[string, string, string]> = [
    ["查看未处理反馈", "query_director_feedback", "ready"],
    ["查看高风险儿童", "query_director_risk", "ready"],
    ["今天有多少异常晨检", "query_director_risk", "ready"],
    ["本周饮食记录趋势怎么样", "query_director_trend", "ready"],
    ["查看高风险会诊", "query_consultation_status", "ready"],
    ["查看本周运营报表", "query_dashboard", "ready"],
    ["打开小明的反馈详情", "view_feedback_detail", "ready"],
    ["把这条反馈标记为已处理", "mark_feedback_resolved", "needs_confirmation"],
    ["给李老师派单，跟进小明晨检异常", "assign_task", "needs_confirmation"],
  ];

  for (const [text, intent, status] of cases) {
    const context = contextFor("u-admin");
    context.objects = { feedbackId: "fb-1" };
    const command = parseAssistantCommand(context, { text, inputMode: "text", transcriptSource: "test" });
    const permission = validateAssistantCommandPermission(command, context);
    assert.equal(command.intent, intent, text);
    assert.equal(permission.status, status, text);
  }
});

test("non-director E07 commands are forbidden", () => {
  const cases = ["查看未处理反馈", "给李老师派单，跟进小明晨检异常", "打开园长首页"];
  for (const text of cases) {
    const context = contextFor("u-parent");
    const command = parseAssistantCommand(context, { text, inputMode: "text", transcriptSource: "test" });
    const permission = validateAssistantCommandPermission(command, context);
    assert.equal(permission.status, "forbidden", text);
  }
});

test("parses E08 teacher commands", () => {
  const cases: Array<[string, string, string]> = [
    ["给小明记录晨检，体温三十六点八，状态正常", "create_morning_check", "needs_confirmation"],
    ["小明今天晨检咳嗽，提醒家长关注", "create_morning_check", "needs_confirmation"],
    ["记录小明午餐吃完了", "create_diet_record", "needs_confirmation"],
    ["记录晨曦班午餐大部分孩子吃完", "create_diet_record", "forbidden"],
    ["给小明新增成长记录，今天会自己穿鞋", "create_growth_record", "needs_confirmation"],
    ["回复林妈妈，今天小明午睡很好", "reply_message", "needs_confirmation"],
    ["打开家园沟通", "navigate", "ready"],
    ["打开健康材料解析", "navigate", "ready"],
    ["给小明创建高风险会诊", "create_consultation", "needs_confirmation"],
    ["查看今天的任务", "query_today_tasks", "ready"],
    ["把园长派单标记为跟进中", "update_dispatch_status", "needs_confirmation"],
    ["把这个派单标记为已完成", "update_dispatch_status", "needs_confirmation"],
    ["打开小明档案", "open_child_profile", "ready"],
    ["查看未回复家长消息", "query_parent_messages", "ready"],
  ];

  for (const [text, intent, status] of cases) {
    const context = contextFor("u-teacher");
    const command = parseAssistantCommand(context, { text, inputMode: "text", transcriptSource: "test" });
    const permission = validateAssistantCommandPermission(command, context);
    assert.equal(command.intent, intent, text);
    assert.equal(permission.status, status, text);
  }
});

test("teacher parser prefers spoken child over current page child", () => {
  const context = contextFor("u-teacher");
  const command = parseAssistantCommand(context, {
    text: "给小明记录晨检，体温三十六点八，状态正常",
    inputMode: "text",
    transcriptSource: "test",
  });
  assert.equal(command.params.childId, "c-4");
});

test("teacher cross-class child access is forbidden", () => {
  const context = contextFor("u-teacher2");
  const command = parseAssistantCommand(context, {
    text: "给小明记录晨检，体温三十六点八，状态正常",
    inputMode: "text",
    transcriptSource: "test",
  });
  const permission = validateAssistantCommandPermission(command, context);
  assert.equal(command.intent, "create_morning_check");
  assert.equal(command.params.childId, "c-4");
  assert.equal(permission.status, "forbidden");
});
