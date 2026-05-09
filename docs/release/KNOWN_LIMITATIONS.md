# Known Limitations

This is a final demo release, not a production-ready deployment for real childcare institution operations.

## Demo Data Boundary

- The current experience uses demo/process-local data patterns.
- The data is sufficient for controlled demonstration, rehearsal, and stakeholder walkthroughs.
- The data model and persistence layer are not yet a real production database deployment.
- Demo account scope is validated for presentation, but formal production account lifecycle is not complete.

## Storage And Media Boundary

- Attachments, images, audio, and generated storybook media still need production object storage.
- CDN configuration, retention policy, backup, deletion, and recovery behavior still need production design.
- Current media behavior should be described as demo-ready media rendering, not a complete upload/storage product.

## Sharing And Export Boundary

- PDF generation still needs production hardening.
- External public sharing links still need production hardening.
- Link expiration, revocation, permission checks, abuse controls, and delivery guarantees remain next-phase work.

## Operations Boundary

- Audit logs are not yet production-complete.
- Monitoring and alerting are not yet production-complete.
- Incident response, runbooks, SLOs, and operational dashboards remain next-phase work.
- Cost, latency, and provider error-rate monitoring for AI capabilities still need production treatment.

## Launch Recommendation

Use this release for demos only.

Do not directly onboard real childcare institutions until production database, storage, authentication, audit, monitoring, security, compliance, migration, and operational controls are completed and revalidated.
