# M06 Final Online Demo Acceptance Result

Status: done

Production:

- Domain: https://www.smartchildcare.cn
- GitHub main: contains `46f0845`
- Local branch/head: `main` at `46f0845`
- Vercel Production: READY, built `main` commit `46f0845`
- Redeploy: not required

Online acceptance:

- Login page: pass. Username/password inputs default empty; example account buttons are visible/enabled and usable.
- Director: pass. 36 children, dashboard metrics, weekly report history, dispatch entry, and voice orb are visible.
- Li teacher: pass. 18 children, diet records, real diet images, real growth images, health file bridge, and voice orb are visible.
- Zhou teacher: pass. 18 children, diet records, real diet images, real growth images, and voice orb are visible.
- Parent: pass. Storybook opens and survives refresh, storybook images render, growth profile renders growth images, home communication is usable, and voice orb is visible.
- Health materials: pass with note. API and parent health page expose GPT Image 2 health material refs; authenticated referenced files return `200 image/webp`. Current UI displays data/refs rather than a dedicated image gallery.
- Images: pass. Authenticated accepted assets checked `119/119`; page image 404 count `0`; broken visible image count `0`.
- Layout: pass. No page errors, image failures, or visible crash observed during M06 browser checks.
- Local path leak: pass. No `C:\Users\...` path leak observed in online API/page/image sources.

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

Artifacts:

- `artifacts/demo-media/M06/online-acceptance.json`
- `artifacts/demo-media/M06/asset-checks.json`
- `artifacts/demo-media/M06/*.png`

Recommendation:

- Demo release: recommended.
- Production release: not recommended until production data, object storage, observability, alerting, account lifecycle, audit, and operational controls are completed.
