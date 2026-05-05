# R03 Result

## Status

done

## Summary

R03 fixed the B26 parent/mobile 403 console errors without weakening parent scope enforcement.

The latest pre-fix `npm run bugbash:smoke` reproduction failed with 4 issues. E99's historical B26 artifact recorded 6 parent/mobile 403 console errors. The root cause was the same in all diagnosed cases: normal parent navigation triggered `POST /api/ai/suggestions`, and the AI route guard treated `snapshot.child.className` as a class scope. Parents are not allowed to access class-scoped data, so `requireClassAccess` correctly returned 403, but this route is actually child-scoped and already validates the child through `requireParentChildAccess(childId)`.

The fix changes only `app/api/ai/suggestions/route.ts` to call `authorizeAiRoute(request, { requiredRole: "parent", collectJsonClassNames: false })` before preserving the existing `requireParentChildAccess(childId)` check. No core scope rule was relaxed.

## 403 Diagnosis

| Route | Request | Account / role | Viewport | Expected | Impact | Conclusion |
| --- | --- | --- | --- | --- | --- | --- |
| `/parent` | `POST /api/ai/suggestions` | `u-parent` / parent | desktop | unexpected | Home AI suggestions fell back and polluted console | Fixed by suggestions route guard option |
| `/parent?child=c-1` | `POST /api/ai/suggestions` | `u-parent` / parent | desktop | unexpected | Authorized child path was incorrectly blocked as class scope | Fixed by suggestions route guard option |
| `/parent?child=c-1` | `POST /api/ai/suggestions` | `u-parent` / parent | mobile 390x844 | unexpected | Mobile smoke failed on a normal parent path | Fixed by suggestions route guard option |
| `/parent?child=c-1` | `POST /api/ai/suggestions` | `u-parent` / parent | mobile 390x844 | unexpected | Duplicate mobile occurrence of the same normal parent request | Fixed by suggestions route guard option |
| `/parent/storybook?child=c-1` | `POST /api/ai/suggestions` | `u-parent` / parent | historical parent route attribution | unexpected | Likely delayed in-flight parent-home request attributed after navigation | Same endpoint/root cause |
| `/parent/storybook?child=c-1` | `POST /api/ai/suggestions` | `u-parent` / parent | historical parent route attribution | unexpected | Historical duplicate from E99's 6-count record | Same endpoint/root cause |

Expected 403 count: 0. Unexpected 403 count: latest 4, historical E99 count 6. No bugbash ignore rule was added.

## Changes

- `app/api/ai/suggestions/route.ts`: added parent AI authorization with `collectJsonClassNames: false`.
- `tests/product-completion/ai-routes-auth.spec.ts`: added regression coverage proving an authorized parent child snapshot with `snapshot.child.className` returns 200/fallback, while forged child scope still returns 403 `forbidden_scope`.

## Checks

- `npm run lint`: passed
- `npm run build`: passed
- `npm run bugbash:smoke`: passed
- `npm run product:smoke`: passed
- `npm run product:api`: passed
- `npm run product:voice`: passed
- `npm run product:journey`: passed
- Targeted `ai-routes-auth.spec.ts`: passed

## Notes

Brain service calls were not available locally during Playwright runs, so existing fallback paths were exercised. This is consistent with previous product smoke behavior and did not affect the B26 scope fix.
