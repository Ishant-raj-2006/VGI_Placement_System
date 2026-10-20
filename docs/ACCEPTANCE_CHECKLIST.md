# Acceptance checklist

Tick each item during UAT. "Auto" = covered by automated tests; "Manual" = verify in the UI.

## Accounts & security
- [ ] Student and recruiter can register; TPO/Super Admin cannot self-register (Auto)
- [ ] Wrong password and unknown e-mail show the same message; lockout after repeated failures (Auto)
- [ ] Logout, password change, deactivation end access immediately (Auto)
- [ ] Reset link works once only (Auto)
- [ ] Students cannot open recruiter/admin pages or APIs; recruiters cannot open student/admin ones (Auto)
- [ ] Recruiter of company B cannot see company A's drives, applicants, offers (Auto)
- [ ] Resume / photo / offer documents download only for authorised people (Auto)
- [ ] Production start fails with a default JWT secret (Manual)

## Student data
- [ ] Profile, academic records, skills, projects, resumes can be saved; completion % updates (Manual)
- [ ] Changing verified academic data re-opens verification (Manual)
- [ ] TPO can verify, reject and correct (with reason, audited) (Manual)
- [ ] Bulk import: dry-run writes nothing; errors listed per row (Auto)
- [ ] Duplicate-student report appears (Manual)

## Companies & drives
- [ ] Company verification: approve / reject / suspend (Manual)
- [ ] Unverified company cannot submit a drive (Auto)
- [ ] Drive: draft → submit → approve → published; request-changes and reject paths (Auto/Manual)
- [ ] Editing rules creates a new rules version; old applications keep their snapshot (Manual)
- [ ] Paused / closed / past-deadline drives reject applications (Manual)

## Eligibility & applications
- [ ] Spec matrix (CGPA boundary, branch, backlog, year, missing data → pending) (Auto)
- [ ] Student sees the reason for ineligibility (Manual)
- [ ] Ineligible student cannot apply even through direct API calls (Auto)
- [ ] Only one application per student per drive, including simultaneous clicks (Auto)
- [ ] Invalid status transitions are refused; shortlisted ≠ selected ≠ offered (Auto)
- [ ] Bulk actions need explicit confirmation (Manual)

## Recruitment & offers
- [ ] Rounds, participants, results, interviews, reschedule with notification (Manual/UI flow)
- [ ] Selection outcome; offer draft → issue → accept; decline; withdraw; revise (UI flow/Manual)
- [ ] Offer policy variants behave as documented (Manual — change policy and issue two offers)
- [ ] Expired offer cannot be accepted (Manual — set a short deadline; job runs every 5 minutes)

## Notifications
- [ ] In-app notifications appear for approvals, status changes, interviews, offers (Manual)
- [ ] E-mail rows are queued and delivered when SMTP is configured; failures retry with backoff (Manual)

## Reports & governance
- [ ] Dashboard numbers reconcile with reports (Auto)
- [ ] Placed students are counted once; annual CTC and monthly stipend are not mixed (Manual)
- [ ] CSV / XLSX exports open correctly and contain no formula injection (Auto)
- [ ] Policy changes are versioned and appear in the audit log (Auto)
- [ ] Audit log is visible to TPO/Admin only (Auto)
- [ ] Tickets can be raised and answered; requester is notified (Auto/Manual)
- [ ] Super Admin: create staff, change role, unlock, revoke sessions; last Super Admin protected (Manual)

## Quality
- [ ] `npm test` passes (106 tests) and `vite build` succeeds
- [ ] All pages load without console errors (Playwright smoke) and work on a phone-width screen
- [ ] Keyboard-only navigation works; dialogs trap focus; contrast is readable in light and dark mode
- [ ] Backup and restore tested; deployment guide followed on a clean machine
