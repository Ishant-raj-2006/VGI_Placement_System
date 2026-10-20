# Business rules

## 1. Eligibility engine (`services/eligibility.service.js`)

Pure function `evaluateEligibility(student, drive, options)` → `{ result, reasons[], checks[], rulesVersion }`.

* **Results:** `eligible`, `ineligible`, `pending_verification`.
* **Checks (when configured on the drive):** allowed departments, graduation years, degree, minimum CGPA, minimum 10th / 12th % (12th falls back to diploma %), max active backlogs, max total backlogs; plus the college-wide backlog policy. `additionalRequirements` is informational only.
* **Precedence:** a definite failure → `ineligible` (even if other data is unverified); otherwise any missing/unverified required data → `pending_verification`; else `eligible`. Missing data is **never** a pass.
* A configured limit of `0` is a real limit (not "no rule"); empty department/year lists mean "no restriction".
* Comparisons are normalised (case, whitespace, `B.Tech` = `btech`) and CGPA is compared at 2 decimals to avoid float artefacts. Boundary values are inclusive (CGPA = minimum passes).
* Verified values are used when `requireAcademicVerification` is on, otherwise student-entered values.
* Run on browse, detail, and again at apply time; the result and `rulesVersion` are stored on the application as a snapshot. Rule edits create a new `DriveRuleVersion` and do not change past snapshots.

## 2. Application status machine (`constants` + `statusMachine.js`)

```
applied → under_review → shortlisted → assessment ⇄ interview → selected → offered → offer_accepted
   │            │             │              │           │          │          └→ offer_declined (terminal)
   └────────────┴─────────────┴──────────────┴───────────┴──────────┴→ rejected (terminal)
 any active stage → withdrawn (student/admin) ;  withdrawn → applied only if allowReapplyAfterWithdraw
 offered/offer_accepted → selected  when an offer is withdrawn/expires
```

* Full map: `APP_TRANSITIONS`; who may set which status: `STATUS_SETTERS`. Students can only withdraw; recruiters cannot set `offered`/`offer_accepted` directly (only the offer service can).
* **Shortlisted ≠ Selected ≠ Offered ≠ Accepted** — four distinct statuses.
* Transitions are atomic (`findOneAndUpdate` on the expected current status) and every change writes an `ApplicationEvent`.

## 3. Drive lifecycle

`draft → pending approval → (approved | changes requested | rejected) → published ⇄ paused → closed / cancelled`.
* A recruiter can only submit when the company is **verified**.
* `requireDriveApproval` / `autoPublishOnApproval` / `requireReapprovalOnPublishedEdit` policies tune the flow.
* Applications are accepted only while the drive is published and the deadline has not passed (checked server-side).
* Suspending a company pauses its published drives (`suspendedCompanyDrivePolicy = pause`) or sends them to review.

## 4. Offers (`services/offer.service.js`)

Statuses `draft → issued → accepted | declined | expired | withdrawn`. Revising an offer creates a new version and supersedes the old one.

| `offerPolicy` | Behaviour |
|---|---|
| `single_offer` | A student may hold only one active (issued/accepted) offer; new issue is blocked |
| `multiple_offers_one_accept` (default) | Many offers may be issued, but accepting one auto-closes the others (they are withdrawn with a notification) |
| `multiple_accept` | Student may accept several |

Other: response deadline enforced server-side (expired offers cannot be accepted — the maintenance job marks them `expired` and returns the application to `selected`); `blockApplicationsAfterAccept` stops new applications after an acceptance; reminder notification `offerExpiryReminderHours` before the deadline.

## 5. Policy catalogue (`/admin/policies`)

Placement (TPO): `offerPolicy`, `blockApplicationsAfterAccept`, `allowWithdrawal`, `withdrawalDeadlineHoursBeforeApplicationClose`, `allowReapplyAfterWithdraw`, `requireDriveApproval`, `autoPublishOnApproval`, `requireReapprovalOnPublishedEdit`, `allowApplyWhenPendingVerification`, `requireResumeForApplication`, `requireAcademicVerification`, `maxActiveBacklogsGlobal`, `suspendedCompanyDrivePolicy`, `profileRequiredSections`, `departments`, `offerExpiryReminderHours`.
System (Super Admin): `requireEmailVerification`, `allowedStudentEmailDomains`, `sessionTtlHours`, `maxLoginAttempts`, `lockoutMinutes`, `maintenanceMode`.

Each change inserts a new effective-dated row (history preserved, change audited). Reads use the latest row with `effectiveFrom ≤ now` (5-second cache).

## 6. Profile completion

Required sections come from the `profileRequiredSections` policy (default: personal, academic, skills, projects, resume). `percentage = completed required sections / required sections`; 4 of 5 = 80 %. Optional sections never block.

## 7. Metric definitions (returned by the API as `definitions` and shown in the admin UI)

| Metric | Definition |
|---|---|
| totalStudents | Registered student profiles |
| verifiedStudentProfiles | Profiles whose academic record has been verified by the placement cell |
| verifiedCompanies / registeredCompanies | Companies verified / all company accounts |
| activeDrives | Approved and published drives whose deadline has not passed |
| totalApplications | All applications ever submitted (including withdrawn / rejected) |
| shortlisted | Distinct applications that reached "shortlisted" or any later stage |
| studentsPlaced | **Distinct students** holding ≥ 1 accepted offer (3 accepted offers = 1 placed student) |
| offersIssued | Distinct applications for which an offer was issued (revisions count once) |
| offersAccepted / offersDeclined | Offers currently accepted / declined |
| interviewsConducted | Interviews marked completed |
| placementPercentage (department report) | studentsPlaced ÷ totalRegistered students of that department for the selected batch |
| Funnel | A candidate "reaches" a stage when the application history shows it (or the offer was accepted) |
| Salary stats | min / median / average / max, **grouped by compensation kind** (annual CTC and monthly stipend are never mixed) |

## 8. Bulk student import (CSV)

Dry-run first (default): every check runs but nothing is written, and per-row results are returned. A real import creates users + profiles marked verified ("Verified via institutional data import") with an unusable random password; students set a password through **Forgot password**. Valid rows are imported and invalid rows are reported; existing records are not silently overwritten.
