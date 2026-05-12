# Frontend Replica Visual Diff Report

Generated: 2026-05-12T12:01:48.905Z

## Summary

- Design root: `C:\Users\12804\Desktop\childcare-smart源代码\前端重构`
- Current manifest: `artifacts/frontend-replica/current/manifest.json`
- Current screenshots: `artifacts/frontend-replica/current`
- Target screenshots: `artifacts/frontend-replica/targets`
- Diff screenshots: `artifacts/frontend-replica/diff`
- Compared pages: 247
- Skipped pages: 0
- Average visual closeness score: 77.5

## Priority Counts

| Priority | Count | Average | Worst |
| --- | --- | --- | --- |
| P0 | 131 | 79.9 | 28.58 |
| P1 | 61 | 77.56 | 9.23 |
| P2 | 55 | 71.74 | 16.62 |

## Viewport Counts

| Viewport | Count | Average | Worst |
| --- | --- | --- | --- |
| desktop | 109 | 77.12 | 9.23 |
| mobile | 87 | 75.19 | 39.31 |
| tablet | 51 | 82.28 | 65.04 |

## Route Counts

| Route | Count | Average | Worst |
| --- | --- | --- | --- |
| /admin | 75 | 68.24 | 9.23 |
| /children | 35 | 80.51 | 13.87 |
| /health | 22 | 88.74 | 83.85 |
| /admin/agent | 21 | 82.13 | 62.99 |
| /login | 18 | 70.22 | 28.58 |
| /parent/agent?child=c-1#feedback | 14 | 88.5 | 84.58 |
| /teacher | 12 | 84.89 | 72.86 |
| /admin/agent?action=weekly-report | 9 | 84.79 | 76.22 |
| /teacher/agent | 8 | 79.17 | 45.85 |
| /diet | 7 | 77.26 | 14.44 |
| /parent/storybook?child=c-1 | 7 | 72.02 | 67.78 |
| /growth | 5 | 85.02 | 79.52 |
| /parent?child=c-1 | 4 | 72.09 | 41.09 |
| /teacher/agent?action=communication | 4 | 84.79 | 82.05 |
| /parent/agent?child=c-1 | 3 | 83.18 | 78.12 |
| /teacher/health-file-bridge | 3 | 88.37 | 84.87 |

## Visual Effective Route Counts

| Effective Route | Count | Average | Worst |
| --- | --- | --- | --- |
| /admin | 71 | 69.32 | 16.62 |
| /children | 29 | 82.52 | 9.23 |
| /health | 22 | 88.74 | 83.85 |
| /admin/agent | 21 | 82.13 | 62.99 |
| /login | 18 | 70.22 | 28.58 |
| /diet | 17 | 68.39 | 13.87 |
| /parent/agent?child=c-1#feedback | 14 | 88.5 | 84.58 |
| /teacher | 14 | 80.86 | 45.85 |
| /admin/agent?action=weekly-report | 9 | 84.79 | 76.22 |
| /parent/storybook?child=c-1 | 7 | 72.02 | 67.78 |
| /teacher/agent | 6 | 86.67 | 81.76 |
| /growth | 5 | 85.02 | 79.52 |
| /parent?child=c-1 | 4 | 72.09 | 41.09 |
| /teacher/agent?action=communication | 4 | 84.79 | 82.05 |
| /parent/agent?child=c-1 | 3 | 83.18 | 78.12 |
| /teacher/health-file-bridge | 3 | 88.37 | 84.87 |

## State-Corrected vs UI-Difference

| Difference Type | Count | Average | Worst |
| --- | --- | --- | --- |
| ui-difference | 224 | 79.61 | 14.44 |
| state-corrected | 20 | 55.84 | 9.23 |
| accepted-business-difference | 3 | 65.07 | 54.59 |

## Visual Repair Priority

- Layout structure: inspect the lowest-scoring P0 route groups first, especially pages where shell/sidebar/topbar geometry differs.
- Spacing: prioritize repeated route/viewport groups with medium scores after layout fixes.
- Color: use target palette from PAGE_SPECS and adjust shared tokens before page-specific colors.
- Typography: keep fixed responsive sizes and avoid viewport-width scaling.
- Cards: tune shared radius, border, and shadow tokens before editing individual cards.
- Charts: compare chart-card density, grid lines, legends, and tooltip affordances.
- AI assistant panel: compare prompt chips, conversation column, status badge, input bar, and right insight panels.
- Mobile: check bottom nav, voice entry, sticky inputs, and first-viewport content clipping.

## Worst Comparisons

| ID | Route | Effective Route | Viewport | Type | Priority | Score | Diff |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SCFR-022-shared-dashboard-desktop | /admin | /children | desktop | state-corrected | P1 | 9.23 | `artifacts/frontend-replica/diff/SCFR-022-shared-dashboard-desktop-diff.png` |
| SCFR-089-director-modal-state-desktop | /admin | /children | desktop | state-corrected | P1 | 9.36 | `artifacts/frontend-replica/diff/SCFR-089-director-modal-state-desktop-diff.png` |
| SCFR-136-shared-diet-meal-desktop | /children | /diet | desktop | state-corrected | P1 | 13.87 | `artifacts/frontend-replica/diff/SCFR-136-shared-diet-meal-desktop-diff.png` |
| SCFR-093-shared-dashboard-desktop | /diet | /diet | desktop | ui-difference | P1 | 14.44 | `artifacts/frontend-replica/diff/SCFR-093-shared-dashboard-desktop-diff.png` |
| SCFR-109-shared-dashboard-desktop | /admin | /admin | desktop | ui-difference | P2 | 16.62 | `artifacts/frontend-replica/diff/SCFR-109-shared-dashboard-desktop-diff.png` |
| SCFR-035-director-diet-meal-desktop | /children | /diet | desktop | state-corrected | P1 | 20.25 | `artifacts/frontend-replica/diff/SCFR-035-director-diet-meal-desktop-diff.png` |
| SCFR-153-director-diet-meal-desktop | /children | /diet | desktop | state-corrected | P1 | 21.73 | `artifacts/frontend-replica/diff/SCFR-153-director-diet-meal-desktop-diff.png` |
| SCFR-129-login-auth-login-desktop | /login | /login | desktop | ui-difference | P0 | 28.58 | `artifacts/frontend-replica/diff/SCFR-129-login-auth-login-desktop-diff.png` |
| SCFR-193-login-auth-login-desktop | /login | /login | desktop | state-corrected | P0 | 29.45 | `artifacts/frontend-replica/diff/SCFR-193-login-auth-login-desktop-diff.png` |
| SCFR-100-shared-dashboard-desktop | /children | /diet | desktop | state-corrected | P1 | 30.67 | `artifacts/frontend-replica/diff/SCFR-100-shared-dashboard-desktop-diff.png` |
| SCFR-201-mobile-dashboard-mobile | /admin | /admin | mobile | state-corrected | P2 | 39.31 | `artifacts/frontend-replica/diff/SCFR-201-mobile-dashboard-mobile-diff.png` |
| SCFR-028-mobile-dashboard-mobile | /admin | /admin | mobile | ui-difference | P2 | 40.55 | `artifacts/frontend-replica/diff/SCFR-028-mobile-dashboard-mobile-diff.png` |
| SCFR-185-parent-dashboard-mobile | /parent?child=c-1 | /parent?child=c-1 | mobile | state-corrected | P0 | 41.09 | `artifacts/frontend-replica/diff/SCFR-185-parent-dashboard-mobile-diff.png` |
| SCFR-096-mobile-dashboard-mobile | /admin | /admin | mobile | ui-difference | P2 | 42.39 | `artifacts/frontend-replica/diff/SCFR-096-mobile-dashboard-mobile-diff.png` |
| SCFR-228-teacher-ai-assistant-mobile | /teacher/agent | /teacher | mobile | state-corrected | P0 | 45.85 | `artifacts/frontend-replica/diff/SCFR-228-teacher-ai-assistant-mobile-diff.png` |
| SCFR-078-director-dashboard-mobile | /admin | /admin | mobile | ui-difference | P0 | 53.78 | `artifacts/frontend-replica/diff/SCFR-078-director-dashboard-mobile-diff.png` |
| SCFR-128-login-auth-login-desktop | /login | /login | desktop | ui-difference | P0 | 54.2 | `artifacts/frontend-replica/diff/SCFR-128-login-auth-login-desktop-diff.png` |
| SCFR-191-mobile-modal-state-mobile | /admin | /admin | mobile | accepted-business-difference | P1 | 54.59 | `artifacts/frontend-replica/diff/SCFR-191-mobile-modal-state-mobile-diff.png` |
| SCFR-166-login-auth-login-desktop | /login | /login | desktop | ui-difference | P0 | 54.72 | `artifacts/frontend-replica/diff/SCFR-166-login-auth-login-desktop-diff.png` |
| SCFR-170-mobile-dashboard-mobile | /admin | /admin | mobile | ui-difference | P2 | 55 | `artifacts/frontend-replica/diff/SCFR-170-mobile-dashboard-mobile-diff.png` |
| SCFR-111-mobile-dashboard-mobile | /admin | /admin | mobile | ui-difference | P2 | 55.82 | `artifacts/frontend-replica/diff/SCFR-111-mobile-dashboard-mobile-diff.png` |
| SCFR-190-mobile-modal-state-mobile | /admin | /admin | mobile | accepted-business-difference | P1 | 56.76 | `artifacts/frontend-replica/diff/SCFR-190-mobile-modal-state-mobile-diff.png` |
| SCFR-167-login-auth-login-desktop | /login | /login | desktop | ui-difference | P0 | 58.14 | `artifacts/frontend-replica/diff/SCFR-167-login-auth-login-desktop-diff.png` |
| SCFR-192-mobile-dashboard-mobile | /admin | /admin | mobile | ui-difference | P2 | 58.86 | `artifacts/frontend-replica/diff/SCFR-192-mobile-dashboard-mobile-diff.png` |
| SCFR-027-mobile-modal-state-mobile | /admin | /admin | mobile | ui-difference | P1 | 59.16 | `artifacts/frontend-replica/diff/SCFR-027-mobile-modal-state-mobile-diff.png` |
| SCFR-054-mobile-dashboard-mobile | /admin | /admin | mobile | ui-difference | P2 | 59.26 | `artifacts/frontend-replica/diff/SCFR-054-mobile-dashboard-mobile-diff.png` |
| SCFR-077-director-dashboard-mobile | /admin | /admin | mobile | ui-difference | P0 | 59.42 | `artifacts/frontend-replica/diff/SCFR-077-director-dashboard-mobile-diff.png` |
| SCFR-151-mobile-dashboard-mobile | /admin | /admin | mobile | ui-difference | P2 | 60.36 | `artifacts/frontend-replica/diff/SCFR-151-mobile-dashboard-mobile-diff.png` |
| SCFR-055-mobile-dashboard-mobile | /admin | /admin | mobile | ui-difference | P2 | 60.41 | `artifacts/frontend-replica/diff/SCFR-055-mobile-dashboard-mobile-diff.png` |
| SCFR-017-mobile-dashboard-mobile | /admin | /admin | mobile | ui-difference | P2 | 61.85 | `artifacts/frontend-replica/diff/SCFR-017-mobile-dashboard-mobile-diff.png` |

## Skipped

- None.

