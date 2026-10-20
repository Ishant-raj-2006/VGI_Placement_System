import {
  Application,
  ApplicationEvent,
  PlacementDrive,
  Company,
  StudentProfile,
  Resume,
  Offer,
} from '../models/index.js';
import { APP_STATUS, APPROVAL, PUBLICATION, COMPANY_STATUS, ELIGIBILITY, OFFER_STATUS } from '../constants/index.js';
import { AppError, conflict, notFound, unprocessable, forbidden } from '../utils/AppError.js';
import { evaluateEligibility, buildSnapshot } from './eligibility.service.js';
import { assertTransition } from './statusMachine.js';
import { getAllPolicies } from './policy.service.js';
import { notify } from './notification.service.js';
import { idEq } from '../utils/helpers.js';

/** Is this drive currently accepting applications? (server clock is authoritative - BR-04, BR-14) */
export function driveOpenState(drive, company, at = new Date()) {
  if (!drive) return { open: false, code: 'DRIVE_NOT_FOUND', message: 'Drive not found' };
  if (drive.approvalStatus !== APPROVAL.APPROVED) return { open: false, code: 'DRIVE_NOT_APPROVED', message: 'This drive is not approved' };
  if (drive.publicationStatus === PUBLICATION.CLOSED) return { open: false, code: 'DRIVE_CLOSED', message: 'This drive is closed' };
  if (drive.publicationStatus === PUBLICATION.CANCELLED) return { open: false, code: 'DRIVE_CANCELLED', message: 'This drive has been cancelled' };
  if (drive.publicationStatus === PUBLICATION.PAUSED) return { open: false, code: 'DRIVE_PAUSED', message: 'This drive is paused by the placement cell' };
  if (drive.publicationStatus !== PUBLICATION.PUBLISHED) return { open: false, code: 'DRIVE_NOT_PUBLISHED', message: 'This drive is not published' };
  if (company && company.verificationStatus !== COMPANY_STATUS.VERIFIED) {
    return { open: false, code: 'COMPANY_NOT_VERIFIED', message: 'The company is not verified' };
  }
  if (at < drive.applicationOpensAt) return { open: false, code: 'NOT_OPEN_YET', message: 'Applications have not opened yet' };
  if (at > drive.applicationDeadline) return { open: false, code: 'DEADLINE_PASSED', message: 'The application deadline has passed' };
  return { open: true };
}

/** Appends an application event (history) - BR-12 traceability */
export async function recordEvent({ application, from, to, actor, actorRole, reason }) {
  return ApplicationEvent.create({
    applicationId: application._id,
    driveId: application.driveId,
    actorId: actor?._id,
    actorRole: actorRole || actor?.role || 'system',
    fromStatus: from ?? null,
    toStatus: to,
    reason,
  });
}

/**
 * Atomic status transition. The update is conditional on the status we validated against, so two concurrent
 * recruiters/students cannot both win from the same prior state.
 */
export async function transitionApplication(application, to, { actor, actorRole, reason, extraSet = {} } = {}) {
  const role = actorRole || actor?.role || 'system';
  const from = application.status;
  assertTransition(from, to, role);
  const updated = await Application.findOneAndUpdate(
    { _id: application._id, status: from },
    { $set: { status: to, statusUpdatedAt: new Date(), statusReason: reason, ...extraSet } },
    { new: true }
  );
  if (!updated) throw conflict('The application status changed in the meantime. Please refresh and retry.', 'STATUS_CONFLICT');
  await recordEvent({ application: updated, from, to, actor, actorRole: role, reason });
  return updated;
}

/**
 * Student applies to a drive.
 * Order of checks (all server-side; the frontend only mirrors them):
 *   drive exists/approved/published/company verified -> window open -> profile -> offer policy -> eligibility (re-evaluated)
 *   -> resume -> create (unique index guards duplicates/concurrency) -> event -> notifications.
 */
export async function submitApplication({ user, driveId, resumeId }) {
  const policies = await getAllPolicies();
  const drive = await PlacementDrive.findById(driveId);
  if (!drive) throw notFound('Drive not found');
  const company = await Company.findById(drive.companyId);
  const state = driveOpenState(drive, company);
  if (!state.open) throw new AppError(state.code === 'NOT_OPEN_YET' ? 409 : 403, state.code, state.message);

  const profile = await StudentProfile.findOne({ userId: user._id });
  if (!profile) throw unprocessable('Please complete your student profile first', 'PROFILE_REQUIRED');

  // Offer policy: after accepting an offer, further applications may be restricted
  if (policies.blockApplicationsAfterAccept) {
    const accepted = await Offer.exists({ studentId: profile._id, status: OFFER_STATUS.ACCEPTED, isCurrent: true });
    if (accepted) throw forbidden('You have already accepted an offer, so new applications are not allowed.', 'APPLICATIONS_BLOCKED_AFTER_ACCEPT');
  }

  // Eligibility is evaluated again on the server at submit time (criteria/deadline may have changed since the page loaded)
  const evaluation = evaluateEligibility(profile.toObject(), drive.toObject(), {
    requireVerification: policies.requireAcademicVerification,
    globalMaxActiveBacklogs: policies.maxActiveBacklogsGlobal,
  });
  if (evaluation.result === ELIGIBILITY.INELIGIBLE) {
    throw new AppError(403, 'NOT_ELIGIBLE', 'You are not eligible for this drive', { reasons: evaluation.reasons });
  }
  if (evaluation.result === ELIGIBILITY.PENDING && !policies.allowApplyWhenPendingVerification) {
    throw new AppError(403, 'PENDING_VERIFICATION', 'Your academic records must be verified by the placement cell before you can apply', {
      reasons: evaluation.reasons,
    });
  }

  // Resume
  let resume = null;
  if (resumeId) {
    resume = await Resume.findOne({ _id: resumeId, studentId: profile._id, isActive: true });
    if (!resume) throw unprocessable('Selected resume not found', 'RESUME_NOT_FOUND');
  } else {
    resume = await Resume.findOne({ studentId: profile._id, isActive: true }).sort({ uploadedAt: -1 });
  }
  if (!resume && policies.requireResumeForApplication) {
    throw unprocessable('Please upload a resume before applying', 'RESUME_REQUIRED');
  }

  // Re-apply after withdrawal (only if policy allows). The unique index means we reactivate the same application.
  const existing = await Application.findOne({ studentId: profile._id, driveId });
  if (existing) {
    if (existing.status === APP_STATUS.WITHDRAWN && policies.allowReapplyAfterWithdraw) {
      const reapplied = await transitionApplication(existing, APP_STATUS.APPLIED, {
        actor: user,
        actorRole: 'system',
        reason: 'Re-applied after withdrawal',
        extraSet: { resumeId: resume?._id, eligibilitySnapshot: buildSnapshot(evaluation, profile.toObject()), appliedAt: new Date() },
      });
      return { application: reapplied, evaluation };
    }
    throw conflict('You have already applied to this drive', 'DUPLICATE_APPLICATION');
  }

  let application;
  try {
    application = await Application.create({
      studentId: profile._id,
      userId: user._id,
      driveId: drive._id,
      companyId: drive.companyId,
      resumeId: resume?._id,
      status: APP_STATUS.APPLIED,
      eligibilitySnapshot: buildSnapshot(evaluation, profile.toObject()),
    });
  } catch (err) {
    if (err?.code === 11000) throw conflict('You have already applied to this drive', 'DUPLICATE_APPLICATION');
    throw err;
  }

  await recordEvent({ application, from: null, to: APP_STATUS.APPLIED, actor: user, actorRole: 'student', reason: 'Application submitted' });

  // Notifications are fire-and-forget: they can never fail the (already committed) application.
  notify(user._id, {
    type: 'application_submitted',
    title: 'Application submitted',
    message: `Your application for "${drive.jobTitle}" at ${company.name} has been submitted.`,
    relatedEntity: { kind: 'application', id: application._id },
  });
  return { application, evaluation };
}

/** Student withdraws (policy-controlled). */
export async function withdrawApplication({ user, applicationId }) {
  const policies = await getAllPolicies();
  if (!policies.allowWithdrawal) throw forbidden('Withdrawing applications is not permitted by the placement policy', 'WITHDRAW_NOT_ALLOWED');
  const profile = await StudentProfile.findOne({ userId: user._id });
  const application = await Application.findOne({ _id: applicationId, studentId: profile?._id });
  if (!application) throw notFound('Application not found');
  const blocked = [APP_STATUS.SELECTED, APP_STATUS.OFFERED, APP_STATUS.OFFER_ACCEPTED];
  if (blocked.includes(application.status)) {
    throw conflict('Applications that are selected or have an offer cannot be withdrawn here. Please decline the offer or contact the placement cell.', 'WITHDRAW_BLOCKED');
  }
  if (policies.withdrawalDeadlineHoursBeforeApplicationClose > 0) {
    const drive = await PlacementDrive.findById(application.driveId);
    const cutoff = new Date(drive.applicationDeadline.getTime() - policies.withdrawalDeadlineHoursBeforeApplicationClose * 3600 * 1000);
    if (new Date() > cutoff) throw conflict('The withdrawal window for this drive has closed', 'WITHDRAW_WINDOW_CLOSED');
  }
  return transitionApplication(application, APP_STATUS.WITHDRAWN, { actor: user, actorRole: 'student', reason: 'Withdrawn by student' });
}

/** Recruiter-scoped lookup: an application is only reachable through the recruiter's own company (BR-08). */
export async function getCompanyApplication(applicationId, companyId) {
  const app = await Application.findOne({ _id: applicationId, companyId });
  if (!app) throw notFound('Application not found'); // 404, not 403: do not reveal other companies' records
  return app;
}

export async function notifyStudentOfStatus(application, title, message, type = 'application_status') {
  return notify(application.userId, { type, title, message, relatedEntity: { kind: 'application', id: application._id } });
}

export { idEq };
