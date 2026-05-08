# M04 Final Demo Acceptance Report

Status: partial

Deployment:

- Branch: `main`
- HEAD: `b0f9ee0`
- GitHub main: confirmed at `b0f9ee084f4135493db2985fdc760b1d4be55c95`
- Vercel Production: READY
- Production domain: https://www.smartchildcare.cn

Role checks:

- Login page: pass. Username and password inputs default to empty, and all example account buttons are usable.
- Director: pass. Director scope returns 36 children, dashboard metric signal is visible, weekly report history is visible, dispatch entry is visible, and voice orb is visible.
- Li teacher: pass. Teacher scope returns 18 children, diet records are visible, `/diet` renders GPT Image 2 meal images, and voice orb is visible.
- Zhou teacher: pass. Teacher scope returns 18 children, diet records are visible, `/diet` renders GPT Image 2 meal images, and voice orb is visible.
- Parent: pass. Storybook opens, refreshes without crash, renders GPT Image 2 storybook images, home communication is usable, and voice orb is visible.
- Health materials: pass with note. Online data and `/health?child=c-1` contain GPT Image 2 health material refs; referenced assets are all 200.
- Growth records: partial. Growth API data contains GPT Image 2 media refs, but `/growth?child=c-1` did not render growth image elements in M04 online UI verification.

Local checks:

- `npm run lint`: pass
- `npm run build`: pass
- `npm run product:smoke`: pass
- `npm run product:api`: pass
- `npm run product:ai`: pass
- `npm run product:voice`: pass
- `npm run product:journey`: pass
- `npm run feature:smoke`: pass
- `npm run bugbash:smoke`: pass
- `npx tsc --noEmit`: pass
- `npm run demo-media:test`: pass

Online stability:

- Accepted GPT Image 2 assets: 119/119 returned 200
- Image 404: 0
- Broken visible images: 0
- Layout crash: 0
- `C:\Users\...` path leak in online API/page/image sources: 0

Release recommendation:

- Demo release: conditional. Use the online deployment for diet, storybook, health material refs, role scope, and voice-orb demonstration. Treat growth record UI images as not accepted until the `/growth` page renders the already-present growth media refs.
- Production release: not recommended from this milestone alone; production data, storage, observability, alerting, account lifecycle, and operational controls remain separate work.
