# Frontend Replica Visual Diff Report

Generated: 2026-05-12T10:29:06.646Z

## Summary

- Design root: `C:\Users\12804\Desktop\childcare-smart源代码\前端重构`
- Current manifest: `artifacts/frontend-replica/current/manifest.json`
- Current screenshots: `artifacts/frontend-replica/current`
- Target screenshots: `artifacts/frontend-replica/targets`
- Diff screenshots: `artifacts/frontend-replica/diff`
- Compared pages: 247
- Skipped pages: 0
- Average visual closeness score: 76.95

## Priority Counts

| Priority | Count | Average | Worst |
| --- | --- | --- | --- |
| P0 | 131 | 79.67 | 23 |
| P1 | 61 | 75.7 | 6.13 |
| P2 | 55 | 71.88 | 16.57 |

## Viewport Counts

| Viewport | Count | Average | Worst |
| --- | --- | --- | --- |
| desktop | 109 | 76.13 | 6.13 |
| mobile | 87 | 74.86 | 35.76 |
| tablet | 51 | 82.29 | 65.04 |

## Route Counts

| Route | Count | Average | Worst |
| --- | --- | --- | --- |
| /admin | 75 | 66.86 | 6.13 |
| /children | 35 | 81.12 | 18.73 |
| /health | 22 | 88.58 | 83.6 |
| /admin/agent | 21 | 82.3 | 63.12 |
| /login | 18 | 69 | 23 |
| /parent/agent?child=c-1#feedback | 14 | 87.81 | 79.81 |
| /teacher | 12 | 84.2 | 71.61 |
| /admin/agent?action=weekly-report | 9 | 84.84 | 76.24 |
| /teacher/agent | 8 | 78.97 | 43.84 |
| /diet | 7 | 76.91 | 14.2 |
| /parent/storybook?child=c-1 | 7 | 71.97 | 67.78 |
| /growth | 5 | 84.9 | 79.52 |
| /parent?child=c-1 | 4 | 70.7 | 35.76 |
| /teacher/agent?action=communication | 4 | 84.63 | 81.63 |
| /parent/agent?child=c-1 | 3 | 82.73 | 77.57 |
| /teacher/health-file-bridge | 3 | 87.93 | 83.55 |

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

| ID | Route | Viewport | Priority | Score | Diff |
| --- | --- | --- | --- | --- | --- |
| SCFR-022-shared-dashboard-desktop | /admin | desktop | P1 | 6.13 | `artifacts/frontend-replica/diff/SCFR-022-shared-dashboard-desktop-diff.png` |
| SCFR-131-shared-dashboard-desktop | /admin | desktop | P1 | 7.87 | `artifacts/frontend-replica/diff/SCFR-131-shared-dashboard-desktop-diff.png` |
| SCFR-089-director-modal-state-desktop | /admin | desktop | P1 | 10.68 | `artifacts/frontend-replica/diff/SCFR-089-director-modal-state-desktop-diff.png` |
| SCFR-093-shared-dashboard-desktop | /diet | desktop | P1 | 14.2 | `artifacts/frontend-replica/diff/SCFR-093-shared-dashboard-desktop-diff.png` |
| SCFR-109-shared-dashboard-desktop | /admin | desktop | P2 | 16.57 | `artifacts/frontend-replica/diff/SCFR-109-shared-dashboard-desktop-diff.png` |
| SCFR-153-director-diet-meal-desktop | /children | desktop | P1 | 18.73 | `artifacts/frontend-replica/diff/SCFR-153-director-diet-meal-desktop-diff.png` |
| SCFR-035-director-diet-meal-desktop | /children | desktop | P1 | 21.02 | `artifacts/frontend-replica/diff/SCFR-035-director-diet-meal-desktop-diff.png` |
| SCFR-193-login-auth-login-desktop | /login | desktop | P0 | 23 | `artifacts/frontend-replica/diff/SCFR-193-login-auth-login-desktop-diff.png` |
| SCFR-129-login-auth-login-desktop | /login | desktop | P0 | 28.58 | `artifacts/frontend-replica/diff/SCFR-129-login-auth-login-desktop-diff.png` |
| SCFR-185-parent-dashboard-mobile | /parent?child=c-1 | mobile | P0 | 35.76 | `artifacts/frontend-replica/diff/SCFR-185-parent-dashboard-mobile-diff.png` |
| SCFR-201-mobile-dashboard-mobile | /admin | mobile | P2 | 36.56 | `artifacts/frontend-replica/diff/SCFR-201-mobile-dashboard-mobile-diff.png` |
| SCFR-100-shared-dashboard-desktop | /children | desktop | P1 | 37.27 | `artifacts/frontend-replica/diff/SCFR-100-shared-dashboard-desktop-diff.png` |
| SCFR-136-shared-diet-meal-desktop | /children | desktop | P1 | 38.84 | `artifacts/frontend-replica/diff/SCFR-136-shared-diet-meal-desktop-diff.png` |
| SCFR-028-mobile-dashboard-mobile | /admin | mobile | P2 | 41.11 | `artifacts/frontend-replica/diff/SCFR-028-mobile-dashboard-mobile-diff.png` |
| SCFR-096-mobile-dashboard-mobile | /admin | mobile | P2 | 43.04 | `artifacts/frontend-replica/diff/SCFR-096-mobile-dashboard-mobile-diff.png` |
| SCFR-228-teacher-ai-assistant-mobile | /teacher/agent | mobile | P0 | 43.84 | `artifacts/frontend-replica/diff/SCFR-228-teacher-ai-assistant-mobile-diff.png` |
| SCFR-130-director-modal-state-desktop | /admin | desktop | P1 | 50.79 | `artifacts/frontend-replica/diff/SCFR-130-director-modal-state-desktop-diff.png` |
| SCFR-128-login-auth-login-desktop | /login | desktop | P0 | 54.2 | `artifacts/frontend-replica/diff/SCFR-128-login-auth-login-desktop-diff.png` |
| SCFR-166-login-auth-login-desktop | /login | desktop | P0 | 54.72 | `artifacts/frontend-replica/diff/SCFR-166-login-auth-login-desktop-diff.png` |
| SCFR-078-director-dashboard-mobile | /admin | mobile | P0 | 54.93 | `artifacts/frontend-replica/diff/SCFR-078-director-dashboard-mobile-diff.png` |
| SCFR-191-mobile-modal-state-mobile | /admin | mobile | P1 | 55.5 | `artifacts/frontend-replica/diff/SCFR-191-mobile-modal-state-mobile-diff.png` |
| SCFR-170-mobile-dashboard-mobile | /admin | mobile | P2 | 55.91 | `artifacts/frontend-replica/diff/SCFR-170-mobile-dashboard-mobile-diff.png` |
| SCFR-111-mobile-dashboard-mobile | /admin | mobile | P2 | 57.03 | `artifacts/frontend-replica/diff/SCFR-111-mobile-dashboard-mobile-diff.png` |
| SCFR-190-mobile-modal-state-mobile | /admin | mobile | P1 | 57.82 | `artifacts/frontend-replica/diff/SCFR-190-mobile-modal-state-mobile-diff.png` |
| SCFR-167-login-auth-login-desktop | /login | desktop | P0 | 58.14 | `artifacts/frontend-replica/diff/SCFR-167-login-auth-login-desktop-diff.png` |
| SCFR-162-login-auth-login-desktop | /login | desktop | P0 | 59.6 | `artifacts/frontend-replica/diff/SCFR-162-login-auth-login-desktop-diff.png` |
| SCFR-192-mobile-dashboard-mobile | /admin | mobile | P2 | 59.77 | `artifacts/frontend-replica/diff/SCFR-192-mobile-dashboard-mobile-diff.png` |
| SCFR-027-mobile-modal-state-mobile | /admin | mobile | P1 | 60.24 | `artifacts/frontend-replica/diff/SCFR-027-mobile-modal-state-mobile-diff.png` |
| SCFR-054-mobile-dashboard-mobile | /admin | mobile | P2 | 60.31 | `artifacts/frontend-replica/diff/SCFR-054-mobile-dashboard-mobile-diff.png` |
| SCFR-077-director-dashboard-mobile | /admin | mobile | P0 | 60.54 | `artifacts/frontend-replica/diff/SCFR-077-director-dashboard-mobile-diff.png` |

## Skipped

- None.

