# Browser Use Guide

Updated: 2026-04-29

## Local Site Requirement

Browser Use threads must test the local running site.

1. Read `package.json`.
2. Start or reuse the dev server, usually with `npm run dev`.
3. Use the local URL printed in the console, for example `http://localhost:3000`, `http://localhost:5173`, or another available port.
4. If a dev server is already running, reuse it.
5. Do not use the production site unless the local site cannot start and the reason is recorded as a bug or blocker.

## User Behavior

- Open the local website in the browser.
- Click menus, buttons, cards, tabs, inputs, filters, drawers, dialogs, and links like a normal user.
- Avoid direct URL entry except when testing refresh, direct access, deep links, or permission behavior.
- Do not infer bugs only from code. Browser Use bugs must come from real interaction.
- Do not execute dangerous final confirmation actions such as real delete, final submit, send, or upload completion.

## Evidence

Every bug must include:

- Clear reproduction steps.
- Expected behavior.
- Actual behavior.
- Route and viewport.
- Demo account used.
- Browser name.

For important bugs, also capture:

- Screenshot before or at failure.
- Console errors.
- Network errors.
- Video or trace when available.

Store evidence under `artifacts/bug-bash/` and link paths from `BUGS.md` and `BUGS.json`.

## Recommended Browser Use Flow

- Start with B10 global smoke before role-specific deep passes when possible.
- Keep the browser state realistic: log out or clear state between role switches if needed.
- Verify login state after refresh.
- For mobile checks, use 390x844 first, then tablet 768x1024.
- If an issue looks role-specific, retest with another role only when it clarifies severity.

