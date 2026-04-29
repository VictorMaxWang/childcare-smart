# Bug Status

Updated: 2026-04-29

## Summary

- Total bug records: 49
- Unique fix items after dedupe: 42
- Total release blocker records: 3
- Unresolved release blockers: 0
- Open: 0
- Confirmed: 0
- Fixed: 42
- Needs info: 0
- Duplicate: 7
- Wontfix: 0

## Unique Fix Items By Status

| Value | Count |
|---|---:|
| fixed | 42 |

## Unique Fix Items By Severity

| Value | Count |
|---|---:|
| P1 | 8 |
| P2 | 23 |
| P3 | 11 |

## Raw Records By Severity

| Value | Count |
|---|---:|
| P1 | 8 |
| P2 | 28 |
| P3 | 13 |

## Unique Fix Items By Role

| Value | Count |
|---|---:|
| director | 11 |
| guest | 1 |
| login | 1 |
| parent | 13 |
| shared | 6 |
| teacher | 10 |

## Raw Records By Thread

| Value | Count |
|---|---:|
| B10 | 4 |
| B11 | 6 |
| B12 | 2 |
| B13 | 5 |
| B14 | 1 |
| B15 | 5 |
| B20 | 2 |
| B21 | 5 |
| B22 | 7 |
| B23 | 3 |
| B24 | 3 |
| B25 | 3 |
| B26 | 3 |

## Duplicate Records

| Duplicate | Canonical |
|---|---|
| BUG-B12-002 | BUG-004 |
| BUG-017 | BUG-014 |
| BUG-018 | BUG-003 |
| BUG-B22-004 | BUG-B21-004 |
| BUG-B26-001 | BUG-001 |
| BUG-B26-002 | BUG-002 |
| BUG-B26-003 | BUG-003 |

## F99 Final Regression

- Date: 2026-04-29.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npx tsc --noEmit`: passed.
- `npm run test:parent-message-mapper`: passed, 4 tests passed.
- `BUGBASH_BASE_URL=http://127.0.0.1:3000 npm run bugbash:smoke`: passed, 0 issues.
- Browser Use: attempted but blocked by local Node v22.20.0; plugin requires >=22.22.0.
- Browser fallback: Playwright Chromium final regression passed, 136 checks, 0 failures.
- Small F99 fixes: parent suggestions request clone before JSON parsing; teacher high-priority list composite keys; explicit parent storybook `demoSeed` isolation.
- Final recommendation: release recommended; no open release blocker.

## Fixed Records By Thread

| Thread | Count | BugIds |
|---|---:|---|
| F00 | 5 | BUG-011, BUG-012, BUG-013, BUG-B23-001, BUG-B23-002 |
| F20 | 8 | BUG-001, BUG-B11-001, BUG-B11-002, BUG-B11-003, BUG-B11-005, BUG-B25-002, BUG-B21-003, BUG-B21-004 |
| F30 | 8 | BUG-B12-001, BUG-B25-001, BUG-B22-002, BUG-B22-005, BUG-B22-006, BUG-B22-007, BUG-B21-002, BUG-B21-005 |
| F40 | 9 | BUG-002, BUG-003, BUG-014, BUG-015, BUG-019, BUG-016, BUG-B23-003, BUG-B25-003, BUG-B21-001 |
| F50 | 3 | BUG-B11-006, BUG-B22-001, BUG-B22-003 |
| F60 | 7 | BUG-004, BUG-021, BUG-B11-004, BUG-020, BUG-B24-001, BUG-B24-002, BUG-B24-003 |
| F70 | 2 | BUG-B20-001, BUG-B20-002 |
