# Bug Triage Rules

Updated: 2026-04-29

## Severity

### P0

- Project cannot start.
- `npm run build` fails.
- Login is unusable.
- Main app is blank.
- All four demo accounts are unusable.

### P1

- A main path for one role is unusable.
- Director, teacher, or parent home is blank or severely broken.
- Core navigation is unusable.
- Route permission or auth behavior is seriously wrong.
- A major form cannot open or cannot close.

### P2

- An important page is partially broken.
- A button appears usable but click does nothing.
- A visual-only fake feature is not labeled and misleads the user.
- Mobile layout blocks important content.
- Obvious console error appears during normal use.

### P3

- Secondary interaction issue.
- Minor responsive issue.
- Copy, status, or empty data inconsistency.
- Visual misalignment that does not block the flow.

### P4

- Pure visual polish.
- Small spacing, radius, or icon issue.

## Status

- `open`: reported but not yet independently confirmed.
- `confirmed`: reproduced or supported by strong evidence.
- `duplicate`: same root issue as another bug.
- `fixed`: fix verified after B99 assigns fix work.
- `wontfix`: intentionally accepted or out of scope.
- `needs-info`: missing reproduction steps or evidence.

## Triage Rules

- Prefer one bug per root cause when evidence is clear.
- If the same root cause appears across roles or viewports, keep one parent bug and mention affected routes in `notes`.
- If user impact differs by role, split the bug by role.
- A Browser Use report must include reproduction steps and should include screenshot evidence for P0-P2.
- A code scanning report must include suspected source files and a likely cause when possible.
- Do not downgrade a bug because it is visually caused by Pixel Replica Mode; severity is based on user impact.
- `blocksRelease` should be `true` for all P0 and most P1 bugs.
- B99 owns final deduplication, severity adjustment, and fix ordering.

