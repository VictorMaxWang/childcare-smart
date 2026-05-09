# Demo Rehearsal Checklist

Use this checklist 30 minutes before the final demo.

## 30-Minute Preflight

- Confirm the target URL opens: https://www.smartchildcare.cn.
- Confirm Vercel Production is still `READY`.
- Confirm the browser is using the production domain, not localhost or a preview URL.
- Confirm network is stable and no VPN/proxy is interfering with image or API requests.
- Prepare a clean browser profile or private window for the live demo.
- Keep this fallback path available: login page -> director dashboard -> teacher diet/growth -> parent growth/storybook.

## Login Page

- Open `/login`.
- Confirm username and password fields are empty by default.
- Confirm all demo account buttons are visible and enabled.
- Log in through the page's demo account buttons rather than typing credentials during the presentation.

## Demo Accounts

- Chen director: confirm the director workspace opens and shows institution-level data.
- Li teacher: confirm teacher scope opens with 18 children.
- Zhou teacher: confirm teacher scope opens with 18 children.
- Lin parent: confirm parent workspace opens and child-specific pages are accessible.

## Role Checks

- Director: confirm 36 children are visible in director scope.
- Director: confirm dashboard metrics, weekly report history, dispatch entry, and voice orb are visible.
- Li teacher: confirm 18 children, diet records, growth records, and voice orb are visible.
- Zhou teacher: confirm 18 children, diet records, growth records, and voice orb are visible.
- Parent: confirm growth profile, storybook, reminders or communication, and voice orb are visible.

## Media Checks

- Diet images: open teacher diet pages for Li and Zhou; confirm real meal images render.
- Health material images: open health material flow; confirm GPT Image 2 material refs/assets are present and referenced assets load.
- Growth record images: open teacher growth and parent growth pages; confirm real growth images render.
- Storybook images: open parent storybook, refresh once, and confirm real storybook images remain visible.
- Image failures: watch for broken-image icons or visible 404 states.

## Voice Orb Checks

- Confirm the voice orb is visible for director, teacher, and parent flows.
- Confirm provider status is ready in the UI.
- Use typed fallback for the live demo if microphone permission, room noise, or browser policy blocks recording.
- Do not expose provider configuration, environment variable names beyond public status labels, or any sensitive values during the demo.

## Browser Cache Guidance

- Prefer a private window or clean Chrome profile.
- If images or routes look stale, hard refresh with `Ctrl+F5`.
- If stale state persists, clear site data for `www.smartchildcare.cn` and log in again.
- Avoid changing production environment variables during rehearsal.

## Backup Demo Path

1. Login page demo buttons.
2. Chen director dashboard: 36 children, weekly report, dispatch, voice orb.
3. Li teacher diet: 18 children and real meal images.
4. Li teacher growth: real growth images.
5. Zhou teacher diet/growth: second 18-child scope.
6. Lin parent growth and storybook: parent-facing real media.
7. Voice orb typed fallback: provider ready and role-safe command behavior.
