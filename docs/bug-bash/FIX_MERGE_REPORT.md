# F90 Fix Merge Report

Updated: 2026-04-29

## Read Result Files

- docs/bug-bash/fix-results/F00-result.json
- docs/bug-bash/fix-results/F00-result.md
- docs/bug-bash/fix-results/F10-result.json
- docs/bug-bash/fix-results/F10-result.md
- docs/bug-bash/fix-results/F20-result.json
- docs/bug-bash/fix-results/F20-result.md
- docs/bug-bash/fix-results/F30-result.json
- docs/bug-bash/fix-results/F30-result.md
- docs/bug-bash/fix-results/F40-result.json
- docs/bug-bash/fix-results/F40-result.md
- docs/bug-bash/fix-results/F50-result.json
- docs/bug-bash/fix-results/F50-result.md
- docs/bug-bash/fix-results/F60-result.json
- docs/bug-bash/fix-results/F60-result.md
- docs/bug-bash/fix-results/F70-result.json
- docs/bug-bash/fix-results/F70-result.md

## Merge Summary

- Successfully merged fixed bugs: 42
- Failed merges: 0
- Duplicate records retained: 7
- Open records remaining: 0
- Needs-info records remaining: 0

## Fixed Bugs

- F00: BUG-011, BUG-012, BUG-013, BUG-B23-001, BUG-B23-002
- F20: BUG-001, BUG-B11-001, BUG-B11-002, BUG-B11-003, BUG-B11-005, BUG-B25-002, BUG-B21-003, BUG-B21-004
- F30: BUG-B12-001, BUG-B25-001, BUG-B22-002, BUG-B22-005, BUG-B22-006, BUG-B22-007, BUG-B21-002, BUG-B21-005
- F40: BUG-002, BUG-003, BUG-014, BUG-015, BUG-019, BUG-016, BUG-B23-003, BUG-B25-003, BUG-B21-001
- F50: BUG-B11-006, BUG-B22-001, BUG-B22-003
- F60: BUG-004, BUG-021, BUG-B11-004, BUG-020, BUG-B24-001, BUG-B24-002, BUG-B24-003
- F70: BUG-B20-001, BUG-B20-002

## Open Bugs

- none

## Needs Info Bugs

- none

## Duplicate Bugs

- BUG-B12-002 -> BUG-004
- BUG-017 -> BUG-014
- BUG-018 -> BUG-003
- BUG-B22-004 -> BUG-B21-004
- BUG-B26-001 -> BUG-001
- BUG-B26-002 -> BUG-002
- BUG-B26-003 -> BUG-003

## JSON Validation

- BUGS.json parseable: passed
- bugId unique: passed
- duplicateOf valid: passed
- fixed records have fixSummary: passed

## Check Results

- JSON validation command: passed
- npm run lint: passed
- npm run build: passed

## Notes

- F00 out-of-scope statuses for BUG-001, BUG-002, and BUG-003 were not allowed to override later fixed results from F20/F40.
- No bug records were deleted or duplicated.
