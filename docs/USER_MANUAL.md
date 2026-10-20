# User manual

Open the application URL (local: http://localhost:5173, or http://localhost:5000 when served by the backend). Use **Register** to create a student or recruiter account; TPO and Super Admin accounts are created by an administrator. Forgot your password? Use **Forgot password** on the login page.

---
## Students (`/student`)

1. **Complete your profile** — *Profile* (personal and academic details), *Academic records* (10th, 12th/diploma, each semester), *Skills*, *Experience*, *Projects*, *Resumes* (PDF or DOCX, up to 2 MB, max 5). The completion bar shows what is missing.
2. **Get verified** — *Verification* shows your status. The placement cell checks your academic records against official data. Until you are **verified**, drives whose rules depend on academic data show **Pending verification**. If something is rejected, correct it and the record is re-checked. Editing verified academic data re-opens verification.
3. **Find drives** — *Drives* lists published drives with your result for each: **Eligible**, **Ineligible** (with exact reasons, e.g. "CGPA 6.8 is below the minimum 7") or **Pending verification**. Open a drive to see role, pay, rounds, deadline and the full check list.
4. **Apply** — choose a resume and submit. You can apply once per drive. The system re-checks eligibility and the deadline at the moment you submit.
5. **Track** — *Applications* shows status and a timeline (applied → under review → shortlisted → rounds → selected → offered). You may withdraw while the policy allows it.
6. **Interviews** — *Interviews* shows date, time, mode and link/venue, including reschedules.
7. **Offers** — *Offers* lists your offers with deadline. Accept or decline before the deadline; depending on the college offer policy, accepting one offer may close your others. Read the confirmation carefully — the decision is final.
8. **Notifications, Support, Settings** — in-app (and e-mail) alerts; raise a complaint, correction request or support ticket; change password and notification preferences.

---
## Recruiters (`/recruiter`)

1. **Register** with company details (or join an existing company, which the owner approves). The TPO must **verify your company** before you can submit drives. Check *Company verification* for status and remarks, and resubmit if rejected.
2. **Company & Team** — maintain company profile; owner / HR manager approve members and set roles (recruiter, HR manager).
3. **Create a drive** — *Drives → New drive*: role, employment type, work mode, location, compensation (annual CTC or monthly stipend), vacancies, deadline, allowed departments and graduation years, and eligibility rules (CGPA, backlogs, 10th/12th %). Save as draft, then **Submit for approval**. The TPO may approve, request changes or reject. Editing rules later creates a new rules version; earlier applications keep their original snapshot.
4. **Applicants** — *Drive → Applicants*: filter by status, eligibility, department, year, CGPA, skills; open a candidate to see verified academics, projects, resume and history. **Review**, **Shortlist** or **Reject** individually, or tick several rows and use a **bulk action** (a confirmation is required). Contact details appear after shortlisting.
5. **Rounds & interviews** — *Drive → Rounds*: add rounds (aptitude, coding, technical, HR, GD), add shortlisted candidates, record results, mark the round complete. *Interviews*: schedule with date, mode, link/venue; reschedule — the student is notified and the history is kept.
6. **Selection** — mark a candidate selected / not selected / on hold / further evaluation.
7. **Offers** — create an offer (role, compensation, joining date, response deadline, optional PDF letter). Owner / HR manager **issue**, **revise** (new version) or **withdraw**. The student's response appears on the offer.

---
## TPO and Super Admin (`/admin`)

* **Dashboard** — totals, pending queues (student verifications, company reviews, drive approvals), and the definition of every metric.
* **Students** — search/filter; open a student to **verify** or reject academic records (optionally override a value, with a reason), activate/deactivate, or correct data (reason mandatory; before/after audited). *Import students* accepts a CSV — download the template, run a **dry run**, fix errors, then import (imported students set a password through *Forgot password*). *Duplicates* lists possible duplicate students for manual review.
* **Companies** — review, approve, reject or suspend (suspending pauses that company's published drives).
* **Drives** — *Pending approvals*, then approve / request changes / reject; publish, pause, resume, close, cancel.
* **Applications / Offers / Recruitment** — monitor progress per drive and college-wide.
* **Reports** — placement, department, company, salary and funnel analytics; export CSV / Excel.
* **Policies** — offer policy, withdrawal rules, approval rules, verification requirements, backlog cap, profile sections. Each change is versioned with an effective date.
* **Tickets** — respond to complaints, correction requests and contact messages.
* **Audit log** — who did what, when (filter by action, entity, user, date).
* **Super Admin only** — *Users* (create staff, change roles, activate/deactivate, unlock, revoke sessions) and *System* (health, e-mail queue, session counts). The last active Super Admin cannot be removed.

---
## Tips
* Dark mode follows your operating-system setting.
* Session expires automatically (default 12 hours); changing your password signs out other devices.
* Files open in a new tab through your signed-in session; links cannot be shared with others.
