# Roadmap

## P0 — delivered in v1.0
Authentication & RBAC; student profile and verification; company verification; drives with approval and rule versioning; eligibility engine; applications and status machine; applicant management with bulk actions; rounds, interviews, selection; offers with policies; notifications and e-mail queue; analytics, reports and exports; versioned policies; CSV import; audit log; tickets; Super Admin tools; security controls; deployment files; automated tests.

## P1 — next (recommended first after go-live)
* SMTP/SMS provider webhooks (delivery status) and e-mail templates editable by the TPO.
* S3-compatible storage driver and optional antivirus scan on upload.
* Calendar (ICS) invites for interviews; clash detection for students in multiple drives.
* Per-department TPO coordinators with scoped permissions.
* Saved report definitions and scheduled report e-mails.
* Student resume-builder and parsing to pre-fill skills.
* Two-factor authentication for staff accounts; SSO (Google/Microsoft) for students.
* Replace in-process jobs with a dedicated worker/queue when running many instances.

## P2 — later
* Alumni and mentoring module; internship (PPO) conversion tracking.
* Native mobile apps / push notifications.
* Recruiter feedback scorecards with structured rubrics.
* Predictive analytics (placement likelihood, skill-gap suggestions) with human review.
* Multi-campus / multi-tenant support.
* Public API tokens for ERP/LMS integration.

## Known v1 constraints
* One company per recruiter account (`companyUsers.userId` is unique).
* Imported students have no usable password until they use *Forgot password*.
* Files are stored on local disk by default; use a persistent volume.
* Demo seed passwords are for development only.
