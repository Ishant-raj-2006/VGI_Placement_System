# PRD / SRS summary

## 1. Purpose
Replace spreadsheets, e-mail threads and WhatsApp groups used for campus placement with one system that holds verified student data, company/drive approvals, rule-based eligibility, hiring-process tracking, offers and reporting.

## 2. Roles
| Role | Can do |
|---|---|
| Student | Maintain profile, academic records, resumes, projects; view eligible drives; apply/withdraw; follow rounds & interviews; accept/decline offers; notifications; support tickets |
| Recruiter (company) | Register company; create drives & eligibility rules; manage applicants (review, shortlist, reject, bulk); rounds, interviews, selection; issue/revise/withdraw offers; team management (owner/HR manager) |
| TPO | Verify students & companies; approve/publish drives; manage policies; monitor applications/offers; analytics, reports, imports; resolve tickets; audit log |
| Super Admin | Everything a TPO can + user/role management, system settings, session revocation, system health |

## 3. Functional requirements (all implemented)
1. **Authentication & access** — register (student/recruiter), login, logout, forgot/reset/change password, e-mail verification, lockout, RBAC, immediate session revocation.
2. **Student profile** — personal, academic records per semester/board, skills, projects, experiences, resumes (PDF/DOCX), profile completion %, verification workflow, authorised corrections by TPO with audit.
3. **Company management** — registration, verification (review/approve/reject/suspend), team approval and roles.
4. **Placement drives** — create/edit, eligibility rules with versioning, submit for approval, TPO approve/reject/request-changes, publish/pause/resume/close/cancel.
5. **Eligibility engine** — eligible / ineligible / pending verification with reasons; re-evaluated at apply time; snapshot stored.
6. **Applications** — apply, duplicate prevention, withdraw by policy, status machine, timeline.
7. **Applicant management** — filters, candidate view, review/shortlist/reject, bulk actions with confirmation.
8. **Recruitment process** — rounds, participants, results, interview scheduling/rescheduling, selection outcomes.
9. **Offers** — draft, issue, revise (versioned), withdraw, student accept/decline, document upload, offer policy, expiry & reminders.
10. **Notifications** — in-app plus durable e-mail queue with retry/backoff and delivery log.
11. **Analytics & reports** — dashboards, placement/department/company/salary/funnel analytics, CSV/XLSX/JSON export.
12. **Policies** — versioned, effective-dated, audited.
13. **Bulk import** — CSV with dry-run, duplicate detection, error report; duplicate-student detection.
14. **Governance** — audit logs, tickets (complaint/correction/support), contact form, Super Admin tools.

## 4. Non-functional requirements
| Area | Implementation |
|---|---|
| Security | See ARCHITECTURE §3 |
| Data integrity | Unique indexes, atomic transitions, server-side validation of every rule |
| Performance | Indexed queries, server pagination (max 100), bounded analytics sets |
| Reliability | Durable e-mail queue, idempotent jobs, health endpoint, backup script |
| Usability | Responsive UI, loading/empty/error states, confirmations, accessible components |
| Maintainability | Layered code, constants for statuses/policies, 106 automated tests, docs |
| Portability | Runs on MongoDB and MongoDB-compatible engines; Docker image provided |
| Privacy | Least-privilege views: recruiters see only verified academics for their applicants; contact details only after shortlist; private files |

## 5. Screens
Common (7): landing, login, register, forgot/reset password, verify e-mail, contact, not-found/forbidden.
Student (17), Recruiter (15), TPO/Admin (17): see `frontend/src/pages/` and the route table in `frontend/src/App.jsx` (71 routes rendered error-free by the smoke test).

## 6. Out of scope for v1
Native mobile apps, payments, video-interview hosting, AI resume parsing, calendar sync (see ROADMAP.md).
