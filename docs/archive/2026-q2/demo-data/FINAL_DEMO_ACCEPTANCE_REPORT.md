# M06 Final Demo Acceptance Report

Status: done

Deployment:

- Branch: `main`
- HEAD: `46f0845`
- GitHub main: confirmed at `46f0845158bdd66966e94a016c59423f61046430`
- Vercel Production: READY
- Production domain: https://www.smartchildcare.cn

Role checks:

- Login page: pass. Username and password inputs default to empty, all example account buttons are visible/enabled, and the parent demo button enters the app.
- Director: pass. Director scope returns 36 children, dashboard metric signal is visible, weekly report history is visible, dispatch entry is visible, and voice orb reports provider ready.
- Li teacher: pass. Teacher scope returns 18 children, diet records are visible, `/diet` renders GPT Image 2 meal images, `/growth` renders GPT Image 2 growth images, health file bridge is available, and voice orb reports provider ready.
- Zhou teacher: pass. Teacher scope returns 18 children, diet records are visible, `/diet` renders GPT Image 2 meal images, `/growth` renders GPT Image 2 growth images, and voice orb reports provider ready.
- Parent: pass. Storybook opens and refreshes without crash, storybook images render, `/growth?child=c-1` renders growth images, home communication is usable, and voice orb reports provider ready.
- Health materials: pass with note. Online data and `/health?child=c-1` contain GPT Image 2 health material refs; referenced assets return `200 image/webp` under authenticated demo access. The health UI displays material data/refs rather than a dedicated image gallery.

Data consistency:

- Director children: 36
- Li teacher children: 18
- Zhou teacher children: 18
- `18 + 18 = 36`: pass

Local checks:

- `npm run lint`: pass
- `npm run build`: pass
- `npm run product:smoke`: pass
- `npm run product:api`: pass after retrying from a stale local `.next` cache state
- `npm run product:ai`: pass
- `npm run product:voice`: pass
- `npm run product:journey`: pass
- `npm run feature:smoke`: pass
- `npm run bugbash:smoke`: pass
- `npm run demo-media:test`: pass
- `npm run growth-media:test`: pass
- `npx tsc --noEmit`: pass

Online stability:

- Accepted GPT Image 2 assets: 119/119 returned `200 image/*`
- Image 404: 0
- Broken visible images: 0
- Layout crash: 0
- `C:\Users\...` path leak in online API/page/image sources: 0

Release recommendation:

- Demo release: recommended for the current online demo.
- Production release: not recommended from this milestone alone; production data, storage, observability, alerting, account lifecycle, audit, and operational controls remain separate work.
