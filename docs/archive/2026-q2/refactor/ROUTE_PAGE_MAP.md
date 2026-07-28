# Route Page Map

| route | pageName | currentFileCandidates | role | currentStatus | targetDesignRefs | refactorTaskId | notes |
|---|---|---|---|---|---|---|---|
| `/login` | Login page and demo entry | `app/login/page.tsx` | login | implemented | login, registration | T02 | Preserve normal login, registration dialog, password visibility toggles, and demo account cards. |
| `/auth/login` | Legacy login redirect | `app/auth/login/page.tsx` | login | implemented redirect | login | T02 | Must continue redirecting to `/login`. |
| `/` | Director overview / data overview | `app/page.tsx` | director | implemented | dashboard, weekly-report, chart | T04 | Redirects unauthenticated users to `/login`; parent users redirect to `/parent`. |
| `/admin` | Director home | `app/admin/page.tsx`, `components/admin/*`, `components/weekly-report/*` | director | implemented | director, dashboard, weekly-report, ai-assistant | T04 | Institution priority, risk board, weekly preview, AI entry. |
| `/admin/agent` | Director AI assistant | `app/admin/agent/page.tsx`, `components/admin/*`, `components/consultation/*` | director | implemented | ai-assistant, dashboard, chart | T04 | Preserve streaming/trace/workspace behavior. |
| `/admin/agent?action=weekly-report` | Director weekly report mode | `app/admin/agent/page.tsx` | director | implemented via query | weekly-report | T04 | Query mode must remain functional. |
| `/children` | Child records | `app/children/page.tsx` | shared | implemented | list, table, form, detail | T04/T05 | Used by director, teacher, and parent with role-filtered data; T05 adds teacher-only roster shortcuts without changing permissions. |
| `/health` | Morning check and health records | `app/health/page.tsx` | shared | implemented | health, form, table | T04/T05 | Role visibility comes from current app state; T05 adds teacher-only morning-check queue and quick follow-up entries. |
| `/growth` | Growth records | `app/growth/page.tsx` | shared | implemented | growth, list, form | T04/T05 | Preserve review status and observation fields; T05 adds teacher-only observation context and review focus. |
| `/diet` | Diet records and meal tracking | `app/diet/page.tsx` | shared | implemented | diet, list, modal, form | T04/T05 | Preserve image upload/OCR/vision meal flows; T05 adds teacher-only meal coverage and batch guidance. |
| `/teacher` | Teacher workbench | `app/teacher/page.tsx`, `components/teacher/TeacherWorkbenchPage.tsx` | teacher | implemented | teacher, dashboard, mobile | T05 | Main teacher landing page. |
| `/teacher/home` | Teacher workbench alias | `app/teacher/home/page.tsx`, `components/teacher/TeacherWorkbenchPage.tsx` | teacher | implemented | teacher, dashboard | T05 | Alias must remain. |
| `/teacher/agent` | Teacher AI assistant | `app/teacher/agent/page.tsx`, `components/teacher/*` | teacher | implemented | teacher, ai-assistant, form | T05 | Preserve draft confirmation, reminder, and voice-understand flows. |
| `/teacher/agent?action=communication` | Teacher communication mode | `app/teacher/agent/page.tsx` | teacher | implemented via query | feedback, ai-assistant | T05 | Used by visual capture workflow. |
| `/teacher/health-file-bridge` | Health material parsing | `app/teacher/health-file-bridge/page.tsx` | teacher | implemented | health, form, ai-assistant | T05 | Preserve file/material parsing data flow. |
| `/teacher/high-risk-consultation` | High-risk consultation | `app/teacher/high-risk-consultation/page.tsx`, `components/consultation/*` | teacher | implemented | health, ai-assistant, detail | T05 | Main competition/demo path; do not break trace and consultation cards. |
| `/teacher/high-risk-consultation?trace=debug` | Consultation debug trace | `app/teacher/high-risk-consultation/page.tsx` | teacher | implemented via query | detail, chart | T05 | Used by screenshot workflow. |
| `/parent` | Parent home | `app/parent/page.tsx`, `components/parent/*` | parent | implemented | parent, dashboard, feedback, mobile | T06 | Parent default landing page. |
| `/parent?child=c-1` | Parent child overview | `app/parent/page.tsx` | parent | implemented via query | parent, mobile | T06 | Preserve child query behavior. |
| `/parent/agent?child=c-1` | Parent AI assistant | `app/parent/agent/page.tsx`, `components/parent/*` | parent | implemented | parent, ai-assistant, feedback | T06 | Preserve interventions, trend QA, and feedback composer. |
| `/parent/agent?child=c-1#feedback` | Parent feedback section | `app/parent/agent/page.tsx`, `components/parent/ParentStructuredFeedbackComposer.tsx` | parent | implemented via hash | feedback, form | T06 | Feedback anchor must remain usable. |
| `/parent/storybook?child=c-1` | Growth storybook | `app/parent/storybook/page.tsx`, `components/parent/StoryBookViewer.tsx` | parent | implemented | storybook, mobile | T06 | Interactive viewer; production UI must not become static images. |
| `app/layout.tsx` | Global layout wrapper | `app/layout.tsx`, `components/Navbar.tsx` | shared | implemented shell | navigation, app-shell | T03 | Wraps non-login routes with logged-in AppShell; route mapping did not change. |
| `components/Navbar.tsx` | Logged-in AppShell / desktop sidebar and topbar | `components/Navbar.tsx`, `lib/navigation/primary-nav.ts` | shared | implemented shell | sidebar, navigation, dashboard | T03 | Default export remains imported by layout as AppShell; role menu availability still comes from `buildPrimaryNavItems`. |
| `components/role-shell/RoleScaffold.tsx` | Shared role page container and PageHeader | `components/role-shell/RoleScaffold.tsx`, `components/ui/page-header.tsx` | shared | implemented shell | dashboard, app-shell | T03 | Existing role pages keep the same props and business content; container now uses `.app-page` and shared PageHeader. |
| `app/error.tsx` | Global error state | `app/error.tsx` | shared | implemented | error, permission | T07 | Preserve reset behavior. |
| `app/loading.tsx` | Global loading state | `app/loading.tsx` | shared | implemented | shared state | T07 | Normalize with design system. |
| `components/EmptyState.tsx` | Shared empty state | `components/EmptyState.tsx` | shared | implemented | empty, shared state | T07 | Used across lists and role pages. |
| `components/ui/dialog.tsx` | Dialog / confirmation base | `components/ui/dialog.tsx` | shared | implemented | modal, confirmation | T07 | Radix primitive; preserve accessibility. |
| `components/MobileNav.tsx` | Mobile drawer navigation | `components/MobileNav.tsx`, `lib/navigation/primary-nav.ts` | shared | implemented shell | mobile, navigation | T03 | Tablet/mobile grouped drawer; focus trap, Escape close, and body scroll lock remain. |
