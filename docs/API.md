# API reference

Base URL: `/api/v1`. All requests/responses are JSON (uploads use `multipart/form-data`). Send `Authorization: Bearer <token>` except where marked **public**.
List endpoints accept `page` (default 1) and `limit` (default 20, max 100) and return `meta`.
Errors: `400` validation (with `details: [{path,message}]`), `401` not authenticated, `403` forbidden, `404` not found (also used for cross-tenant access), `409` conflict/invalid transition, `422` business-rule rejection, `429` rate limited.

Legend: **S** student · **R** recruiter (member) · **RM** recruiter owner/HR manager · **T** TPO · **SA** super admin.

## Auth
| Method & path | Who | Notes |
|---|---|---|
| `POST /auth/register` | public | `role: "student"` (name, email, password, studentId, rollNumber, department, graduationYear, …) or `role: "recruiter"` (+ `company{…}` or `joinCompanyId`). TPO/SA cannot self-register |
| `POST /auth/login` | public | `{email,password}` → `{token, expiresAt, user, profile/company}` |
| `POST /auth/logout` | any | revokes the session |
| `GET /auth/me` · `PUT /auth/me` | any | profile context · update name / notification prefs |
| `POST /auth/change-password` | any | revokes other sessions |
| `POST /auth/forgot-password` · `POST /auth/reset-password` | public | identical response for unknown e-mails; one-time token |
| `POST /auth/verify-email` · `POST /auth/resend-verification` | public | |

## Student (`S`)
| Endpoint | Notes |
|---|---|
| `GET /student/dashboard` | completion, application counts, pending offers, upcoming interviews |
| `GET/PUT /student/profile` | PUT re-opens verification if academic data/department/year changed |
| `POST/DELETE /student/profile/photo` | JPEG/PNG ≤ 1 MB |
| `GET/POST /student/academic-records`, `PUT/DELETE …/:id` | semester/board records; editing resets their verification |
| `PUT /student/skills` | skills + interests |
| `POST /student/experiences`, `PUT/DELETE …/:id` | internships, certificates, achievements |
| `GET/POST /student/projects`, `PUT/DELETE …/:id` | |
| `GET/POST /student/resumes`, `DELETE …/:id` | PDF/DOCX ≤ 2 MB, max 5 active |
| `GET /drives` | published drives from verified companies, each with eligibility result + reasons; filters `q, employmentType, eligibility, applied` |
| `GET /drives/:id` · `GET /drives/:id/eligibility` | details + full check list |
| `POST /drives/:id/applications` | `{resumeId?}`; server re-checks drive state, deadline, eligibility, policy, duplicates |
| `GET /student/applications` · `GET …/:id` · `GET …/:id/timeline` | own only |
| `POST /student/applications/:id/withdraw` | policy-controlled |
| `GET /student/interviews` | |
| `GET /student/offers` · `GET …/:id` · `POST …/:id/respond` | `{decision: "accept"|"decline"}`; deadline + offer policy enforced |
| `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read-all`, `POST /notifications/:id/read` | all roles |

## Recruiter (`R`/`RM`)
| Endpoint | Notes |
|---|---|
| `GET /recruiter/dashboard` | KPIs |
| `GET/PUT /recruiter/company` | PUT: RM |
| `GET /recruiter/company/verification` · `POST …/submit-verification` | resubmit after rejection (RM) |
| `GET /recruiter/team` · `POST /team/:id/approve` · `PUT /team/:id/role` · `POST /team/:id/remove` | RM |
| `POST/GET /recruiter/drives`, `GET/PUT /recruiter/drives/:id` | PUT of eligibility rules creates a new rules version |
| `POST /recruiter/drives/:id/submit` | company must be verified |
| `POST /recruiter/drives/:id/close` | RM |
| `GET /recruiter/drives/:id/applications` | filters `status, eligibility, department, graduationYear, minCgpa, skills, q`; verified academics only; contact details after shortlist |
| `GET /recruiter/applications/:id` | full candidate view, history, rounds, interviews, offers |
| `POST /recruiter/applications/:id/{review,shortlist,reject}` (alias `/applications/:id/…`) | transition via status machine |
| `POST /recruiter/applications/bulk` | `{applicationIds, action, reason?, confirm: true}` — confirmation mandatory |
| `POST /recruiter/applications/:id/selection` | `{outcome: selected|not_selected|on_hold|further_evaluation}` |
| `GET/POST /recruiter/drives/:id/rounds`, `PUT/DELETE /recruiter/rounds/:id` | |
| `GET/POST /recruiter/rounds/:id/participants`, `PUT …/participants/:pid`, `POST /recruiter/rounds/:id/complete` | bulk add needs `confirm`; result may auto-reject |
| `POST /recruiter/rounds/:id/interviews` · `GET /recruiter/drives/:id/interviews` · `PUT /recruiter/interviews/:id` | reschedule keeps history and notifies |
| `POST /recruiter/applications/:id/offers` | create draft (`issueNow` for RM) |
| `GET /recruiter/offers`, `PUT /recruiter/offers/:id` | |
| `POST /recruiter/offers/:id/{issue,withdraw,revise,document}` | issue/withdraw/revise: RM; document = PDF upload |

## TPO / Super Admin (`T`, `SA`)
| Endpoint | Notes |
|---|---|
| `GET /admin/dashboard` | totals, pending queues, metric definitions |
| `GET /admin/students`, `GET/PUT /admin/students/:id` | PUT = authorised correction (reason required, before/after audited) |
| `POST /admin/students/:id/{verify,reject-verification,activate,deactivate}` | verify may override values |
| `POST /admin/academic-records/:id/{verify,reject}` | |
| `GET /admin/students/duplicates` | possible duplicates (not auto-merged) |
| `GET /admin/students/import/template` · `POST /admin/students/import?dryRun=true|false` | CSV; dry-run is the default |
| `GET /admin/companies`, `GET …/:id`, `POST …/:id/{review,approve,reject,suspend}` | suspend pauses drives per policy |
| `GET /admin/drives`, `/drives/pending`, `/drives/:id`; `POST /admin/drives/:id/{review,approve,reject,request-changes,publish,pause,resume,close,cancel}` | |
| `GET /admin/applications`, `GET /admin/offers` | monitoring (minimal PII) |
| `GET /admin/recruitment` | per-drive progress |
| `GET /admin/analytics/{placements,departments,companies,salary,funnel}` | JSON with definitions |
| `GET /admin/reports/:type?format=csv|xlsx|json` | types: departments, companies, salary, applications, offers, students |
| `GET /admin/policies` · `GET …/:key/history` · `PUT …/:key` | `{value, effectiveFrom?, note?}`; system keys need SA |
| `GET /admin/audit-logs` | filters `action, entityType, entityId, actorId, from, to` |
| `GET /admin/tickets` · `PUT /admin/tickets/:id` | status + response (requester notified) |
| `GET/POST /admin/users`, `PUT /admin/users/:id/role`, `POST …/:id/{activate,deactivate,unlock,revoke-sessions}` · `GET /admin/system/health` | **SA only**; last active SA is protected |

## Support & files
| Endpoint | Notes |
|---|---|
| `POST /support/contact` | **public**, rate-limited |
| `POST/GET /support/tickets` | complaint / correction_request / support (own tickets) |
| `GET /files/resumes/:id` | owner, TPO/SA, or a recruiter whose company has an application using that resume |
| `GET /files/photos/:studentId` | owner, TPO/SA, or a recruiter with an application from that student |
| `GET /files/offers/:id/document` | the offer's student, the offer's company, TPO/SA |
| `GET /health` | liveness (503 if DB is down) |
