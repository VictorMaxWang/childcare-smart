# Security Permission Regression

Last updated: 2026-06-01

## Summary

This regression pass fixes the post-T7/T8 permission model around role isolation, AI route authorization, log privacy, child-data minimization, and uniform error semantics.

Core guarantees:

- `401 unauthorized`: no valid session, with `reason=login_required`.
- `403 forbidden_scope`: authenticated but wrong role, wrong child, wrong class, or outside institution scope.
- `423 limited`: authenticated business limit, with `code=limited`, for `normal_session_not_enabled`, `demo_seed_only`, or `scope_required`.
- Provider outages remain `503 provider_unavailable`; they are not treated as auth failures.

## Role Matrix

| Surface | Parent | Teacher | Admin |
| --- | --- | --- | --- |
| Page shell | Redirected to parent pages by role. | Redirected to teacher pages by role. | Redirected to admin pages by role. |
| Visible children | Only children in session `childIds` or children whose `parentUserId` matches the session user. | Only children in the same institution and assigned class. | Institution children only. No cross-institution super-admin behavior is introduced. |
| Child API data | Own child only. Other child ids return `403 forbidden_scope`. | Same institution and own class only. Other classes return `403 forbidden_scope`. | Same institution only. |
| Class data | No class-level scope. | Own class only. | Same institution classes only. |
| Assignments and records | Read/write only for own child-facing flows. | Read/write only for own class children and assigned work. | Same institution assignment and record scope. |
| Shared pages | Use scoped snapshots and visible children. Parent `invalidChildId` remains an explicit denial and does not silently fall back to another child. | Use scoped snapshots and visible children. | Use institution-scoped snapshots. |

## AI Route Matrix

| Route group | Allowed scope | Denial behavior |
| --- | --- | --- |
| Any `/api/ai/*` without session | None | `401`, `code=unauthorized`, `reason=login_required`. |
| Parent AI routes | Parent role plus own child scope. | Wrong role or another child: `403 forbidden_scope`; missing required child scope: `423 limited`, `reason=scope_required`. |
| Teacher AI routes | Teacher/admin role plus own class or institution-allowed child/class hints. | Wrong role or forbidden child/class: `403 forbidden_scope`; missing required normal-session scope: `423 limited`. |
| Admin AI routes | Admin role inside current institution. | Parent/teacher calls: `403 forbidden_scope`. |
| Demo-only AI routes | Demo session while normal access is not enabled. | Normal session: `423 limited`, `reason=normal_session_not_enabled`. |
| Demo seed-only storybook flows | Demo seeded payloads only. | Normal session using demo seed path: `423 limited`, `reason=demo_seed_only`. |
| Provider status | Logged-in session; reports capability state only. | No session: `401`; no secrets are returned. |

All guarded AI routes use `authorizeAiRoute` or `authorizeAiRouteSession`, so the response envelope is consistent across no-session, wrong-role, forbidden-scope, and business-limited cases.

## Error Semantics

| Case | HTTP | Code | Reason |
| --- | --- | --- | --- |
| Missing or invalid session | `401` | `unauthorized` | `login_required` |
| Role mismatch | `403` | `forbidden_scope` | `role_mismatch` |
| Child outside account scope | `403` | `forbidden_scope` | `forbidden_child` |
| Class outside account scope | `403` | `forbidden_scope` | `forbidden_class` |
| Normal account reaches demo-only route | `423` | `limited` | `normal_session_not_enabled` |
| Normal account omits required scoped payload | `423` | `limited` | `scope_required` |
| Demo seed-only business path | `423` | `limited` | `demo_seed_only` |
| Provider unavailable after auth succeeds | `503` | `provider_unavailable` | provider-specific availability |

Auth and business limit failures must not fall through to `500`.

## Logging Privacy

Server logs now use a security log helper for AI routes, auth routes, brain proxy calls, notification events, provider normalization, and API/backend error boundaries.

Allowed log fields:

- event name
- route or request id
- HTTP status
- safe error name/code/status
- provider capability status
- non-sensitive route metadata

Forbidden in logs:

- `Cookie`, `Set-Cookie`, session ids, session payloads
- `Authorization`, Bearer tokens, API keys, app keys, secrets
- HMAC signatures or signing material
- full request body, response body, or upstream provider body snippets
- child sensitive details, child names, guardian names, phone numbers
- parent feedback original text or message content

The backend Python error boundary logs request id, method, path, and client only. It does not log query strings, headers, cookies, or request bodies.

## HMAC And Provider Status

- Vivo HMAC is generated only when building the Vivo provider request and is sent only in provider request headers.
- HMAC signatures, API keys, Bearer values, and provider secrets are never returned to the browser or written to server logs.
- `/api/ai/provider-status` returns environment variable names and capability availability only. It does not expose secret values, signatures, or authorization headers.

## Regression Evidence

Commands run on 2026-06-01:

```powershell
node --import ./scripts/register-test-path-loader.mjs --test ./lib/server/session.test.ts ./lib/server/scope.test.ts ./lib/server/ai-route-guard.test.ts ./lib/server/api-errors.test.ts ./lib/server/security-log.test.ts ./app/api/ai/provider-status/route.test.ts
```

Result: `22/22` passed. Covers parent child isolation, teacher class isolation, admin institution scope, AI route no-session rejection, `423 limited`, production demo header denial, provider-status redaction, and log redaction.

```powershell
npm run typecheck
```

Result: passed.

```powershell
npx playwright test tests/product-completion/ai-routes-auth.spec.ts --config=playwright.product.config.ts --project=chromium --reporter=line
```

Result: `2/2` passed. Covers unauthenticated AI route rejection, wrong-role denial, parent/teacher scope denial, admin access, and missing scoped parent payload returning `423 limited`.

```powershell
npx playwright test tests/product-completion/ai-routes-normal-session.spec.ts --config=playwright.product.config.ts --project=chromium --reporter=line
```

Result: `2` skipped in the current local environment because normal-account E2E prerequisites are not configured. The same invariants are covered by the in-memory guard unit tests above.

```powershell
npm run demo:preflight
```

Result: `1/1` passed. Demo preflight now authenticates through `/api/auth/demo-login` instead of relying on the production-disabled demo header.

```powershell
rg -n "console\.(error|warn|log|info|debug)" lib/auth lib/server app/api lib/ai lib/providers backend/app -g '!**/__pycache__/**'
```

Result: only the log-redaction unit test monkey-patches `console.warn`; server runtime surfaces use `logSecurityEvent`.

## Remaining Preconditions

- Normal-account Playwright E2E requires `DATABASE_URL` and `AUTH_SESSION_SECRET`.
- Admin is treated as institution admin. No cross-institution super-admin is part of this regression.
