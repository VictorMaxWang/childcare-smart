# M04 Result

Status: partial

GitHub and Vercel:

- Local branch: `main`
- HEAD: `b0f9ee0`
- Full SHA: `b0f9ee084f4135493db2985fdc760b1d4be55c95`
- GitHub main: confirmed at the same SHA by GitHub API after `git ls-remote` hit a transient connection reset.
- Vercel Production: READY
- Deployment: `https://childcare-smart-hlb18zqbo-victormaxwangs-projects.vercel.app`
- Production domain: `https://www.smartchildcare.cn`
- Build log evidence: `Branch: main, Commit: b0f9ee0`
- Redeploy: not required

Online checks:

- Login default inputs empty: pass
- Example account buttons: pass
- Director 36: pass
- Li teacher 18: pass
- Zhou teacher 18: pass
- Weekly report history: pass
- Dispatch visible: pass
- Teacher diet records: pass
- Diet GPT Image 2 images: pass
- Health material GPT Image 2 refs/assets: pass
- Storybook GPT Image 2 images and refresh: pass
- Growth record GPT Image 2 API refs: pass
- Growth record UI image rendering: partial, `/growth?child=c-1` rendered text-only with 0 image elements
- Accepted assets 200: pass, 119/119
- Image 404: pass, 0
- Layout crash: pass, 0
- Voice orb: pass

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

Artifacts:

- `artifacts/demo-media/M04/online-acceptance.json`
- `artifacts/demo-media/M04/asset-checks.json`
- 12 screenshots under `artifacts/demo-media/M04/`

Recommendation:

Use this deployment for a conditional demo of the completed diet, health material refs, storybook, role scope, and voice-orb flows. Do not present growth record page image rendering as accepted until the `/growth` UI consumes the existing GPT Image 2 growth media refs.
