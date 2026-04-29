# Bug Triage Rules

Updated: 2026-04-29

## Severity

- P0: project cannot start, `npm run build` fails, login is unusable, the main app is blank, or all demo accounts are unusable.
- P1: a main role path is unusable, core navigation is unusable, a route/auth/permission boundary is seriously wrong, or a major form cannot open/close.
- P2: an important page is partially broken, a visible action is misleading/no-op, visual-only/mock behavior affects user trust, mobile layout blocks important content, or normal use emits obvious console/network errors.
- P3: secondary interaction issues, minor responsive issues, copy/status/empty-data inconsistency, or non-blocking visual mismatch.
- P4: pure polish such as spacing, radius, icon, or low-risk cosmetic issues.

## Status

- `open`: reported by scan with enough evidence for assignment, but not independently reproduced.
- `confirmed`: reproduced by browser/tooling evidence or supported by strong static evidence.
- `duplicate`: same root cause as another canonical bug; keep the record and evidence, but do not assign as an independent fix item.
- `fixed`: fix verified by the owning F thread and accepted by F90 merge.
- `wontfix`: intentionally accepted or out of scope with rationale.
- `needs-info`: missing reproduction steps, evidence, route, or suspected source.

## Duplicate Rules

- Prefer one canonical fix item per root cause when evidence is clear.
- Preserve duplicate records in `BUGS.md` and `BUGS.json`; do not delete B26 confirmations.
- Duplicate relationship is recorded in `notes` using `Duplicate of BUG-...`.
- Current B99 duplicate set: `BUG-B12-002 -> BUG-004`, `BUG-017 -> BUG-014/BUG-015`, `BUG-018 -> BUG-003`, `BUG-B22-004 -> BUG-B21-004`, `BUG-B26-001 -> BUG-001`, `BUG-B26-002 -> BUG-002`, `BUG-B26-003 -> BUG-003`.

## Fix Result Rules

- Fix threads must not update `BUGS.md` or `BUGS.json` directly, except F90.
- Each fix thread writes `docs/bug-bash/fix-results/Fxx-result.md` and `docs/bug-bash/fix-results/Fxx-result.json`.
- Result JSON must include `threadId`, `bugIds`, `statusByBugId`, `changedFiles`, `checksRun`, `browserOrPlaywrightEvidence`, `unfixedReasons`, and `conflictRisks`.
- F90 is the only thread that merges fix results into `BUGS.md`, `BUGS.json`, `BUG_STATUS.md`, and duplicate/fixed/open statuses.

## B99 Assignment Rules

- P1 permission and `/login?next=...`越权 issues go to F00 and must be fixed before parallel role threads.
- P2 visual-only/mock persistence risks go to the owning role thread.
- B20/B26 tooling, test alias, TypeScript drift, smoke-server lock, and `BUGBASH_BASE_URL` behavior go to F70.
- B24 asset/responsive/path hygiene issues go to F60.
- Browser Use coverage B10-B15 exists; several runs used Playwright fallback because Browser Use node_repl required Node >= 22.22.0 while local Node was 22.20.0.
