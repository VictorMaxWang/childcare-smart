# Bug Fix Plan

Updated: 2026-04-29

B00 initializes this file only. Do not add fix assignments until B99 finishes triage.

## Current Status

- Discovery round: not started.
- Triage round: not started.
- Fix round: blocked until B99.

## B99 Output Expected

B99 must update this file with:

- Deduplicated release-blocking bugs.
- Fix priority order by severity and user impact.
- Module ownership.
- Files likely to be edited.
- Threads that can fix in parallel.
- Threads that must be serialized to avoid editing the same business files.
- Verification commands and Browser Use retest scope.

## Fix Rules After B99

- Do not fix unrelated issues opportunistically.
- Keep fixes scoped to the bug and owning module.
- Do not let two fix threads edit the same source file in parallel.
- Every fixed bug must update both `BUGS.md` and `BUGS.json`.
- Every fixed P0-P2 bug needs verification evidence.

