# Final Demo Script

Product naming for defense materials: `慧育童行 - SmartChildcare Agent`.

Preferred competition route: `/login` -> `/teacher` -> `/teacher/high-risk-consultation` -> `/admin` -> `/parent` -> `/parent/storybook?child=c-1` -> `/parent/agent?child=c-1`. Older `/teacher/agent` and `/admin/agent?action=weekly-report` flows are backup or deep-dive segments.

Each step should stay within 1-2 minutes. Skip deeper explanation if the room is short on time; the goal is to show the working loop, not every feature.

## Chen Director Script

1. Open the production domain and enter through the Chen director demo account.
2. Show the director overview and call out the 36-child institution scope.
3. Open the weekly report area and show report history as the management handoff view.
4. Open the dispatch entry and show how director decisions become trackable follow-up work.
5. Point to the voice orb and confirm provider ready without opening configuration details.

## Li Teacher Script

1. Switch to the Li teacher demo account.
2. Show the 18-child teacher scope and explain that this is class-scoped, not institution-wide.
3. Open diet records and show real GPT Image 2 meal images.
4. Open growth records and show real child growth images.
5. Use the teacher flow to explain how daily records become structured signals for later review.

## Zhou Teacher Script

1. Switch to the Zhou teacher demo account.
2. Confirm the second 18-child scope.
3. Open diet and growth pages to show the same media path works for the second class.
4. Emphasize that Li and Zhou scopes together form the 36-child director scope.
5. Keep this section short; it is mainly the role-scope validation segment.

## Lin Parent Script

1. Switch to the Lin parent demo account.
2. Open the parent home or growth profile.
3. Show child-specific growth records and real growth media.
4. Open parent storybook and refresh once to show it remains stable.
5. Explain the parent side as the family-facing part of the closed loop.

## AI Voice Orb Script

1. Show the voice orb on director, teacher, or parent page.
2. Confirm provider ready in the visible UI.
3. Demonstrate a safe typed command if live microphone conditions are not ideal.
4. Show that the command respects the current role and requires confirmation for write actions.
5. Do not expose provider credentials, environment variables, network headers, or raw request signing details.

## Health Material OCR Script

1. Open the health material or teacher health-file bridge flow.
2. Show the health material entry and referenced GPT Image 2 asset path through the UI.
3. Explain that image OCR/provider readiness is verified for the demo.
4. Mention the current demo note: the health UI displays material data/refs rather than a dedicated gallery.
5. Keep the message focused on provider readiness and record linkage, not production storage.

## Growth Storybook Script

1. Open the parent storybook for the demo child.
2. Show real storybook images and page stability.
3. Refresh the page once to demonstrate that it survives reload.
4. Connect the storybook to the broader parent communication and growth narrative.
5. Avoid presenting external public sharing as production-ready.

## Diet Record Script

1. Open a teacher diet page.
2. Show real meal images and normal record rendering.
3. Explain that diet media is part of the demo data, not a production object-storage upload pipeline.
4. Switch briefly between Li and Zhou if class-scope proof is needed.
5. Stop after the visible media and scope check are clear.

## Dispatch And Weekly Report Script

1. Return to Chen director.
2. Open weekly report history and show the management summary surface.
3. Open dispatch and show the action handoff path.
4. Explain that the demo supports a management loop: observation -> summary -> dispatch -> follow-up.
5. Do not claim production audit, alerting, or formal workflow SLA is complete.
