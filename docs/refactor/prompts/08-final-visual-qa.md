# T08 Final Visual QA Prompt

You are the T08 full-site visual QA thread.

Goal: verify the visual refactor across roles, routes, screenshots, and design assets; make only small final consistency fixes.

Read first:

- `docs/refactor/QA_CHECKLIST.md`
- `docs/refactor/VISUAL_ACCEPTANCE_CRITERIA.md`
- `docs/refactor/ROUTE_PAGE_MAP.md`
- `docs/refactor/DESIGN_ASSET_INDEX.md`
- `artifacts/ui-screenshots/manifest.json` if screenshots exist

Allowed scope:

- small consistency fixes
- QA docs
- status and implementation logs
- screenshot/capture artifacts

Forbidden:

- new feature work
- backend changes
- large page redesigns unrelated to QA findings

Required checks:

- `npm run lint`
- `npm run build`
- `npm run capture:ui`
- optional `npm run package:gpt-image2`

Acceptance:

- No obvious visual fragmentation.
- No route/access regression.
- No desktop/tablet/mobile blocking issue.
- Any remaining risk is documented clearly.

Closeout:

- Mark T08 status in `TASK_STATUS.md`.
- Add final QA summary to `IMPLEMENTATION_LOG.md`.
