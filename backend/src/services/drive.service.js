import { PlacementDrive, DriveRuleVersion, RecruitmentRound, Company, Application, StudentProfile } from '../models/index.js';
import { APPROVAL, PUBLICATION, COMPANY_STATUS, COMPENSATION_UNIT_BY_KIND, APP_STATUS } from '../constants/index.js';
import { AppError, badRequest, conflict, notFound } from '../utils/AppError.js';
import { getAllPolicies } from './policy.service.js';
import { notify } from './notification.service.js';
import { normalizeDept } from '../utils/helpers.js';

/** Fields recruiters may set on a drive. Anything else in the payload is dropped by zod before reaching here. */
export const EDITABLE_DRIVE_FIELDS = [
  'jobTitle', 'description', 'responsibilities', 'qualifications', 'requiredSkills', 'employmentType', 'workMode', 'locations',
  'vacancies', 'compensation', 'eligibilityRules', 'allowedDepartments', 'graduationYears', 'applicationOpensAt',
  'applicationDeadline', 'driveStartDate', 'recruitmentSchedule', 'selectionProcess',
];

// Fields whose change affects students already looking at / applied to the drive (versioned + notified)
const MATERIAL_FIELDS = ['eligibilityRules', 'allowedDepartments', 'graduationYears', 'applicationOpensAt', 'applicationDeadline', 'compensation', 'employmentType', 'jobTitle'];

export function normalizeDrivePayload(data) {
  const out = { ...data };
  if (out.allowedDepartments) out.allowedDepartments = [...new Set(out.allowedDepartments.map(normalizeDept))];
  if (out.graduationYears) out.graduationYears = [...new Set(out.graduationYears.map(Number))].sort();
  if (out.compensation) {
    const unit = COMPENSATION_UNIT_BY_KIND[out.compensation.kind];
    out.compensation = { ...out.compensation, unit, currency: (out.compensation.currency || 'INR').toUpperCase() };
    if (out.compensation.min != null && out.compensation.max != null && out.compensation.min > out.compensation.max) {
      throw badRequest('Minimum compensation cannot exceed the maximum', 'INVALID_COMPENSATION');
    }
  }
  if (out.applicationOpensAt && out.applicationDeadline && new Date(out.applicationDeadline) <= new Date(out.applicationOpensAt)) {
    throw badRequest('Application deadline must be after the opening date', 'INVALID_DATES');
  }
  return out;
}

function snapshotOf(drive) {
  return {
    jobTitle: drive.jobTitle,
    employmentType: drive.employmentType,
    eligibilityRules: drive.eligibilityRules?.toObject ? drive.eligibilityRules.toObject() : drive.eligibilityRules,
    allowedDepartments: drive.allowedDepartments,
    graduationYears: drive.graduationYears,
    applicationOpensAt: drive.applicationOpensAt,
    applicationDeadline: drive.applicationDeadline,
    compensation: drive.compensation?.toObject ? drive.compensation.toObject() : drive.compensation,
  };
}

export async function createDrive({ company, user, data }) {
  const payload = normalizeDrivePayload(data);
  const { selectionProcess = [], ...rest } = payload;
  const drive = await PlacementDrive.create({
    ...rest,
    selectionProcess,
    companyId: company._id,
    createdBy: user._id,
    approvalStatus: APPROVAL.DRAFT,
    publicationStatus: PUBLICATION.UNPUBLISHED,
  });
  await DriveRuleVersion.create({ driveId: drive._id, version: 1, snapshot: snapshotOf(drive), changedBy: user._id, changeSummary: 'Initial version' });
  await syncRoundsFromPlan(drive);
  return drive;
}

/** Creates RecruitmentRound documents from the planned selection process (only while no rounds exist yet). */
export async function syncRoundsFromPlan(drive) {
  const existing = await RecruitmentRound.countDocuments({ driveId: drive._id });
  if (existing || !drive.selectionProcess?.length) return;
  await RecruitmentRound.insertMany(
    drive.selectionProcess.map((p, i) => ({ driveId: drive._id, name: p.name, type: p.type, isOptional: p.isOptional, sequence: i + 1 }))
  );
}

export async function updateDrive({ drive, user, data, actorRole }) {
  const policies = await getAllPolicies();
  const wasLive = [APPROVAL.APPROVED].includes(drive.approvalStatus) || drive.publicationStatus === PUBLICATION.PUBLISHED;
  if ([PUBLICATION.CLOSED, PUBLICATION.CANCELLED].includes(drive.publicationStatus)) {
    throw conflict('Closed or cancelled drives cannot be edited', 'DRIVE_LOCKED');
  }
  if ([APPROVAL.SUBMITTED, APPROVAL.UNDER_REVIEW].includes(drive.approvalStatus)) {
    throw conflict('This drive is under review. Wait for the decision or ask the placement cell to request changes.', 'DRIVE_UNDER_REVIEW');
  }
  if (drive.approvalStatus === APPROVAL.REJECTED) throw conflict('Rejected drives cannot be edited. Create a new drive instead.', 'DRIVE_REJECTED');

  const payload = normalizeDrivePayload({ ...data, ...(data.applicationOpensAt || data.applicationDeadline ? {
    applicationOpensAt: data.applicationOpensAt || drive.applicationOpensAt,
    applicationDeadline: data.applicationDeadline || drive.applicationDeadline,
  } : {}) });

  const before = snapshotOf(drive);
  const { selectionProcess, ...rest } = payload;
  drive.set(rest);
  if (selectionProcess) drive.selectionProcess = selectionProcess;

  const materialChanged = MATERIAL_FIELDS.some((f) => payload[f] !== undefined && JSON.stringify(before[f]) !== JSON.stringify(snapshotOf(drive)[f]));
  let versioned = false;
  if (materialChanged) {
    drive.rulesVersion += 1;
    versioned = true;
    if (wasLive && policies.requireReapprovalOnPublishedEdit) {
      // Policy: edits to an approved/published drive send it back for TPO review
      drive.approvalStatus = APPROVAL.SUBMITTED;
      drive.publicationStatus = PUBLICATION.PAUSED;
      drive.submittedAt = new Date();
      drive.statusReason = 'Edited after approval - re-approval required';
    }
  }
  if (drive.approvalStatus === APPROVAL.CHANGES_REQUESTED) drive.statusReason = undefined;
  await drive.save();

  if (versioned) {
    await DriveRuleVersion.create({
      driveId: drive._id,
      version: drive.rulesVersion,
      snapshot: snapshotOf(drive),
      changedBy: user._id,
      changeSummary: `Updated by ${actorRole}`,
    });
    if (wasLive) await notifyApplicantsOfChange(drive);
  }
  return { drive, versioned };
}

/** Criteria/date changes on a live drive are communicated to everyone who already applied (spec 6.3). */
export async function notifyApplicantsOfChange(drive) {
  const apps = await Application.find({ driveId: drive._id, status: { $nin: [APP_STATUS.WITHDRAWN, APP_STATUS.REJECTED] } }).select('userId').lean();
  if (!apps.length) return;
  await notify(apps.map((a) => a.userId), {
    type: 'drive_changed',
    title: 'Drive details updated',
    message: `The eligibility criteria or dates for "${drive.jobTitle}" were updated (version ${drive.rulesVersion}). Please review the drive details.`,
    relatedEntity: { kind: 'drive', id: drive._id },
  });
}

export async function submitDrive({ drive, user }) {
  if (![APPROVAL.DRAFT, APPROVAL.CHANGES_REQUESTED].includes(drive.approvalStatus)) {
    throw conflict(`A drive in "${drive.approvalStatus}" state cannot be submitted`, 'INVALID_DRIVE_STATE');
  }
  const company = await Company.findById(drive.companyId);
  if (company.verificationStatus !== COMPANY_STATUS.VERIFIED) {
    throw new AppError(403, 'COMPANY_NOT_VERIFIED', 'Only verified companies can submit drives for approval'); // BR-02
  }
  if (drive.applicationDeadline <= new Date()) throw badRequest('The application deadline is already in the past', 'INVALID_DATES');
  const policies = await getAllPolicies();
  drive.approvalStatus = APPROVAL.SUBMITTED;
  drive.submittedAt = new Date();
  drive.statusReason = undefined;
  await drive.save();
  if (!policies.requireDriveApproval) {
    // Colleges that do not require TPO approval auto-approve verified companies' drives
    return reviewDrive({ drive, action: 'approve', actor: user, system: true });
  }
  return drive;
}

/**
 * TPO decision engine. Allowed moves:
 *   review  : submitted -> under_review
 *   approve : submitted|under_review -> approved (+ published when policy autoPublishOnApproval)
 *   reject  : submitted|under_review -> rejected (reason required)
 *   request_changes : submitted|under_review -> changes_requested (reason required)
 *   publish : approved + unpublished|paused -> published   (BR-02, BR-03)
 *   pause / resume / close / cancel
 */
export async function reviewDrive({ drive, action, actor, reason, system = false }) {
  const policies = await getAllPolicies();
  const company = await Company.findById(drive.companyId);
  const inReview = [APPROVAL.SUBMITTED, APPROVAL.UNDER_REVIEW].includes(drive.approvalStatus);
  const needReason = ['reject', 'request_changes', 'cancel', 'pause'];
  if (needReason.includes(action) && !(reason && reason.trim())) throw badRequest('A reason is required for this action', 'REASON_REQUIRED');

  const bad = (msg) => conflict(msg || `Action "${action}" is not allowed while the drive is ${drive.approvalStatus}/${drive.publicationStatus}`, 'INVALID_DRIVE_STATE');
  let notifyRecruiter;

  switch (action) {
    case 'review':
      if (drive.approvalStatus !== APPROVAL.SUBMITTED) throw bad();
      drive.approvalStatus = APPROVAL.UNDER_REVIEW;
      break;
    case 'approve':
      if (!inReview) throw bad();
      if (company.verificationStatus !== COMPANY_STATUS.VERIFIED) throw new AppError(403, 'COMPANY_NOT_VERIFIED', 'Verify the company before approving its drives');
      drive.approvalStatus = APPROVAL.APPROVED;
      drive.approvedAt = new Date();
      drive.reviewedBy = actor?._id;
      drive.statusReason = undefined;
      if (policies.autoPublishOnApproval) {
        drive.publicationStatus = PUBLICATION.PUBLISHED;
        drive.publishedAt = new Date();
      }
      notifyRecruiter = { title: 'Drive approved', message: `Your drive "${drive.jobTitle}" was approved${drive.publicationStatus === PUBLICATION.PUBLISHED ? ' and is now published' : ''}.` };
      break;
    case 'reject':
      if (!inReview) throw bad();
      drive.approvalStatus = APPROVAL.REJECTED;
      drive.publicationStatus = PUBLICATION.UNPUBLISHED;
      drive.statusReason = reason;
      drive.reviewedBy = actor?._id;
      notifyRecruiter = { title: 'Drive rejected', message: `Your drive "${drive.jobTitle}" was rejected: ${reason}` };
      break;
    case 'request_changes':
      if (!inReview) throw bad();
      drive.approvalStatus = APPROVAL.CHANGES_REQUESTED;
      drive.statusReason = reason;
      drive.reviewedBy = actor?._id;
      notifyRecruiter = { title: 'Changes requested on your drive', message: `The placement cell requested changes to "${drive.jobTitle}": ${reason}` };
      break;
    case 'publish':
      if (drive.approvalStatus !== APPROVAL.APPROVED) throw new AppError(403, 'DRIVE_NOT_APPROVED', 'Only approved drives can be published'); // BR-03
      if (![PUBLICATION.UNPUBLISHED, PUBLICATION.PAUSED].includes(drive.publicationStatus)) throw bad();
      if (company.verificationStatus !== COMPANY_STATUS.VERIFIED) throw new AppError(403, 'COMPANY_NOT_VERIFIED', 'Unverified companies cannot publish drives'); // BR-02
      drive.publicationStatus = PUBLICATION.PUBLISHED;
      drive.publishedAt = drive.publishedAt || new Date();
      break;
    case 'pause':
      if (drive.publicationStatus !== PUBLICATION.PUBLISHED) throw bad();
      drive.publicationStatus = PUBLICATION.PAUSED;
      drive.statusReason = reason;
      notifyRecruiter = { title: 'Drive paused', message: `"${drive.jobTitle}" was paused by the placement cell: ${reason}` };
      break;
    case 'resume':
      if (drive.publicationStatus !== PUBLICATION.PAUSED || drive.approvalStatus !== APPROVAL.APPROVED) throw bad();
      if (company.verificationStatus !== COMPANY_STATUS.VERIFIED) throw new AppError(403, 'COMPANY_NOT_VERIFIED', 'Company must be verified to resume its drives');
      drive.publicationStatus = PUBLICATION.PUBLISHED;
      drive.statusReason = undefined;
      break;
    case 'close':
      if (![PUBLICATION.PUBLISHED, PUBLICATION.PAUSED].includes(drive.publicationStatus)) throw bad();
      drive.publicationStatus = PUBLICATION.CLOSED;
      drive.closedAt = new Date();
      break;
    case 'cancel':
      if ([PUBLICATION.CLOSED, PUBLICATION.CANCELLED].includes(drive.publicationStatus)) throw bad();
      drive.publicationStatus = PUBLICATION.CANCELLED;
      drive.statusReason = reason;
      drive.closedAt = new Date();
      notifyRecruiter = { title: 'Drive cancelled', message: `"${drive.jobTitle}" was cancelled by the placement cell: ${reason}` };
      break;
    default:
      throw badRequest('Unknown action', 'UNKNOWN_ACTION');
  }
  await drive.save();

  if (notifyRecruiter) {
    notify(drive.createdBy, { type: 'drive_review', ...notifyRecruiter, relatedEntity: { kind: 'drive', id: drive._id } });
  }
  if (['approve', 'publish', 'resume'].includes(action) && drive.publicationStatus === PUBLICATION.PUBLISHED && !drive.announcedAt) {
    drive.announcedAt = new Date();
    await drive.save();
    await announceDrive(drive, company);
  }
  if (['cancel', 'close', 'pause'].includes(action)) await notifyApplicantsOfDriveStateChange(drive, action, reason);
  return drive;
}

async function announceDrive(drive, company) {
  const filter = { };
  if (drive.allowedDepartments?.length) filter.department = { $in: drive.allowedDepartments };
  if (drive.graduationYears?.length) filter.graduationYear = { $in: drive.graduationYears };
  const students = await StudentProfile.find(filter).select('userId').lean();
  if (!students.length) return;
  await notify(students.map((s) => s.userId), {
    type: 'drive_published',
    title: 'New placement drive',
    message: `${company.name} is hiring for "${drive.jobTitle}". Apply before ${drive.applicationDeadline.toDateString()}.`,
    relatedEntity: { kind: 'drive', id: drive._id },
  });
}

async function notifyApplicantsOfDriveStateChange(drive, action, reason) {
  const apps = await Application.find({ driveId: drive._id, status: { $nin: [APP_STATUS.WITHDRAWN, APP_STATUS.REJECTED, APP_STATUS.OFFER_DECLINED] } }).select('userId').lean();
  if (!apps.length) return;
  const verb = { cancel: 'cancelled', close: 'closed', pause: 'paused' }[action];
  await notify(apps.map((a) => a.userId), {
    type: 'recruitment_change',
    title: `Drive ${verb}`,
    message: `"${drive.jobTitle}" has been ${verb}.${reason ? ` Reason: ${reason}` : ''}`,
    relatedEntity: { kind: 'drive', id: drive._id },
  });
}

/** Company suspension: its live drives are paused (or sent for review) per policy. */
export async function applyCompanySuspension(company, actor) {
  const policies = await getAllPolicies();
  const drives = await PlacementDrive.find({ companyId: company._id, publicationStatus: PUBLICATION.PUBLISHED });
  for (const d of drives) {
    d.publicationStatus = PUBLICATION.PAUSED;
    d.statusReason = `Company suspended: ${company.statusReason || ''}`.trim();
    if (policies.suspendedCompanyDrivePolicy === 'review') d.approvalStatus = APPROVAL.UNDER_REVIEW;
    await d.save();
  }
  return drives.length;
}

export async function getDriveOr404(id, extraFilter = {}) {
  const drive = await PlacementDrive.findOne({ _id: id, ...extraFilter });
  if (!drive) throw notFound('Drive not found');
  return drive;
}

/** Student-visible drive filter: approved + published + company verified is enforced at query level. */
export const studentVisibleDriveFilter = () => ({ approvalStatus: APPROVAL.APPROVED, publicationStatus: PUBLICATION.PUBLISHED });
