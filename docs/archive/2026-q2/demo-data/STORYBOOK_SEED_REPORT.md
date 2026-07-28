# D-SEED Storybook Seed Report

## Coverage

- Prebuilt storybooks: 36 / 36 children.
- 林妈妈 authorized storybooks: `c-1`, `c-4`.
- Parent forbidden storybook check: `c-3` returns `403 forbidden_scope` through API.

## Structure

Each storybook contains:

- `storybookId`
- `childId`
- `sourceRecordIds`
- `pages`
- embedded `ParentStoryBookResponse`
- `generatedAt`
- `share`

Each book includes:

- Cover page.
- Four story scenes from growth records.
- Ending summary page.
- `mediaRef` and `fallbackMediaRef` pointing to `/demo-media/storybooks/demo-storybook-placeholder.svg`.

## Route Stability

`/parent/storybook?child=c-1` restores the saved storybook from D01 local demo state before requesting live generation. Refresh keeps the saved storybook visible. Missing generated image assets fall back to committed SVG placeholders.
