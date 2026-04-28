# Pixel Replica Task Status

Updated: 2026-04-28

| Task | Name | Execution Mode | Status | Owner | Notes |
|---|---|---|---|---|---|
| P00 | Master control, docs, design source index | Serial | Completed | Main thread | Created pixel-replica control plan and indexes. |
| P01 | Design asset cropping and screenshot diff tools | Serial | Completed | Main thread | Created `public/pixel-replica/`, copied references, generated crop manifest, captured current screenshots, generated diff reports, and passed lint/build. |
| P02 | Global shell, navigation, and core visual frame | Serial | Completed | Shell thread | Reworked AppShell, role navigation modes, mobile drawer/bottom tabs, page frame, and tablet behavior. After screenshots and compare completed; page-level scores still include unrefactored P10/P20/P30/P40 body content. |
| P10 | Login page | Parallel after P02 | Completed | Login thread | Rebuilt `/login` desktop/mobile against original login references, preserved login/register/password-toggle/demo-account flows, captured after screenshots, and recorded manual scores desktop 95 / mobile 90. Standard `pixel:compare` still reports lower login scores because references are cover-center resized and mobile uses the desktop reference; change request recorded. |
| P20 | Director pages | Parallel after P02 | Completed | Director thread | Rebuilt `/admin`, `/admin/agent`, and `/admin/agent?action=weekly-report` with P20-only replica components; preserved AI workflow, weekly-report generation, notification dispatch, role access, and recorded P20 screenshots/scores. |
| P30 | Teacher pages | Parallel after P02 | Completed | Teacher thread | Reworked `/teacher*` teacher workbench, AI assistant, communication mode, health parsing, and high-risk consultation against original `前端重构` references; P30 screenshots captured in `artifacts/pixel-replica/after-p30/`. Final `npm run lint`, `npm run build`, `npm run pixel:capture`, and `npm run pixel:compare` passed. |
| P40 | Parent pages | Parallel after P02 | Completed | Parent thread | Rebuilt `/parent`, `/parent/agent`, feedback anchor, `/parent/storybook`, and mobile parent home against original `前端重构` references. Manual scores: home 95, AI/feedback 91, storybook 90, mobile 91. Final lint/build/capture/compare passed; global compare parent-home desktop 87.96 and mobile 77.57 because it includes shared shell and P01 reference crop behavior. |
| P50 | Shared business pages, tables, forms, dialogs, states | Serial closeout | Pending | Shared thread | Runs after P10/P20/P30/P40 converge. |
| P99 | Final merge, visual QA, screenshot comparison | Serial closeout | Pending | QA thread | Runs last; records final scores and unresolved gaps. |

## Completion Rule

A task is not complete until it records current screenshot, reference image, modified screenshot, visual score, differences, fixes, and remaining gaps.
