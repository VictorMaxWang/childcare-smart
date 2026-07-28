# R01 AI Assistant Audit

## Summary
- AI assistant target images: 32
- Official vivo reference: https://aigc.vivo.com.cn/#/document/index?id=1746
- All AI capability must call a server-side vivo provider or show explicit unavailable/degraded state.
- Browser UI must call local Next API/backend proxy only; never expose vivo keys, signatures, tokens, or `NEXT_PUBLIC_VIVO_*`.

## Existing Provider Inventory
- Next vivo adapters: `lib/providers/vivo/*`.
- Next provider wrappers: `lib/ai/providers/*`.
- Backend providers: `backend/app/providers/*`.
- AI routes and guards: `app/api/ai/*`, `lib/server/ai-route-guard.ts`, `lib/server/scope.ts`.

## Role Requirements
- Director: operations insight, risk priority, weekly report, dispatch, and decision Q&A.
- Teacher: class summary, focus children, communication drafts, execution tasks, voice understanding.
- Parent: tonight action, trend explanation, feedback completion, teacher-visible context.

## Failure Requirements
- vivo not configured: show unavailable/degraded copy and disable/send retry appropriately.
- Upstream failure: preserve error state and retry affordance; do not swallow or convert to success.
- Write/dispatch/archive actions: require command bus, permission, and confirmation boundaries.

## Target Matrix

| Design ID | Role | Route | Viewport | Entry | Prompts | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| SCFR-001-director-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作 | PAGE_SPECS/SCFR-001-director-ai-assistant-mobile.md |
| SCFR-002-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作 | PAGE_SPECS/SCFR-002-mobile-ai-assistant-mobile.md |
| SCFR-003-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作 | PAGE_SPECS/SCFR-003-mobile-ai-assistant-mobile.md |
| SCFR-004-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作 | PAGE_SPECS/SCFR-004-mobile-ai-assistant-mobile.md |
| SCFR-005-teacher-ai-assistant-desktop | teacher | /teacher/agent | desktop 1448x1086 | Main assistant workspace or right-side assistant panel. | 生成家园沟通建议 / 汇总班级今日重点 / 识别需要复查的儿童 | PAGE_SPECS/SCFR-005-teacher-ai-assistant-desktop.md |
| SCFR-006-shared-ai-assistant-desktop | shared | /admin/agent | desktop 1448x1086 | Main assistant workspace or right-side assistant panel. | 总结当前页面 / 解释风险指标 / 生成下一步建议 | PAGE_SPECS/SCFR-006-shared-ai-assistant-desktop.md |
| SCFR-007-teacher-ai-assistant-mobile | teacher | /teacher/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成家园沟通建议 / 汇总班级今日重点 / 识别需要复查的儿童 | PAGE_SPECS/SCFR-007-teacher-ai-assistant-mobile.md |
| SCFR-008-parent-ai-assistant-mobile | parent | /parent/agent?child=c-1 | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 今晚我该怎么做 / 解释近 7 天趋势 / 提交完成后的反馈 | PAGE_SPECS/SCFR-008-parent-ai-assistant-mobile.md |
| SCFR-009-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作 | PAGE_SPECS/SCFR-009-mobile-ai-assistant-mobile.md |
| SCFR-010-director-ai-assistant-desktop | director | /admin/agent | desktop 1448x1086 | Main assistant workspace or right-side assistant panel. | 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作 | PAGE_SPECS/SCFR-010-director-ai-assistant-desktop.md |
| SCFR-011-parent-ai-assistant-mobile | parent | /parent/agent?child=c-1 | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 今晚我该怎么做 / 解释近 7 天趋势 / 提交完成后的反馈 | PAGE_SPECS/SCFR-011-parent-ai-assistant-mobile.md |
| SCFR-012-teacher-ai-assistant-mobile | teacher | /teacher/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成家园沟通建议 / 汇总班级今日重点 / 识别需要复查的儿童 | PAGE_SPECS/SCFR-012-teacher-ai-assistant-mobile.md |
| SCFR-015-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作 | PAGE_SPECS/SCFR-015-mobile-ai-assistant-mobile.md |
| SCFR-016-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作 | PAGE_SPECS/SCFR-016-mobile-ai-assistant-mobile.md |
| SCFR-050-shared-ai-assistant-desktop | shared | /admin/agent | desktop 1448x1086 | Main assistant workspace or right-side assistant panel. | 总结当前页面 / 解释风险指标 / 生成下一步建议 | PAGE_SPECS/SCFR-050-shared-ai-assistant-desktop.md |
| SCFR-051-shared-ai-assistant-desktop | shared | /admin/agent | desktop 1448x1086 | Main assistant workspace or right-side assistant panel. | 总结当前页面 / 解释风险指标 / 生成下一步建议 | PAGE_SPECS/SCFR-051-shared-ai-assistant-desktop.md |
| SCFR-053-shared-ai-assistant-desktop | shared | /admin/agent | desktop 1448x1086 | Main assistant workspace or right-side assistant panel. | 总结当前页面 / 解释风险指标 / 生成下一步建议 | PAGE_SPECS/SCFR-053-shared-ai-assistant-desktop.md |
| SCFR-058-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作 | PAGE_SPECS/SCFR-058-mobile-ai-assistant-mobile.md |
| SCFR-060-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作 | PAGE_SPECS/SCFR-060-mobile-ai-assistant-mobile.md |
| SCFR-065-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作 | PAGE_SPECS/SCFR-065-mobile-ai-assistant-mobile.md |
| SCFR-076-director-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作 | PAGE_SPECS/SCFR-076-director-ai-assistant-mobile.md |
| SCFR-084-director-ai-assistant-desktop | director | /admin/agent | desktop 1448x1086 | Main assistant workspace or right-side assistant panel. | 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作 | PAGE_SPECS/SCFR-084-director-ai-assistant-desktop.md |
| SCFR-148-shared-ai-assistant-desktop | shared | /admin/agent | desktop 1448x1086 | Main assistant workspace or right-side assistant panel. | 总结当前页面 / 解释风险指标 / 生成下一步建议 | PAGE_SPECS/SCFR-148-shared-ai-assistant-desktop.md |
| SCFR-179-shared-ai-assistant-desktop | shared | /admin/agent | desktop 1448x1086 | Main assistant workspace or right-side assistant panel. | 总结当前页面 / 解释风险指标 / 生成下一步建议 | PAGE_SPECS/SCFR-179-shared-ai-assistant-desktop.md |
| SCFR-183-parent-ai-assistant-desktop | parent | /parent/agent?child=c-1 | desktop 1448x1086 | Main assistant workspace or right-side assistant panel. | 今晚我该怎么做 / 解释近 7 天趋势 / 提交完成后的反馈 | PAGE_SPECS/SCFR-183-parent-ai-assistant-desktop.md |
| SCFR-199-mobile-ai-assistant-mobile | director | /admin/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成本周运营周报 / 查看今日高风险儿童 / 给班级老师派发跟进动作 | PAGE_SPECS/SCFR-199-mobile-ai-assistant-mobile.md |
| SCFR-221-shared-ai-assistant-tablet-portrait | shared | /admin/agent | tablet/portrait 1086x1448 | Main assistant workspace or right-side assistant panel. | 总结当前页面 / 解释风险指标 / 生成下一步建议 | PAGE_SPECS/SCFR-221-shared-ai-assistant-tablet-portrait.md |
| SCFR-227-teacher-ai-assistant-tablet-portrait | teacher | /teacher/agent | tablet/portrait 1086x1448 | Main assistant workspace or right-side assistant panel. | 生成家园沟通建议 / 汇总班级今日重点 / 识别需要复查的儿童 | PAGE_SPECS/SCFR-227-teacher-ai-assistant-tablet-portrait.md |
| SCFR-228-teacher-ai-assistant-mobile | teacher | /teacher/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成家园沟通建议 / 汇总班级今日重点 / 识别需要复查的儿童 | PAGE_SPECS/SCFR-228-teacher-ai-assistant-mobile.md |
| SCFR-230-teacher-ai-assistant-tablet-portrait | teacher | /teacher/agent | tablet/portrait 1086x1448 | Main assistant workspace or right-side assistant panel. | 生成家园沟通建议 / 汇总班级今日重点 / 识别需要复查的儿童 | PAGE_SPECS/SCFR-230-teacher-ai-assistant-tablet-portrait.md |
| SCFR-235-teacher-ai-assistant-tablet-portrait | teacher | /teacher/agent | tablet/portrait 1086x1448 | Main assistant workspace or right-side assistant panel. | 生成家园沟通建议 / 汇总班级今日重点 / 识别需要复查的儿童 | PAGE_SPECS/SCFR-235-teacher-ai-assistant-tablet-portrait.md |
| SCFR-241-teacher-ai-assistant-mobile | teacher | /teacher/agent | mobile 941x1672 | Top summary card, floating assistant entry, or bottom-safe input area depending on design image. | 生成家园沟通建议 / 汇总班级今日重点 / 识别需要复查的儿童 | PAGE_SPECS/SCFR-241-teacher-ai-assistant-mobile.md |
