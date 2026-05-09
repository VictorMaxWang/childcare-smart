# M06 Final Media Acceptance Report

Status: done

Base URL: https://www.smartchildcare.cn

Current release evidence:

- GitHub main contains `46f0845` (`46f0845158bdd66966e94a016c59423f61046430`).
- Latest Vercel Production deployment is READY and built `main` at commit `46f0845`.
- Production alias includes `https://www.smartchildcare.cn`.
- No redeploy was required.

Media inventory:

- Accepted GPT Image 2 assets: 119
- Meals: 49
- Health materials: 19
- Growth: 14
- Storybooks: 37
- Authenticated accepted asset availability: 119/119 returned `200 image/*`
- Image 404 during page checks: 0
- Broken visible images: 0
- `C:\Users\...` path leak in online API/page/image sources: 0
- Fallback references remain present for storybook/demo media safety.

Online media result:

- Diet: pass. `/diet` for Li and Zhou rendered GPT Image 2 meal images, with 0 meal placeholders.
- Growth records: pass. Teacher `/growth` for Li/Zhou and parent `/growth?child=c-1` rendered GPT Image 2 growth images with 200 responses.
- Storybooks: pass. `/parent/storybook?child=c-1` opened and refreshed without crash, rendering GPT Image 2 storybook images.
- Health materials: pass with note. API and `/health?child=c-1` expose GPT Image 2 health material refs, and all referenced health files return `200 image/webp` under authenticated demo access. The current health UI shows material data/refs rather than a dedicated image gallery.

Artifacts:

- `artifacts/demo-media/M06/online-acceptance.json`
- `artifacts/demo-media/M06/asset-checks.json`
- `artifacts/demo-media/M06/login-empty.png`
- `artifacts/demo-media/M06/login-demo-button.png`
- `artifacts/demo-media/M06/director-admin.png`
- `artifacts/demo-media/M06/director-weekly.png`
- `artifacts/demo-media/M06/director-dispatch.png`
- `artifacts/demo-media/M06/teacher-li-diet.png`
- `artifacts/demo-media/M06/teacher-li-growth.png`
- `artifacts/demo-media/M06/teacher-li-health-file-bridge.png`
- `artifacts/demo-media/M06/teacher-zhou-diet.png`
- `artifacts/demo-media/M06/teacher-zhou-growth.png`
- `artifacts/demo-media/M06/parent-growth.png`
- `artifacts/demo-media/M06/parent-storybook.png`
- `artifacts/demo-media/M06/parent-storybook-refresh.png`
- `artifacts/demo-media/M06/parent-health.png`
- `artifacts/demo-media/M06/parent-communication.png`

Recommendation:

- Demo release: recommended. Diet, growth records, storybooks, health material refs/assets, role scope, and voice-orb flows are ready for the current demo.
- Production release: not recommended from this demo milestone alone. Production database, object storage, account lifecycle, monitoring, alerting, audit, and operational controls still need production hardening.
