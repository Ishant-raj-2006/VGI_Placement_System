# Architecture

## 1. Overview

```
Browser (React SPA)
   │  HTTPS, JSON, Bearer token
   ▼
Express app ── helmet · CORS allow-list · compression · JSON size limit · input sanitiser · rate limiters
   │
   ├─ /api/v1/auth          register, login, logout, password flows, profile
   ├─ /api/v1/student  /drives      student-only (role check + ownership by query)
   ├─ /api/v1/recruiter  /applications   recruiter-only (company scope in every query)
   ├─ /api/v1/admin         TPO + Super Admin (user mgmt & system = Super Admin only)
   ├─ /api/v1/notifications /support /files   shared, per-resource authorisation
   └─ static React build (optional)
        │
        ▼
   Services (business rules)  ──►  Mongoose models  ──►  MongoDB
        │
        ├─ notification.service ─► Notification + durable EmailLog queue ─► nodemailer (SMTP)
        ├─ audit.service        ─► AuditLog (append-only, secrets redacted)
        └─ storage.service      ─► private directory (S3-style driver can be added behind the same interface)
   Background jobs (in-process): e-mail queue (30 s), offer expiry/reminders (5 min), token/session cleanup (6 h)
```

## 2. Layering rules

| Layer | Responsibility | Must not |
|---|---|---|
| `routes/` | HTTP shape: auth, role, zod validation, call a service, return the envelope | contain business rules |
| `services/` | All business rules and multi-document workflows | know about `req`/`res` |
| `models/` | Schema, indexes, small invariants | call services |
| `middleware/` | Cross-cutting: auth, RBAC, validation, sanitising, uploads, errors | |

Response envelope: `{ "success": true, "data": …, "meta": { page, limit, total, totalPages } }` or `{ "success": false, "error": { "code", "message", "details" } }`.

## 3. Security design (spec part 23)

| Concern | Implementation |
|---|---|
| Authentication | bcrypt hashes; JWT (HS256) carries a session id (`jti`); every request also checks the `Session` collection, so **logout, password change/reset, deactivation and role change revoke access immediately** |
| Brute force | per-account lockout (default 5 failures → 15 min) + IP/e-mail rate limiting; generic "invalid e-mail or password" message |
| Account enumeration | forgot-password / resend-verification return an identical response for known and unknown e-mails |
| Tokens | verification/reset tokens are random, stored **hashed**, one-time, expiring |
| Authorisation | role from the database (never from the token or request body); `requireRole`; recruiter queries always include `companyId`; students' queries always include their own `studentId`; cross-tenant access returns **404** |
| Mass assignment | zod schemas strip unknown fields; self-registration only allows `student`/`recruiter` |
| NoSQL injection | sanitiser removes `$`-operators, dotted and prototype keys from body/query/params; typed validation; ObjectId validation on every `:id` |
| Files | size limit per type, MIME **and** magic-byte check (PDF/DOCX/PNG/JPEG), safe stored names, private storage, downloads streamed after a per-resource permission check, `nosniff`, `no-store` |
| Output hygiene | passwords/tokens never serialised; audit metadata redacted; CSV/XLSX exports neutralise formula injection (`=`, `+`, `-`, `@`) |
| Headers | helmet (CSP incl. `blob:` for authenticated image/PDF viewing), `x-powered-by` off |
| Production guard | `assertProductionConfig()` refuses to start with a weak/default `JWT_SECRET` or dev-token exposure enabled |
| Auditability | login, profile verification, company/drive decisions, policy changes, offers, record corrections, exports, role changes |

## 4. Concurrency & integrity

* `Application` has a **unique index on (studentId, driveId)** — five simultaneous submits create exactly one application.
* Status changes use an atomic `findOneAndUpdate({ _id, status: from })` — two recruiters cannot both move the same application.
* `Offer` has a unique (applicationId, version); revising an offer supersedes the previous version atomically (rolled back on failure).
* Eligibility is **re-evaluated on the server at submit time** and a snapshot (result, reasons, rules version) is stored on the application.

## 5. Notable decisions

| Decision | Why |
|---|---|
| Server-side sessions on top of JWT | The spec requires logout/deactivation to work immediately; pure JWT cannot do that |
| Eligibility as a pure function | Easy to test exhaustively (boundary values, missing data) and reuse for browse, detail and apply |
| Pending verification is never a pass | Prevents ineligible students entering because data was unverified |
| Policies stored as versioned, effective-dated rows | Policy changes must not silently rewrite past decisions; history is queryable |
| Analytics without `$lookup`/`$facet` | Portable across MongoDB-compatible engines; joins done in JS on bounded sets |
| Compensation kinds never mixed | Annual CTC and monthly stipend are separate groups in reports |
| In-process jobs | Simple for one instance; for several instances run `JOBS_ENABLED=true` on exactly one (see DEPLOYMENT.md) |

## 6. Frontend

* Single-page app, React Router v6, role-guarded route trees `/student/*`, `/recruiter/*`, `/admin/*`.
* `lib/api.js` — fetch wrapper (bearer token, envelope unwrapping, `ApiError` with field errors, authenticated blob downloads).
* `components/ui.jsx` — design system: tables, pagination, filters, modals, confirm dialogs, toasts, badges, tabs, timeline, bar lists.
* Every list has loading, empty and error states; destructive actions use confirmation dialogs; bulk actions require an explicit confirm tick.
* Accessible: labels bound to inputs, `aria-*` on dialogs/tabs/progress, focus management in dialogs, skip link, visible focus, reduced-motion support, dark-mode aware.
* The UI never decides business outcomes — eligibility, transitions and permissions are enforced by the API.
