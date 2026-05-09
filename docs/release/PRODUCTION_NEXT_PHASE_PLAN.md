# Production Next Phase Plan

This plan starts after the final demo release freeze. The goal is to convert the demo-ready system into a production candidate for real institutions.

## P01 Real Database

- Replace demo/process-local persistence with a production database.
- Define backup, restore, retention, and migration procedures.
- Validate child, class, teacher, parent, guardian, record, report, assignment, and media relationships against production access rules.

## P02 Formal Identity And Account Lifecycle

- Implement production authentication and session management.
- Add account invitation, activation, deactivation, password recovery, and role changes.
- Add institution, class, teacher, parent, and child-guardian lifecycle controls.

## P03 Object Storage And CDN

- Move attachments, images, audio, and generated storybook media to production object storage.
- Add CDN delivery, access control, lifecycle policy, backup, and recovery behavior.
- Replace demo media assumptions with production upload, validation, and deletion paths.

## P04 Audit Logs

- Record security-relevant reads, writes, exports, shares, account changes, and permission decisions.
- Make audit entries queryable by institution, user, child, object, and time range.
- Define retention and privacy handling for audit records.

## P05 Monitoring And Alerting

- Add production monitoring for web routes, API routes, AI provider calls, storage, database, and authentication.
- Add alerting for availability, error rate, latency, queue/backlog, provider failures, and abnormal permission denials.
- Create operational dashboards and incident runbooks.

## P06 Production Data Migration

- Define migration from demo data to institution-specific production data.
- Add import validation, rollback, dry-run, and reconciliation reports.
- Prepare data cleanup and deduplication procedures before pilot onboarding.

## P07 Security And Compliance

- Run a full security review of auth, authorization, file access, AI routes, provider integration, and external sharing.
- Review privacy, data retention, consent, and child-data handling requirements.
- Add production sensitive-configuration management and least-privilege deployment controls.

## P08 Real User Pilot

- Select a controlled pilot institution and limited user group.
- Run onboarding, training, support, and feedback collection.
- Define pilot success criteria before expanding to broader production rollout.
