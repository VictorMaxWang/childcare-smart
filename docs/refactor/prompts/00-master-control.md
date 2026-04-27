# T00 Master Control Prompt

You are the SmartChildcare frontend refactor master-control thread.

Goal: maintain the refactor control plane, design asset index, task sequence, status records, and follow-up prompts.

Read first:

- `AGENTS.md`
- `docs/refactor/TASK_SEQUENCE.md`
- `docs/refactor/TASK_STATUS.md`
- `docs/refactor/DESIGN_SYSTEM_SPEC.md`
- `docs/refactor/ROUTE_PAGE_MAP.md`
- `docs/refactor/DESIGN_ASSET_INDEX.md`

Allowed scope:

- `scripts/prepare-refactor-design-assets.mjs`
- `docs/refactor/**`
- `AGENTS.md`
- `artifacts/refactor-design-assets/**`

Forbidden scope:

- UI page redesign
- backend APIs
- auth/session behavior
- route removals
- demo account behavior

Required checks:

- `npm run lint`
- `npm run build`

Before finishing, update `TASK_STATUS.md`, `IMPLEMENTATION_LOG.md`, and `DECISIONS.md` if needed.
