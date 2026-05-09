# Rollback And Recovery

This document covers demo release rollback and recovery checks. It does not replace a full production incident response runbook.

## Vercel Rollback

- Open the Vercel project deployment list.
- Locate the last known good Production deployment.
- Promote or roll back to that deployment through Vercel's rollback workflow.
- Confirm https://www.smartchildcare.cn points to the restored deployment.
- Recheck login, director 36, Li teacher 18, Zhou teacher 18, parent storybook, media rendering, and voice orb provider ready.

## Git Tag Rollback

- Use an annotated release tag for stable demo rollback points.
- If `v1.0-demo` has been created, use it as the final demo reference.
- To inspect the tag:

```powershell
git show v1.0-demo
```

- To create the tag only after explicit authorization:

```powershell
git tag -a v1.0-demo -m "SmartChildcare demo release with GPT Image 2 media and vivo AI provider"
git push origin v1.0-demo
```

## Environment Variable Checks

- Do not print sensitive values in logs, screenshots, chat, or documents.
- Confirm required provider variables are present through safe status tooling only.
- Do not edit `.env.local`, `.env.release`, or Vercel environment variables during rollback unless explicitly authorized.
- If provider readiness changes, classify the issue before changing configuration.

## Tencent Cloud Backend Checks

- Confirm the backend service is reachable from the expected network environment.
- Confirm required internal endpoints respond as expected.
- Check service health, logs, restart status, and recent deployment history.
- If backend service is unavailable, verify that frontend fallback behavior remains explicit and does not report fake success.

## Image Resource Rollback

- Confirm accepted demo media assets are present and served with image content types.
- Recheck diet, health material refs/assets, growth records, and storybook media.
- If a media regression appears after deployment rollback, verify both application commit and static/media asset source.
- Avoid replacing media assets manually during a live demo unless the affected path is isolated and already validated.

## Vivo Provider Fallback Checks

- Confirm `/api/ai/provider-status` is protected and reports provider readiness only after login.
- Confirm chat, OCR, and ASR readiness through safe status labels, not sensitive values.
- Confirm voice orb remains visible and usable with typed fallback.
- Confirm OCR/ASR failures fail closed or show explicit fallback status rather than fake success.
- If provider is not ready, use typed demo paths and avoid changing provider configuration during the presentation.
