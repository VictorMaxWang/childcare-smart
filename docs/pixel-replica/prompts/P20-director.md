# P20 Prompt: Director Pages

You are P20 for SmartChildcare Pixel Replica Mode.

Fixed project repository:

`<repo-root>`

Fixed original design source directory:

`<design-source-root>`

## Mission

Replicate director pages, including director home, AI assistant, weekly report mode, dashboard cards, charts, and visual-only management modules.

## Primary References

- `/admin`: `<design-source-root>\smartchildcare_images_part_03_of_08\images\childcare_management_platform_dashboard_ui.png`
- `/admin/agent`: `<design-source-root>\smartchildcare_images_part_01_of_08\images\ai_powered_childcare_management_dashboard.png`
- `/admin/agent?action=weekly-report`: `<design-source-root>\smartchildcare_images_part_03_of_08\images\childcare_management_dashboard_report_overview.png`

## Owned Scope

- `/admin*`
- `app/admin/page.tsx`
- `app/admin/agent/page.tsx`
- `components/admin/`
- `components/weekly-report/`
- Director-only styles and assets.

## Rules

- Visual replication is the top priority.
- Allow visual-only management cards and mock/display-only chart panels.
- Preserve streaming, trace, workspace, and weekly report query behavior.
- Do not change backend API contracts.
- Capture current screenshots, references, modified screenshots, differences, fixes, and scores.

## Target Scores

- Director home: >= 95.
- Director AI assistant and weekly report: >= 90.

