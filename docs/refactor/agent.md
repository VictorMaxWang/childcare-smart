# Frontend Refactor Agent Notes

You are working on the SmartChildcare frontend visual refactor.

Before changing code, read:

- `AGENTS.md`
- `docs/refactor/TASK_SEQUENCE.md`
- `docs/refactor/TASK_STATUS.md`
- `docs/refactor/DESIGN_SYSTEM_SPEC.md`
- `docs/refactor/ROUTE_PAGE_MAP.md`
- `docs/refactor/DESIGN_ASSET_INDEX.md`

Core rules:

- Keep business logic, routes, backend APIs, demo-login flow, permissions, and data contracts intact.
- Use design images for layout, color, component rhythm, hierarchy, and visual tone only.
- Keep the product unified: Chinese B2B SaaS, professional, trustworthy, warm, light, and readable.
- Do not ship UI that depends on `artifacts/refactor-design-assets/`.
- Do not use GPT Image 2 text as business-field truth.

Before finishing:

- Update `docs/refactor/TASK_STATUS.md`.
- Update `docs/refactor/IMPLEMENTATION_LOG.md`.
- Update `docs/refactor/DECISIONS.md` when a meaningful design tradeoff is made.
- Run required checks, usually `npm run lint` and `npm run build`.
- Report changed files, completed work, check results, and open risks.
