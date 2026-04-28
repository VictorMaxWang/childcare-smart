# Visual-Only Rules

Visual-only modules are allowed when the design image contains a module that the current product does not fully implement.

## Allowed

- Static visual cards.
- Mock/display-only charts.
- Mock/display-only assistant summaries.
- Decorative status panels.
- Placeholder modules labeled internally as visual-only.
- Local frontend state for visual toggles and expanded/collapsed states.

## Required Behavior

- Visual-only modules must not call backend APIs.
- Visual-only modules must not mutate real state.
- Visual-only modules must not submit, send, upload, delete, or archive anything.
- Dangerous-looking actions must be disabled, clearly harmless, or wired only to local UI state.
- Real business entry points must remain available.

## Labeling

Code comments may mark visual-only blocks when helpful:

`// visual-only: design replica placeholder; no backend side effect`

Use comments sparingly and only where they prevent future confusion.

## Data

Mock data should be clearly local to the visual module or page. Do not introduce real sensitive names, phone numbers, addresses, medical records, or credentials.

