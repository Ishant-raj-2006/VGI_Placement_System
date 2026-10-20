# Coverage matrix: specification → implementation

The functional areas of the 30-part product document and PRD v1.0 are mapped to code below (the `#` column is this document's own numbering of topics, grouped in the order the specification introduces them) (backend `B:` = `backend/src/…`, frontend `F:` = `frontend/src/pages/…`).

| # | Spec topic | Backend | Frontend | Tests / docs |
|---|---|---|---|---|
| 1–3 | Product vision, problem, users & roles | `constants/index.js` (ROLES) | role-based layouts `components/Layout.jsx` | PRD_SRS_SUMMARY |
| 4 | Student onboarding & registration | `routes/auth.routes.js`, `services/auth.service.js` | `common/Register, Login, ForgotPassword, ResetPassword, VerifyEmail` | API: auth tests |
| 5 | Student profile & completion | `routes/student.routes.js`, `services/profileCompletion.js` | `student/Profile, Skills, Experience, Projects, Resumes` | unit: completion |
| 6 | Academic data & verification | `models/StudentRelated.js`, `routes/admin.routes.js` (verify/reject/correct) | `student/Academic, Verification`, `admin/StudentDetail` | BUSINESS_RULES §1 |
| 7 | Resume management & file security | `services/storage.service.js`, `middleware/upload.js`, `routes/common.routes.js` (/files) | `student/Resumes` | API: file access; unit: sniffing |
| 8 | Recruiter & company registration | `auth.service`, `models/Company.js` | `recruiter/Company, Verification, Team` | API: tenancy |
| 9 | Company verification | `admin.routes` companies/* | `admin/Companies, CompanyDetail` | UI flow |
| 10 | Drive creation | `services/drive.service.js`, `recruiter.routes` | `recruiter/DriveForm, Drives, DriveDetail` | API: drive workflow |
| 11 | Drive approval & publication | `drive.service`, `admin.routes` drives/* | `admin/Drives, DriveReview` | API: drive workflow |
| 12 | Eligibility rules & versioning | `services/eligibility.service.js`, `DriveRuleVersion` | `components/Eligibility.jsx` | unit: eligibility (21 cases) |
| 13 | Student drive discovery | `student.routes` /drives | `student/Drives, DriveDetail` | API |
| 14 | Application submission | `services/application.service.js` | `student/Applications, ApplicationDetail` | API: duplicate/concurrency |
| 15 | Application status machine | `services/statusMachine.js` | status badges & timeline | unit: 8 cases |
| 16 | Recruiter applicant management & bulk actions | `recruiter.routes`, `application.service` | `recruiter/Applicants, ApplicantDetail` | API; UI flow |
| 17 | Rounds & assessments | `services/recruitment.service.js` | `recruiter/Rounds, RoundDetail` | UI flow |
| 18 | Interviews & scheduling | `recruitment.service` | `recruiter/Interviews`, `student/Interviews` | UI flow |
| 19 | Selection & offers | `services/offer.service.js` | `recruiter/Offers`, `student/Offers, OfferDetail` | API: offers; BUSINESS_RULES §4 |
| 20 | Offer policies & expiry | `policy.service.js`, `offer.service.runOfferMaintenance`, `jobs/index.js` | `admin/Policies` | BUSINESS_RULES §4–5 |
| 21 | Notifications & e-mail | `notification.service.js`, `email.service.js` (EmailLog queue) | `common/Notifications`, `common/Settings` | API: notifications |
| 22 | Analytics, reports, exports | `analytics.service.js`, `export.service.js` | `admin/Dashboard, Reports, Monitoring` | API: reports |
| 23 | Security & privacy | `middleware/*`, `config/env.js` | route guards in `App.jsx` | ARCHITECTURE §3 |
| 24 | Policies (versioned) | `policy.service.js` | `admin/Policies` | API: policies |
| 25 | Bulk CSV import & duplicates | `import.service.js` | `admin/ImportStudents, Duplicates` | API: import |
| 26 | Audit logs | `audit.service.js` | `admin/AuditLogs` | API: audit |
| 27 | Tickets, complaints, contact | `models/System.js` Ticket, `/support` | `common/Support`, `common/Contact`, `admin/Tickets` | API: tickets |
| 28 | Super Admin tools | `admin.routes` users/system | `admin/Users, System` | API: RBAC |
| 29 | UI page lists (Common 7, Student 17, Recruiter 15, TPO/Admin 17) | — | `frontend/src/pages/**` (71 routes) | Playwright smoke |
| 30 | Documentation, testing plan, roadmap, sample data | `scripts/seed.js` | — | docs/*, TEST_PLAN, ROADMAP |
