# E90 Remaining Gaps

Updated: 2026-05-03

## needs-real-provider

- Live vivo Chat/OCR/ASR smoke has not run because the local environment does not configure real `VIVO_*` values.
- Chat currently reports `missing-env` without `VIVO_APP_KEY`.
- OCR currently reports `missing-env` without `VIVO_APP_KEY` and `VIVO_APP_ID`.
- ASR currently reports `missing-env` without `VIVO_APP_KEY`, `VIVO_ASR_PACKAGE`, `VIVO_ASR_CLIENT_VERSION`, and `VIVO_ASR_USER_ID`.
- PDF OCR and browser `webm` ASR remain unsupported until vivo docs confirm support or a conversion/provider path is added.

## needs-external-backend

- Durable production database, production sessions, account lifecycle, invitation, password reset, phone verification, and login disablement remain outside the E90 MVP.
- Stable `classId`, `teacherId`, `parentId`, and child-guardian relationship tables are still required before demo scope can become production authorization.
- Object storage for attachments, images, voice, and storybook media is not connected. Current behavior is metadata plus local preview and scoped content routes.
- Public weekly-report and storybook share links, PDF generation, social share, external notification delivery, and media package downloads are not connected.
- FastAPI backend `/api/v1/agents/*` must stay internal-only or gain service-to-service auth before production exposure. Browser users should enter through Next `/api/ai/*` and `/api/voice-assistant/*`.

## needs-product-decision

- E99 gate definition is unresolved: MVP acceptance can proceed, but strict release acceptance needs `feature:smoke` and `bugbash:smoke` to be green.
- Hard delete remains outside MVP. Current delete behavior is soft archive/restore.
- Batch director dispatch, advanced operations reporting, external BI dashboards, and help/tutorial flows remain deferred.
- Ambiguous voice child matching fails closed today. A child disambiguation picker is a future usability decision.
- Teacher account invitation, phone/account status, and login enable-disable controls remain outside teacher-management MVP.

## partially-completed

- E10 and E11 are partially completed overall because targeted product suites pass but aggregate legacy smoke suites remain red.
- `feature:smoke` is recorded by E11 as failing six legacy D08 cases: communication flow, director summary, health consultation, parent storybook demoSeed, teacher records persistence, and visual-only safety.
- `bugbash:smoke` is recorded by E11 as failing B26 parent console-error 403 cases while director and teacher smoke routes remained nonblank.
- Director metrics are MVP service-backed, but external BI and advanced operational reporting remain outside the completed scope.

## No Remaining MVP fake-success/ui-only/mock-only Blocks

- Binary-only OCR/ASR no longer returns fake success when provider env is missing.
- Export, share, feedback detail, child archive, teacher management, storybook share/export, and voice commands either perform MVP actions or show explicit non-MVP limits.
- Metadata-only attachment and media support must continue to be labelled as local preview, not cloud upload success.
