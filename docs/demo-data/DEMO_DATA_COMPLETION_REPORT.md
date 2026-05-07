# D-SEED Demo Data Completion Report

## Scope

- Login page normal username/password inputs are empty by default.
- Demo account quick buttons remain available and do not expose passwords.
- Director, teacher, parent demo data now share the same deterministic D-SEED snapshot.
- The front-end D01 local demo store and Next API repository both use `createDemoSeedSnapshot()`.
- Storybooks are pre-generated and restore from saved seed before live API generation.
- Demo media uses local safe placeholders until GPT Image 2 synthetic assets are supplied.

## Login Cleanup

- Username initial state: empty string.
- Password initial state: empty string.
- Password visibility initial state: hidden.
- Demo account buttons: retained with `data-testid="demo-account-..."`.

## Core Counts

- Director visible children: 36.
- 李老师 / `u-teacher`: 18 children in `class-sunrise` / 向阳班.
- 周老师 / `u-teacher2`: 18 children in `class-morning` / 晨曦班.
- Teacher total: 36.
- 林妈妈 / `u-parent`: authorized children `c-1` and `c-4`.

## Data Coverage

- Children: 36.
- Growth records: 216.
- Meal records: 1008.
- Morning health checks: 252.
- Health materials: 36.
- Director assignments: 24.
- Weekly reports: 4.
- Home-school messages: 22.
- Conversations: 12.
- Daily reminders: 132.
- Nutrition menus: 56.
- High-risk consultations: 6.
- Storybooks: 36.

## Media

- Current committed media are SVG placeholders only.
- No network images were downloaded.
- No real child photos or sensitive records were introduced.
- Health material placeholder contains `DEMO / 示例`.
- GPT Image 2 prompt pack is available at `docs/demo-media/GPT_IMAGE2_ASSET_PROMPTS.md`.

## Tests

- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run product:smoke`: passed.
- `npm run product:api`: passed.
- `npm run product:ai`: passed.
- `npm run product:voice`: passed.
- `npm run product:journey`: passed.
- `npm run feature:smoke`: passed.
- `npm run bugbash:smoke`: passed.
- `npx tsc --noEmit`: passed.
- `npm run test:demo-data-consistency`: passed.

The Playwright web server logs include expected local brain service fallback noise when `127.0.0.1:8000/8010` is unavailable; the tests completed successfully through the existing fallback paths.

## Git Status

- Commit message: `stabilize demo accounts and seed data`.
- Push target: `origin main`.
- Final commit hash and push result are recorded in the assistant final response after the safety scan and Git operation complete.
