import { Router } from 'express';
import { z } from 'zod';
import {
  validate, objectIdParams, zReqText, zText, zDate, zStrList, zUrl, zEmail, paginationQuery, zObjectId, zBool,
} from '../middleware/validate.js';
import { authenticate, requireRole, loadCompany } from '../middleware/auth.js';
import { uploadOfferDoc, assertFileMatches, safeFilename } from '../middleware/upload.js';
import { asyncHandler, parsePagination, pageMeta, escapeRegex, normalizeDept } from '../utils/helpers.js';
import { ok, created } from '../utils/response.js';
import {
  Company, CompanyUser, PlacementDrive, Application, ApplicationEvent, StudentProfile, StudentProject, User, Resume,
  RecruitmentRound, RoundParticipant, Interview, Offer, DriveRuleVersion,
} from '../models/index.js';
import {
  ROLES, EMPLOYMENT_TYPES, WORK_MODES, COMPENSATION_KINDS, ROUND_TYPES, ROUND_STATUS, PARTICIPANT_RESULT, INTERVIEW_MODES, INTERVIEW_STATUS,
  SELECTION_OUTCOMES, APP_STATUS, APP_STATUS_LIST, COMPANY_STATUS, PUBLICATION, PROFILE_VERIFICATION, OFFER_STATUS, COMPANY_ROLES,
} from '../constants/index.js';
import { notFound, conflict, badRequest, forbidden } from '../utils/AppError.js';
import * as driveSvc from '../services/drive.service.js';
import * as recruitSvc from '../services/recruitment.service.js';
import * as offerSvc from '../services/offer.service.js';
import { getCompanyApplication, transitionApplication } from '../services/application.service.js';
import { recruiterDashboard } from '../services/analytics.service.js';
import * as storage from '../services/storage.service.js';
import { audit } from '../services/audit.service.js';
import { notify } from '../services/notification.service.js';

export const recruiterRouter = Router();
export const applicationsRouter = Router(); // spec alias: POST /api/v1/applications/:id/shortlist
for (const r of [recruiterRouter, applicationsRouter]) r.use(authenticate, requireRole(ROLES.RECRUITER));

const member = loadCompany(); // any active member of a non-suspended company
const verifiedMember = loadCompany({ requireVerified: true });
const manager = loadCompany({ requireManager: true });
const verifiedManager = loadCompany({ requireVerified: true, requireManager: true });

// =========================================================== dashboard + company
recruiterRouter.get('/dashboard', member, asyncHandler(async (req, res) => ok(res, { company: { name: req.company.name, verificationStatus: req.company.verificationStatus }, ...(await recruiterDashboard(req.company._id)) })));

recruiterRouter.get('/company', member, asyncHandler(async (req, res) => ok(res, { company: req.company, membership: req.membership })));

recruiterRouter.put(
  '/company',
  manager,
  validate({
    body: z.object({
      website: zUrl.optional(), industry: zText(120).optional(), description: zText(3000).optional(), headquarters: zText(200).optional(),
      contactEmail: zEmail.optional(), contactPhone: zText(20).optional(), registrationNumber: zText(60).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    req.company.set(req.body);
    await req.company.save();
    await audit({ actor: req.user, action: 'company.updated', entityType: 'Company', entityId: req.company._id, metadata: { fields: Object.keys(req.body) }, req });
    return ok(res, req.company);
  })
);

recruiterRouter.get('/company/verification', member, asyncHandler(async (req, res) => ok(res, {
  status: req.company.verificationStatus, reason: req.company.statusReason, verifiedAt: req.company.verifiedAt, submittedAt: req.company.submittedForVerificationAt,
  canSubmitDrives: req.company.verificationStatus === COMPANY_STATUS.VERIFIED,
})));

recruiterRouter.post('/company/submit-verification', manager, asyncHandler(async (req, res) => {
  if (![COMPANY_STATUS.REJECTED, COMPANY_STATUS.PENDING].includes(req.company.verificationStatus)) throw conflict(`Company is already ${req.company.verificationStatus}`, 'INVALID_STATE');
  req.company.verificationStatus = COMPANY_STATUS.PENDING;
  req.company.statusReason = undefined;
  req.company.submittedForVerificationAt = new Date();
  await req.company.save();
  return ok(res, req.company);
}));

// team management (owner / HR manager)
recruiterRouter.get('/team', manager, asyncHandler(async (req, res) => {
  const ms = await CompanyUser.find({ companyId: req.company._id, status: { $ne: 'removed' } }).populate('userId', 'name email accountStatus').lean();
  return ok(res, ms.map(({ userId, ...m }) => ({ ...m, user: userId })));
}));
recruiterRouter.post('/team/:id/approve', manager, objectIdParams('id'), asyncHandler(async (req, res) => {
  const m = await CompanyUser.findOneAndUpdate({ _id: req.params.id, companyId: req.company._id, status: 'pending' }, { $set: { status: 'active' } }, { new: true });
  if (!m) throw notFound('Pending request not found');
  notify(m.userId, { type: 'system', title: 'Access approved', message: `You can now manage recruitment for ${req.company.name}.` });
  return ok(res, m);
}));
recruiterRouter.put('/team/:id/role', manager, objectIdParams('id'), validate({ body: z.object({ companyRole: z.enum(COMPANY_ROLES) }) }), asyncHandler(async (req, res) => {
  const m = await CompanyUser.findOne({ _id: req.params.id, companyId: req.company._id });
  if (!m) throw notFound('Member not found');
  if (String(m.userId) === String(req.user._id)) throw forbidden('You cannot change your own role');
  m.companyRole = req.body.companyRole;
  await m.save();
  return ok(res, m);
}));
recruiterRouter.post('/team/:id/remove', manager, objectIdParams('id'), asyncHandler(async (req, res) => {
  const m = await CompanyUser.findOne({ _id: req.params.id, companyId: req.company._id });
  if (!m) throw notFound('Member not found');
  if (m.companyRole === 'owner') throw forbidden('The company owner cannot be removed');
  m.status = 'removed';
  await m.save();
  return ok(res, m);
}));

// =========================================================== drives
const compensationInput = z.object({
  kind: z.enum(COMPENSATION_KINDS),
  currency: z.string().trim().length(3).optional(),
  min: z.coerce.number().min(0).optional(),
  max: z.coerce.number().min(0).optional(),
  ctc: z.coerce.number().min(0).optional(),
  stipend: z.coerce.number().min(0).optional(),
  notes: zText(500).optional(),
});
const rulesInput = z.object({
  degrees: zStrList(10, 60).optional(),
  minimumCgpa: z.coerce.number().min(0).max(10).optional(),
  minimumTenthPercentage: z.coerce.number().min(0).max(100).optional(),
  minimumTwelfthPercentage: z.coerce.number().min(0).max(100).optional(),
  maximumActiveBacklogs: z.coerce.number().int().min(0).optional(),
  maximumTotalBacklogs: z.coerce.number().int().min(0).optional(),
  additionalRequirements: zText(2000).optional(),
});
const driveInput = z.object({
  jobTitle: zReqText(160),
  description: zReqText(10000),
  responsibilities: zText(5000).optional(),
  qualifications: zText(5000).optional(),
  requiredSkills: zStrList(40).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  workMode: z.enum(WORK_MODES).optional(),
  locations: zStrList(20, 120).optional(),
  vacancies: z.coerce.number().int().min(1).optional(),
  compensation: compensationInput,
  eligibilityRules: rulesInput.optional(),
  allowedDepartments: zStrList(40, 40).optional(),
  graduationYears: z.array(z.coerce.number().int().min(2000).max(2100)).max(10).optional(),
  applicationOpensAt: zDate,
  applicationDeadline: zDate,
  driveStartDate: zDate.optional(),
  recruitmentSchedule: z.array(z.object({ label: zReqText(120), date: zDate })).max(20).optional(),
  selectionProcess: z.array(z.object({ name: zReqText(120), type: z.enum(ROUND_TYPES).optional(), isOptional: z.boolean().optional() })).max(15).optional(),
});

async function ownDrive(req) {
  const d = await PlacementDrive.findOne({ _id: req.params.id, companyId: req.company._id }); // company scope in the query (BR-08)
  if (!d) throw notFound('Drive not found');
  return d;
}

recruiterRouter.post('/drives', member, validate({ body: driveInput }), asyncHandler(async (req, res) => {
  const drive = await driveSvc.createDrive({ company: req.company, user: req.user, data: req.body });
  await audit({ actor: req.user, action: 'drive.created', entityType: 'PlacementDrive', entityId: drive._id, metadata: { jobTitle: drive.jobTitle }, req });
  return created(res, drive);
}));

recruiterRouter.get('/drives', member, validate({ query: z.object({ ...paginationQuery, approvalStatus: z.string().max(30).optional(), publicationStatus: z.string().max(30).optional() }) }), asyncHandler(async (req, res) => {
  const pg = parsePagination(req.query);
  const filter = { companyId: req.company._id };
  if (req.query.approvalStatus) filter.approvalStatus = req.query.approvalStatus;
  if (req.query.publicationStatus) filter.publicationStatus = req.query.publicationStatus;
  if (req.query.q) filter.jobTitle = new RegExp(escapeRegex(req.query.q), 'i');
  const [items, total] = await Promise.all([
    PlacementDrive.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(),
    PlacementDrive.countDocuments(filter),
  ]);
  const counts = await Application.aggregate([{ $match: { companyId: req.company._id, driveId: { $in: items.map((d) => d._id) } } }, { $group: { _id: '$driveId', n: { $sum: 1 } } }]);
  const cm = new Map(counts.map((c) => [String(c._id), c.n]));
  return ok(res, items.map((d) => ({ ...d, applicantCount: cm.get(String(d._id)) || 0 })), pageMeta(pg, total));
}));

recruiterRouter.get('/drives/:id', member, objectIdParams('id'), asyncHandler(async (req, res) => {
  const drive = await ownDrive(req);
  const [rounds, byStatus, versions] = await Promise.all([
    RecruitmentRound.find({ driveId: drive._id }).sort({ sequence: 1 }),
    Application.aggregate([{ $match: { driveId: drive._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    DriveRuleVersion.find({ driveId: drive._id }).sort({ version: -1 }).limit(20).lean(),
  ]);
  return ok(res, { drive, rounds, applicationsByStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])), ruleVersions: versions });
}));

recruiterRouter.put('/drives/:id', member, objectIdParams('id'), validate({ body: driveInput.partial() }), asyncHandler(async (req, res) => {
  const drive = await ownDrive(req);
  const { versioned } = await driveSvc.updateDrive({ drive, user: req.user, data: req.body, actorRole: 'recruiter' });
  if (versioned) await audit({ actor: req.user, action: 'drive.eligibility_changed', entityType: 'PlacementDrive', entityId: drive._id, metadata: { rulesVersion: drive.rulesVersion }, req });
  return ok(res, { drive, rulesVersioned: versioned });
}));

recruiterRouter.post('/drives/:id/submit', verifiedMember, objectIdParams('id'), asyncHandler(async (req, res) => {
  const drive = await ownDrive(req);
  const result = await driveSvc.submitDrive({ drive, user: req.user });
  await audit({ actor: req.user, action: 'drive.submitted', entityType: 'PlacementDrive', entityId: drive._id, req });
  return ok(res, result);
}));

recruiterRouter.post('/drives/:id/close', manager, objectIdParams('id'), asyncHandler(async (req, res) => {
  const drive = await ownDrive(req);
  const result = await driveSvc.reviewDrive({ drive, action: 'close', actor: req.user });
  await audit({ actor: req.user, action: 'drive.closed', entityType: 'PlacementDrive', entityId: drive._id, req });
  return ok(res, result);
}));

// =========================================================== applicants
const contactVisible = [APP_STATUS.SHORTLISTED, APP_STATUS.ASSESSMENT, APP_STATUS.INTERVIEW, APP_STATUS.SELECTED, APP_STATUS.OFFERED, APP_STATUS.OFFER_ACCEPTED];

/** Recruiters see only what recruitment needs: verified academics, skills, resume, status. Contact details only once shortlisted. */
function candidateRow(app, profile, user, resume) {
  const v = profile?.academicSummary?.verified;
  const verified = profile?.verificationStatus === PROFILE_VERIFICATION.VERIFIED && !!v;
  return {
    applicationId: app._id,
    status: app.status,
    selectionOutcome: app.selectionOutcome,
    appliedAt: app.appliedAt,
    eligibility: { result: app.eligibilitySnapshot?.result, reasons: app.eligibilitySnapshot?.reasons || [], rulesVersion: app.eligibilitySnapshot?.rulesVersion },
    student: {
      studentProfileId: profile?._id,
      name: user?.name,
      department: profile?.department,
      degree: profile?.degree,
      graduationYear: profile?.graduationYear,
      academicVerified: verified,
      cgpa: verified ? v.cgpa : null,
      activeBacklogs: verified ? v.activeBacklogs : null,
      skills: profile?.skills || [],
      ...(contactVisible.includes(app.status) ? { email: user?.email, contactNumber: profile?.personal?.contactNumber } : {}),
    },
    resume: resume ? { id: resume._id, name: resume.originalName } : null,
  };
}

recruiterRouter.get(
  '/drives/:id/applications',
  member,
  objectIdParams('id'),
  validate({
    query: z.object({
      ...paginationQuery,
      status: z.enum(APP_STATUS_LIST).optional(),
      eligibility: z.enum(['eligible', 'ineligible', 'pending_verification']).optional(),
      department: z.string().max(200).optional(), // comma separated
      graduationYear: z.coerce.number().int().optional(),
      minCgpa: z.coerce.number().min(0).max(10).optional(),
      skills: z.string().max(300).optional(), // comma separated, ANY match
    }),
  }),
  asyncHandler(async (req, res) => {
    const drive = await ownDrive(req);
    const pg = parsePagination(req.query);
    const appFilter = { driveId: drive._id, companyId: req.company._id };
    if (req.query.status) appFilter.status = req.query.status;
    if (req.query.eligibility) appFilter['eligibilitySnapshot.result'] = req.query.eligibility;

    const q = req.query;
    if (q.department || q.graduationYear || q.minCgpa !== undefined || q.skills || q.q) {
      const studentIds = await Application.distinct('studentId', appFilter);
      const pf = { _id: { $in: studentIds } };
      if (q.department) pf.department = { $in: q.department.split(',').map(normalizeDept) };
      if (q.graduationYear) pf.graduationYear = q.graduationYear;
      if (q.minCgpa !== undefined) { pf.verificationStatus = PROFILE_VERIFICATION.VERIFIED; pf['academicSummary.verified.cgpa'] = { $gte: q.minCgpa }; }
      if (q.skills) pf.skills = { $in: q.skills.split(',').map((s) => new RegExp(`^${escapeRegex(s.trim())}$`, 'i')) };
      if (q.q) {
        const users = await User.find({ name: new RegExp(escapeRegex(q.q), 'i'), role: ROLES.STUDENT }).select('_id').lean();
        pf.userId = { $in: users.map((u) => u._id) };
      }
      const matching = await StudentProfile.find(pf).select('_id').lean();
      appFilter.studentId = { $in: matching.map((m) => m._id) };
    }

    const [apps, total] = await Promise.all([
      Application.find(appFilter).sort({ appliedAt: -1 }).skip(pg.skip).limit(pg.limit).lean(),
      Application.countDocuments(appFilter),
    ]);
    const profiles = new Map((await StudentProfile.find({ _id: { $in: apps.map((a) => a.studentId) } }).select('department degree graduationYear skills verificationStatus academicSummary personal.contactNumber userId').lean()).map((p) => [String(p._id), p]));
    const users = new Map((await User.find({ _id: { $in: [...profiles.values()].map((p) => p.userId) } }).select('name email').lean()).map((u) => [String(u._id), u]));
    const resumes = new Map((await Resume.find({ _id: { $in: apps.map((a) => a.resumeId).filter(Boolean) } }).select('originalName').lean()).map((r) => [String(r._id), r]));
    return ok(res, apps.map((a) => {
      const p = profiles.get(String(a.studentId));
      return candidateRow(a, p, users.get(String(p?.userId)), resumes.get(String(a.resumeId)));
    }), pageMeta(pg, total));
  })
);

recruiterRouter.get('/applications/:id', member, objectIdParams('id'), asyncHandler(async (req, res) => {
  const app = await getCompanyApplication(req.params.id, req.company._id);
  const [profile, drive, events, participants, interviews, offers, resume] = await Promise.all([
    StudentProfile.findById(app.studentId).lean(),
    PlacementDrive.findById(app.driveId).select('jobTitle').lean(),
    ApplicationEvent.find({ applicationId: app._id }).sort({ createdAt: 1 }).select('-actorId').lean(),
    RoundParticipant.find({ applicationId: app._id }).populate('roundId', 'name type sequence').lean(),
    Interview.find({ applicationId: app._id }).populate('roundId', 'name type').lean(),
    Offer.find({ applicationId: app._id }).sort({ version: -1 }),
    app.resumeId ? Resume.findById(app.resumeId).select('originalName uploadedAt') : null,
  ]);
  const user = await User.findById(profile.userId).select('name email');
  const projects = await StudentProject.find({ studentId: profile._id }).select('title description technologies projectUrl repositoryUrl').lean();
  const row = candidateRow(app, profile, user, resume);
  return ok(res, {
    ...row,
    drive,
    student: { ...row.student, interests: profile.interests, experiences: profile.experiences, projects, collegeName: profile.collegeName, currentSemester: profile.currentSemester },
    timeline: events, rounds: participants, interviews, offers,
  });
}));

// ---- status actions: shortlist / review / reject (scoped to own company)
const reasonBody = z.object({ reason: zText(1000).optional() });
async function act(req, res, to) {
  const app = await getCompanyApplication(req.params.id, req.company._id);
  const upd = await transitionApplication(app, to, { actor: req.user, actorRole: 'recruiter', reason: req.body.reason });
  await recruitSvc.notifyOnTransition(upd, to, req.body.reason);
  if (to === APP_STATUS.SHORTLISTED || to === APP_STATUS.REJECTED) {
    await audit({ actor: req.user, action: `application.${to}`, entityType: 'Application', entityId: upd._id, metadata: { reason: req.body.reason }, req });
  }
  return ok(res, upd);
}
// Registered on both routers: /recruiter/applications/:id/... and the spec alias /applications/:id/...
for (const [base, prefix] of [[recruiterRouter, '/applications'], [applicationsRouter, '']]) {
  for (const [action, status] of [['shortlist', APP_STATUS.SHORTLISTED], ['review', APP_STATUS.UNDER_REVIEW], ['reject', APP_STATUS.REJECTED]]) {
    base.post(`${prefix}/:id/${action}`, member, objectIdParams('id'), validate({ body: reasonBody }), asyncHandler((req, res) => act(req, res, status)));
  }
}

// bulk actions require explicit confirmation (spec 8.3)
const bulkBody = z.object({
  applicationIds: z.array(zObjectId).min(1).max(200),
  action: z.enum(['shortlist', 'reject', 'review']),
  reason: zText(1000).optional(),
  confirm: z.literal(true, { errorMap: () => ({ message: 'Bulk actions must be explicitly confirmed (confirm: true)' }) }),
});
const bulkHandler = asyncHandler(async (req, res) => {
  const to = { shortlist: APP_STATUS.SHORTLISTED, reject: APP_STATUS.REJECTED, review: APP_STATUS.UNDER_REVIEW }[req.body.action];
  const results = await recruitSvc.bulkTransition({ applicationIds: req.body.applicationIds, companyId: req.company._id, to, reason: req.body.reason, actor: req.user });
  await audit({ actor: req.user, action: `application.bulk_${req.body.action}`, entityType: 'Application', metadata: { count: results.length, ok: results.filter((r) => r.ok).length }, req });
  return ok(res, { results, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
});
recruiterRouter.post('/applications/bulk', member, validate({ body: bulkBody }), bulkHandler);
applicationsRouter.post('/bulk', member, validate({ body: bulkBody }), bulkHandler);

recruiterRouter.post(
  '/applications/:id/selection',
  member,
  objectIdParams('id'),
  validate({ body: z.object({ outcome: z.enum(SELECTION_OUTCOMES), reason: zText(1000).optional() }) }),
  asyncHandler(async (req, res) => {
    const app = await getCompanyApplication(req.params.id, req.company._id);
    const upd = await recruitSvc.setSelectionOutcome({ application: app, outcome: req.body.outcome, reason: req.body.reason, actor: req.user });
    await audit({ actor: req.user, action: `application.selection_${req.body.outcome}`, entityType: 'Application', entityId: upd._id, metadata: { reason: req.body.reason }, req });
    return ok(res, upd);
  })
);

// =========================================================== rounds
const roundInput = z.object({
  name: zReqText(120),
  type: z.enum(ROUND_TYPES).optional(),
  sequence: z.coerce.number().int().min(1).optional(),
  isOptional: z.boolean().optional(),
  instructions: zText(3000).optional(),
  status: z.enum(ROUND_STATUS).optional(),
  schedule: z.object({ startsAt: zDate.optional(), endsAt: zDate.optional(), timezone: zText(60).optional(), mode: z.enum(INTERVIEW_MODES).optional(), locationOrLink: zText(500).optional() }).optional(),
});

recruiterRouter.get('/drives/:id/rounds', member, objectIdParams('id'), asyncHandler(async (req, res) => {
  const drive = await ownDrive(req);
  const rounds = await RecruitmentRound.find({ driveId: drive._id }).sort({ sequence: 1 }).lean();
  const counts = await RoundParticipant.aggregate([{ $match: { driveId: drive._id } }, { $group: { _id: { r: '$roundId', s: '$result' }, n: { $sum: 1 } } }]);
  return ok(res, rounds.map((r) => ({
    ...r,
    participants: Object.fromEntries(counts.filter((c) => String(c._id.r) === String(r._id)).map((c) => [c._id.s, c.n])),
  })));
}));

recruiterRouter.post('/drives/:id/rounds', member, objectIdParams('id'), validate({ body: roundInput }), asyncHandler(async (req, res) => {
  const drive = await ownDrive(req);
  const last = await RecruitmentRound.findOne({ driveId: drive._id }).sort({ sequence: -1 }).select('sequence');
  const round = await RecruitmentRound.create({ ...req.body, driveId: drive._id, sequence: req.body.sequence || (last?.sequence || 0) + 1 });
  return created(res, round);
}));

recruiterRouter.put('/rounds/:id', member, objectIdParams('id'), validate({ body: roundInput.partial() }), asyncHandler(async (req, res) => {
  const { round } = await recruitSvc.getCompanyRound(req.params.id, req.company._id);
  round.set(req.body);
  await round.save();
  return ok(res, round);
}));

recruiterRouter.delete('/rounds/:id', member, objectIdParams('id'), asyncHandler(async (req, res) => {
  const { round } = await recruitSvc.getCompanyRound(req.params.id, req.company._id);
  if (await RoundParticipant.exists({ roundId: round._id })) throw conflict('This round already has candidates. Cancel it instead of deleting.', 'ROUND_HAS_PARTICIPANTS');
  await round.deleteOne();
  return ok(res, { deleted: true });
}));

recruiterRouter.get('/rounds/:id/participants', member, objectIdParams('id'), asyncHandler(async (req, res) => {
  const { round } = await recruitSvc.getCompanyRound(req.params.id, req.company._id);
  const parts = await RoundParticipant.find({ roundId: round._id }).lean();
  const apps = new Map((await Application.find({ _id: { $in: parts.map((p) => p.applicationId) } }).select('studentId status').lean()).map((a) => [String(a._id), a]));
  const profiles = new Map((await StudentProfile.find({ _id: { $in: [...apps.values()].map((a) => a.studentId) } }).select('department userId').lean()).map((p) => [String(p._id), p]));
  const users = new Map((await User.find({ _id: { $in: [...profiles.values()].map((p) => p.userId) } }).select('name').lean()).map((u) => [String(u._id), u.name]));
  const interviews = new Map((await Interview.find({ roundId: round._id }).lean()).map((i) => [String(i.applicationId), i]));
  return ok(res, { round, participants: parts.map((p) => {
    const a = apps.get(String(p.applicationId));
    const pr = profiles.get(String(a?.studentId));
    return { ...p, applicationStatus: a?.status, name: users.get(String(pr?.userId)), department: pr?.department, interview: interviews.get(String(p.applicationId)) || null };
  }) });
}));

recruiterRouter.post('/rounds/:id/participants', member, objectIdParams('id'), validate({ body: z.object({ applicationIds: z.array(zObjectId).min(1).max(500), confirm: z.boolean().optional() }) }), asyncHandler(async (req, res) => {
  const { round, drive } = await recruitSvc.getCompanyRound(req.params.id, req.company._id);
  if (req.body.applicationIds.length > 1 && req.body.confirm !== true) throw badRequest('Bulk additions must be confirmed (confirm: true)', 'CONFIRMATION_REQUIRED');
  const results = await recruitSvc.addParticipants({ round, drive, applicationIds: req.body.applicationIds, actor: req.user });
  return ok(res, { results, added: results.filter((r) => r.ok).length });
}));

recruiterRouter.put(
  '/rounds/:id/participants/:pid',
  member,
  objectIdParams('id', 'pid'),
  validate({ body: z.object({ result: z.enum(PARTICIPANT_RESULT).optional(), score: z.coerce.number().optional(), remarks: zText(2000).optional(), autoReject: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const { round, drive } = await recruitSvc.getCompanyRound(req.params.id, req.company._id);
    const participant = await RoundParticipant.findOne({ _id: req.params.pid, roundId: round._id });
    if (!participant) throw notFound('Participant not found');
    const upd = await recruitSvc.updateParticipantResult({ participant, drive, actor: req.user, ...req.body });
    return ok(res, upd);
  })
);

recruiterRouter.post('/rounds/:id/complete', member, objectIdParams('id'), validate({ body: z.object({ force: z.boolean().optional() }) }), asyncHandler(async (req, res) => {
  const { round } = await recruitSvc.getCompanyRound(req.params.id, req.company._id);
  const pending = await RoundParticipant.countDocuments({ roundId: round._id, result: 'pending' });
  if (pending && !req.body.force) throw conflict(`${pending} candidate(s) still have a pending result`, 'RESULTS_PENDING', { pending });
  round.status = 'completed';
  await round.save();
  return ok(res, round);
}));

// =========================================================== interviews
const interviewInput = z.object({
  startsAt: zDate,
  endsAt: zDate.optional(),
  timezone: zText(60).optional(),
  mode: z.enum(INTERVIEW_MODES),
  locationOrLink: zText(500).optional(),
  instructions: zText(3000).optional(),
});

recruiterRouter.post(
  '/rounds/:id/interviews',
  member,
  objectIdParams('id'),
  validate({ body: z.object({ schedules: z.array(z.object({ applicationId: zObjectId }).merge(interviewInput)).min(1).max(100) }) }),
  asyncHandler(async (req, res) => {
    const { round, drive } = await recruitSvc.getCompanyRound(req.params.id, req.company._id);
    const results = [];
    for (const s of req.body.schedules) {
      const { applicationId, ...data } = s;
      if (data.startsAt <= new Date()) { results.push({ applicationId, ok: false, error: 'Interview time must be in the future' }); continue; }
      try {
        const interview = await recruitSvc.scheduleInterview({ round, drive, applicationId, data, actor: req.user });
        results.push({ applicationId, ok: true, interviewId: interview._id });
      } catch (e) {
        results.push({ applicationId, ok: false, error: e.message });
      }
    }
    return created(res, { results, scheduled: results.filter((r) => r.ok).length });
  })
);

recruiterRouter.get('/drives/:id/interviews', member, objectIdParams('id'), asyncHandler(async (req, res) => {
  const drive = await ownDrive(req);
  const items = await Interview.find({ driveId: drive._id }).sort({ startsAt: 1 }).populate('roundId', 'name type').lean();
  const apps = new Map((await Application.find({ _id: { $in: items.map((i) => i.applicationId) } }).select('studentId').lean()).map((a) => [String(a._id), a.studentId]));
  const profiles = new Map((await StudentProfile.find({ _id: { $in: [...apps.values()] } }).select('userId').lean()).map((p) => [String(p._id), p.userId]));
  const users = new Map((await User.find({ _id: { $in: [...profiles.values()] } }).select('name').lean()).map((u) => [String(u._id), u.name]));
  return ok(res, items.map((i) => ({ ...i, candidateName: users.get(String(profiles.get(String(apps.get(String(i.applicationId)))))) })));
}));

recruiterRouter.put(
  '/interviews/:id',
  member,
  objectIdParams('id'),
  validate({ body: interviewInput.partial().extend({ reason: zText(500).optional(), status: z.enum(INTERVIEW_STATUS).optional() }) }),
  asyncHandler(async (req, res) => {
    const interview = await Interview.findById(req.params.id);
    const drive = interview ? await PlacementDrive.findOne({ _id: interview.driveId, companyId: req.company._id }) : null;
    if (!interview || !drive) throw notFound('Interview not found');
    const { status, ...schedule } = req.body;
    const changesSchedule = ['startsAt', 'endsAt', 'mode', 'locationOrLink', 'timezone', 'instructions'].some((k) => schedule[k] !== undefined);
    let result = interview;
    if (changesSchedule) {
      if (schedule.startsAt && schedule.startsAt <= new Date()) throw badRequest('New interview time must be in the future', 'INVALID_DATES');
      result = await recruitSvc.rescheduleInterview({ interview, drive, data: schedule, actor: req.user });
    }
    if (status) result = await recruitSvc.updateInterviewStatus({ interview: result, drive, status, actor: req.user });
    return ok(res, result);
  })
);

// =========================================================== offers
const offerInput = z.object({
  jobTitle: zText(160).optional(),
  compensation: z.object({ kind: z.enum(COMPENSATION_KINDS), amount: z.coerce.number().min(0), currency: z.string().trim().length(3).optional(), notes: zText(500).optional() }),
  responseDeadline: zDate,
  joiningDate: zDate.optional(),
});

async function ownOffer(req) {
  const offer = await Offer.findById(req.params.id);
  if (!offer) throw notFound('Offer not found');
  offerSvc.assertOfferBelongsToCompany(offer, req.company._id);
  return offer;
}

recruiterRouter.post('/applications/:id/offers', verifiedMember, objectIdParams('id'), validate({ body: offerInput.extend({ issueNow: z.boolean().optional() }) }), asyncHandler(async (req, res) => {
  const app = await getCompanyApplication(req.params.id, req.company._id);
  const { issueNow, ...data } = req.body;
  let offer = await offerSvc.createOffer({ application: app, user: req.user, data });
  if (issueNow) {
    if (!['owner', 'hr_manager'].includes(req.membership.companyRole)) throw forbidden('Only the owner or HR manager can issue offers', 'COMPANY_ROLE_FORBIDDEN');
    offer = await offerSvc.issueOffer({ offer, user: req.user });
    await audit({ actor: req.user, action: 'offer.issued', entityType: 'Offer', entityId: offer._id, metadata: { version: offer.version }, req });
  }
  return created(res, offer);
}));

recruiterRouter.get('/offers', member, validate({ query: z.object({ ...paginationQuery, status: z.enum(Object.values(OFFER_STATUS)).optional(), driveId: zObjectId.optional() }) }), asyncHandler(async (req, res) => {
  const pg = parsePagination(req.query);
  const filter = { companyId: req.company._id, ...(req.query.status ? { status: req.query.status } : {}), ...(req.query.driveId ? { driveId: req.query.driveId } : {}) };
  const [items, total] = await Promise.all([
    Offer.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(),
    Offer.countDocuments(filter),
  ]);
  const profiles = new Map((await StudentProfile.find({ _id: { $in: items.map((o) => o.studentId) } }).select('userId department').lean()).map((p) => [String(p._id), p]));
  const users = new Map((await User.find({ _id: { $in: [...profiles.values()].map((p) => p.userId) } }).select('name').lean()).map((u) => [String(u._id), u.name]));
  return ok(res, items.map((o) => ({ ...o, documentStorageKey: undefined, hasDocument: !!o.documentOriginalName, candidateName: users.get(String(profiles.get(String(o.studentId))?.userId)), department: profiles.get(String(o.studentId))?.department })), pageMeta(pg, total));
}));

recruiterRouter.put('/offers/:id', member, objectIdParams('id'), validate({ body: offerInput.partial() }), asyncHandler(async (req, res) => {
  const offer = await ownOffer(req);
  return ok(res, await offerSvc.updateDraftOffer({ offer, data: req.body }));
}));

recruiterRouter.post('/offers/:id/issue', verifiedManager, objectIdParams('id'), asyncHandler(async (req, res) => {
  const offer = await ownOffer(req);
  const issued = await offerSvc.issueOffer({ offer, user: req.user });
  await audit({ actor: req.user, action: 'offer.issued', entityType: 'Offer', entityId: issued._id, metadata: { version: issued.version }, req });
  return ok(res, issued);
}));

recruiterRouter.post('/offers/:id/withdraw', manager, objectIdParams('id'), validate({ body: z.object({ reason: zReqText(1000) }) }), asyncHandler(async (req, res) => {
  const offer = await ownOffer(req);
  const upd = await offerSvc.withdrawOffer({ offer, user: req.user, reason: req.body.reason });
  await audit({ actor: req.user, action: 'offer.withdrawn', entityType: 'Offer', entityId: upd._id, metadata: { reason: req.body.reason }, req });
  return ok(res, upd);
}));

recruiterRouter.post('/offers/:id/revise', manager, objectIdParams('id'), validate({ body: offerInput.partial() }), asyncHandler(async (req, res) => {
  const offer = await ownOffer(req);
  const revised = await offerSvc.reviseOffer({ offer, user: req.user, data: req.body });
  await audit({ actor: req.user, action: 'offer.revised', entityType: 'Offer', entityId: revised._id, metadata: { version: revised.version }, req });
  return created(res, revised);
}));

recruiterRouter.post('/offers/:id/document', member, objectIdParams('id'), uploadOfferDoc, asyncHandler(async (req, res) => {
  const offer = await Offer.findById(req.params.id);
  if (!offer) throw notFound('Offer not found');
  offerSvc.assertOfferBelongsToCompany(offer, req.company._id);
  assertFileMatches(req.file, ['application/pdf']);
  const key = await storage.saveFile('offers', req.file.buffer, '.pdf');
  if (offer.documentStorageKey) await storage.deleteFile(offer.documentStorageKey);
  offer.documentStorageKey = key;
  offer.documentOriginalName = safeFilename(req.file.originalname);
  await offer.save();
  return ok(res, { message: 'Offer letter uploaded', documentOriginalName: offer.documentOriginalName });
}));

export { PUBLICATION, zBool };
