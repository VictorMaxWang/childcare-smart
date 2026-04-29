# Fix Thread Matrix

Updated: 2026-04-29

## Execution Order

1. F00 must run alone first.
2. After F00 completes, F10, F20, F30, F40, and F70 may run in parallel.
3. F50 runs after the parallel role/tooling threads finish.
4. F60 runs after F50.
5. F90 runs after all fix-result JSON files are available.
6. F99 runs after F90 has merged bug status.

## Must Be Serial

| Thread | Reason |
|---|---|
| F00 | Auth, route guards, and `next` handling affect every role. |
| F50 | Shared interaction fixes can touch common pages/components used by multiple roles. |
| F60 | CSS/assets/responsive cleanup can affect all role surfaces and should follow functional fixes. |
| F90 | Single writer for `BUGS.md`, `BUGS.json`, and status files. |
| F99 | Final regression must verify the merged state. |

## Parallel After F00

| Thread | Scope | Direct `BUGS.json` edits |
|---|---|---|
| F10 | Login regression and demo account checks | No |
| F20 | Director fixes | No |
| F30 | Teacher fixes | No |
| F40 | Parent fixes | No |
| F70 | Tooling/tests/TypeScript fixes | No |

## Fix Result Contract

- Each non-F90 thread writes `docs/bug-bash/fix-results/Fxx-result.md`.
- Each non-F90 thread writes `docs/bug-bash/fix-results/Fxx-result.json`.
- If a thread must edit public/shared files, it must list conflict risk in its result JSON.
- If a bug cannot be fixed, the result must include the reason, attempted evidence, and an alternative or follow-up recommendation.
- F90 is responsible for merging fixed/open/duplicate states into `BUGS.md` and `BUGS.json`.
