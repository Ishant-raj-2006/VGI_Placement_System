# Test plan

## 1. Strategy
| Level | Tool | Scope | Needs |
|---|---|---|---|
| Unit | `node:test` | eligibility engine, status machine, profile completion, helpers, sanitiser, upload sniffing, policy validation — **44 tests** | nothing |
| API integration | `node:test` + supertest | real Express app + real MongoDB: auth, RBAC, tenancy, lifecycle, offers, analytics, import, files — **62 tests** | MongoDB, `MONGODB_URI_TEST` |
| Browser (optional) | Playwright (Chromium) | `smoke.mjs` opens every page for every role (71 pages) and fails on console/network errors; `flow.mjs` drives the full lifecycle through the real UI | running app, see `e2e/README.md` |

Run: `cd backend && MONGODB_URI_TEST=mongodb://127.0.0.1:27017/cpms_test npm test` (DB name must contain "test"; it is **dropped** by the tests). Without `MONGODB_URI_TEST` only unit tests run.

## 2. What the automated tests cover
| Area | Automated cases |
|---|---|
| Eligibility (unit) | CGPA = min passes; below fails with reason; branch / year / backlog failures; missing or unverified → pending; high CGPA cannot override branch; ineligible beats pending; zero-backlog limit; float boundary; case/format-insensitive department & degree; 10th/12th rules; global backlog policy; info-only requirements |
| Status machine (unit) | happy path; no skipping/backwards; terminal states; shortlisted ≠ selected ≠ offered; students cannot set recruiter statuses; 409 with allowed list |
| Profile completion, helpers, sanitiser, upload sniffing, policy validation (unit) | spec example 4/5 = 80 %; CSV escaping & formula neutralisation; median; audit redaction; `$`/dotted/prototype keys stripped; PDF/DOCX/PNG/JPEG magic bytes; invalid policy values rejected |
| Auth (API) | register; weak/duplicate rejected; no self-registration as TPO/admin; mass-assignment blocked; generic login error; no hash leaked; NoSQL-injection login; logout revokes session; lockout; identical forgot-password response; one-time reset token, old sessions revoked |
| RBAC & tenancy (API) | student/recruiter/admin route guards; TPO cannot use super-admin user management; super admin creates staff; role cannot be changed via profile; company B gets 404 on company A drives/applicants/rounds/offers; colleagues share access |
| Drives & applications (API) | unverified company cannot submit; draft → submit → TPO approve → student sees it; eligibility enforced; ineligible student blocked when calling the API directly; **concurrent duplicate submits → exactly one application**; invalid transition rejected, valid one works; withdrawal; other student's application is unreadable; bad ObjectId → 400 |
| Policies & audit (API) | only staff change policy; invalid value rejected; change versioned and audit-logged; audit log hidden from students/recruiters |
| Offers (API) | student sees only own offers; company-scoped access; students cannot create/issue |
| Reports (API) | every analytics/report endpoint for TPO; CSV has no formula prefix; XLSX is a valid zip; students/recruiters blocked; placement totals reconcile with the dashboard |
| Notifications, support, import, files (API) | list/unread/read-all; cannot read another user's notification; public contact form; ticket visibility; import dry-run writes nothing and flags bad rows; students cannot import; resume download permissions; fake-extension upload rejected |
| UI lifecycle (Playwright `flow.mjs`) | registration → TPO verifications → drive → approval → apply → shortlist → round → interview → selection → offer → accept, plus reports |

**Known gaps (candidates for future tests):** the three offer policies and offer expiry job are exercised by the UI flow and by manual UAT but have no dedicated API test; e-mail queue retry/backoff and SMTP delivery need an SMTP sandbox; load/performance testing is not included.

## 3. Manual UAT scripts
See `ACCEPTANCE_CHECKLIST.md`. Typical end-to-end: register recruiter → TPO verifies company → recruiter creates drive → TPO approves → student applies → recruiter shortlists, rounds, interview, selection → offer → student accepts → TPO report shows the placement.

## 4. Results at hand-off
Backend: 106/106 pass. Frontend: production build succeeds; 71/71 pages load without console or network errors; full UI lifecycle flow passes.
