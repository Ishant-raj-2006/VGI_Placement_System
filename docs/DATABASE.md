# Database design (MongoDB)

22 collections, defined with Mongoose in `backend/src/models/`. IDs are ObjectIds; all collections carry `createdAt`/`updatedAt`. Run `npm run sync-indexes` on deploy to build/verify indexes.

## Relationships

```
User 1─1 StudentProfile 1─* AcademicRecord / StudentProject / Resume
User *─1 Company  (via CompanyUser: owner | hr_manager | recruiter)
Company 1─* PlacementDrive 1─* DriveRuleVersion
PlacementDrive 1─* Application *─1 StudentProfile      (unique studentId+driveId)
Application 1─* ApplicationEvent                        (immutable status history)
PlacementDrive 1─* RecruitmentRound 1─* RoundParticipant (*─1 Application)
RecruitmentRound 1─* Interview (*─1 Application)
Application 1─* Offer (versioned)
User 1─* Notification 1─* EmailLog ;  User 1─* Session / Token
Policy (versioned key/value) · AuditLog (append-only) · Ticket
```

## Collections & indexes

| Collection (model) | Purpose / key fields | Indexes |
|---|---|---|
| `users` (User) | name, email, passwordHash, role, accountStatus, facultyProvisioned, mustChangePassword, mustCompleteProfile, failedLoginAttempts, lockedUntil, lastLoginAt, emailVerifiedAt, notification prefs | unique `email`; `role+accountStatus` |
| `studentProfiles` (StudentProfile) | userId, studentId, rollNumber, optional department, degree, graduationYear, personal (including date of birth), skills, interests, `academicSummary.{entered,verified}` (cgpa, backlogs, 10th/12th/diploma %), verificationStatus (`pending_verification`/`verified`/`correction_required`…), completion, photo | unique `userId`, `studentId`, `rollNumber`; `department+graduationYear`; `verificationStatus` |
| `academicRecords` (AcademicRecord) | studentId, recordType (class_10/class_12/diploma/semester/degree_completion), semester, score + scale, backlogs, verification status/by/at/remark | `studentId+recordType+semester` |
| `studentProjects` (StudentProject) | title, description, technologies, links, dates, role | `studentId+createdAt` |
| `resumes` (Resume) | studentId, label, file metadata (stored name, MIME, size, sha256), isActive | `studentId+isActive+uploadedAt` |
| `companies` (Company) | name, nameKey (normalised), industry, website, contacts, verificationStatus (`pending/under_review/verified/rejected/suspended`), reviewer, remarks | unique `nameKey`; `verificationStatus+createdAt` |
| `companyUsers` (CompanyUser) | companyId, userId, companyRole (owner/hr_manager/recruiter), status | unique `companyId+userId`; **unique `userId` (one company per recruiter account)**; `companyId+status` |
| `placementDrives` (PlacementDrive) | companyId, title, role, employmentType, workMode, location, compensation `{kind: annual_ctc|monthly_stipend, min, max}`, vacancies, allowedDepartments, graduationYears, eligibilityRules, rulesVersion, applicationDeadline, approvalStatus, publicationStatus, counters | `publicationStatus+applicationDeadline`; `companyId+createdAt`; `approvalStatus+submittedAt`; `allowedDepartments`; `graduationYears` |
| `driveRuleVersions` (DriveRuleVersion) | driveId, version, snapshot of rules, changedBy | unique `driveId+version` |
| `applications` (Application) | studentId, driveId, companyId, resumeId, status, `eligibilitySnapshot` {result, reasons, checks, rulesVersion}, appliedAt, selection outcome | **unique `studentId+driveId`**; `driveId+status`; `studentId+appliedAt`; `companyId+status` |
| `applicationEvents` (ApplicationEvent) | applicationId, fromStatus, toStatus, actor, reason | `applicationId+createdAt`; `driveId+toStatus` |
| `recruitmentRounds` (RecruitmentRound) | driveId, sequence, name, type, status, schedule | `driveId+sequence` |
| `roundParticipants` (RoundParticipant) | roundId, applicationId, result (pending/passed/failed/on_hold/absent), score, feedback | unique `roundId+applicationId`; `applicationId`; `driveId+result` |
| `interviews` (Interview) | roundId, applicationId, startsAt/endsAt, mode, location/link, interviewers, status, reschedule history | unique `roundId+applicationId`; `applicationId+startsAt`; `driveId+startsAt` |
| `offers` (Offer) | applicationId, studentId, companyId, driveId, version, status (`draft/issued/accepted/declined/expired/withdrawn`), role, compensation `{kind,amount}`, joiningDate, responseDeadline, document | unique `applicationId+version`; `studentId+status`; `companyId+status`; `driveId+status`; `status+responseDeadline` |
| `notifications` (Notification) | userId, type, title, message, link, readAt | `userId+createdAt`; `userId+readAt` |
| `emailLogs` (EmailLog) | notificationId, to, subject, body, providerStatus (queued/sent/failed), attempts, nextAttemptAt, lastError | `providerStatus+nextAttemptAt`; `notificationId` |
| `auditLogs` (AuditLog) | actorId, action, entityType, entityId, before/after/metadata (redacted), ip, createdAt | `entityType+entityId`; `createdAt`; `actorId+createdAt`; `action+createdAt` |
| `sessions` (Session) | userId, jti, expiresAt, revokedAt, userAgent, ip | unique `jti`; `userId+revokedAt`; `expiresAt` |
| `tokens` (Token) | userId, type (email_verify/password_reset), tokenHash, expiresAt, usedAt | unique `tokenHash`; `userId+type`; `expiresAt` |
| `policies` (Policy) | key, category, value, effectiveFrom, note, createdBy — **one row per change, never updated** | `key+effectiveFrom` |
| `tickets` (Ticket) | type (complaint/correction_request/support/contact), subject, message, status, response, relatedEntity | `status+createdAt`; `createdBy+createdAt` |

## Integrity guarantees

* Unique indexes enforce: one account per e-mail; one application per student per drive; one offer version per application; one participant/interview per round per application.
* Money is stored as numbers with an explicit `kind` (annual CTC vs monthly stipend); the two are never summed or averaged together.
* Verified vs student-entered academic values are stored separately (`academicSummary.verified` vs `.entered`); eligibility uses the verified set when verification is required.
* Audit and event collections are append-only from the application's point of view (no update/delete routes exist).
* Files are stored on disk (private directory); only metadata is in MongoDB.
