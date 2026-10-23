import { Router } from 'express';
import { z } from 'zod';
import {
  validate, objectIdParams, zReqText, zText, zDate, zStrList, zUrl, paginationQuery, zNullableNum, zObjectId, zBool,
} from '../middleware/validate.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { uploadResume, uploadPhoto, assertFileMatches, safeFilename } from '../middleware/upload.js';
import { asyncHandler, parsePagination, pageMeta, normalizeDept } from '../utils/helpers.js';
import { ok, created } from '../utils/response.js';
import {
  User, StudentProfile, AcademicRecord, StudentProject, Resume, PlacementDrive, Company, Application, ApplicationEvent,
  Interview, Offer, RecruitmentRound, Notification,
} from '../models/index.js';
import { ROLES, PROFILE_VERIFICATION, RECORD_TYPES, SCORE_SCALES, APP_STATUS_LIST, ELIGIBILITY, APPROVAL, PUBLICATION, OFFER_STATUS } from '../constants/index.js';
import { notFound, conflict, badRequest } from '../utils/AppError.js';
import { getAllPolicies } from '../services/policy.service.js';
import { computeCompletion } from '../services/profileCompletion.js';
import { evaluateEligibility } from '../services/eligibility.service.js';
import { submitApplication, withdrawApplication, driveOpenState } from '../services/application.service.js';
import { respondToOffer } from '../services/offer.service.js';
import * as storage from '../services/storage.service.js';
import { audit } from '../services/audit.service.js';
import { notificationRouter } from './common.routes.js';
import { MAX_GRADUATION_YEAR } from '../constants/index.js';

export const studentRouter = Router();
export const drivesRouter = Router();
for (const r of [studentRouter, drivesRouter]) r.use(authenticate, requireRole(ROLES.STUDENT));

const loadProfile = asyncHandler(async (req, _res, next) => {
  req.profile = await StudentProfile.findOne({ userId: req.user._id });
  if (!req.profile) throw notFound('Student profile not found');
  next();
});
studentRouter.use(loadProfile);
drivesRouter.use(loadProfile);

// ------------------------------------------------------------------ profile
async function completionFor(req) {
  const policies = await getAllPolicies();
  const [projectCount, resumeCount] = await Promise.all([
    StudentProject.countDocuments({ studentId: req.profile._id }),
    Resume.countDocuments({ studentId: req.profile._id, isActive: true }),
  ]);
  return computeCompletion(req.profile, { user: req.user, projectCount, hasResume: resumeCount > 0, requiredSections: policies.profileRequiredSections });
}

studentRouter.get('/profile', asyncHandler(async (req, res) => {
  const [completion, records, projects, resumes] = await Promise.all([
    completionFor(req),
    AcademicRecord.find({ studentId: req.profile._id }).sort({ recordType: 1, semester: 1 }).lean(),
    StudentProject.find({ studentId: req.profile._id }).sort({ createdAt: -1 }).lean(),
    Resume.find({ studentId: req.profile._id, isActive: true }).sort({ uploadedAt: -1 }),
  ]);
  return ok(res, { user: req.user, profile: req.profile, completion, academicRecords: records, projects, resumes, hasPhoto: !!req.profile.personal?.photoMimeType });
}));

const academicInput = z.object({
  cgpa: zNullableNum(0, 10),
  activeBacklogs: zNullableNum(0, 100),
  totalBacklogs: zNullableNum(0, 100),
  tenthPercentage: zNullableNum(0, 100),
  twelfthPercentage: zNullableNum(0, 100),
  diplomaPercentage: zNullableNum(0, 100),
});

const profileUpdate = z.object({
  name: zReqText(120).optional(),
  rollNumber: zReqText(40).optional(),
  collegeName: zText(200).optional(),
  degree: zText(60).optional(),
  department: zReqText(40).optional(),
  currentSemester: zNullableNum(1, 12),
  graduationYear: z.coerce.number().int().min(2000).max(MAX_GRADUATION_YEAR).optional(),
  personal: z.object({ contactNumber: zText(20).optional(), dateOfBirth: zDate.optional().nullable(), address: zText(500).optional() }).optional(),
  academic: academicInput.optional(),
});

studentRouter.put('/profile', validate({ body: profileUpdate }), asyncHandler(async (req, res) => {
  const b = req.body;
  const p = req.profile;
  const profileName = b.name || req.user.name;
  if (req.user.mustCompleteProfile && !(
    (profileName && profileName !== 'Student') &&
    (b.rollNumber || (p.rollNumber && !p.rollNumber.startsWith('PENDING-'))) &&
    (b.department || p.department) &&
    (b.degree || p.degree) &&
    (b.graduationYear || p.graduationYear) &&
    (b.currentSemester || p.currentSemester)
  )) {
    throw badRequest('Complete roll number, degree, department, graduation year, and current semester to finish your profile', 'PROFILE_INCOMPLETE');
  }
  let academicChanged = false;
  if (b.rollNumber && b.rollNumber !== p.rollNumber) {
    if (!p.rollNumber.startsWith('PENDING-') && !req.user.mustCompleteProfile) {
      throw badRequest('Roll number can only be changed by the placement cell', 'ROLL_NUMBER_LOCKED');
    }
    if (await StudentProfile.exists({ rollNumber: b.rollNumber.trim(), _id: { $ne: p._id } })) {
      throw conflict('This roll number is already registered', 'ROLL_NUMBER_EXISTS');
    }
    p.rollNumber = b.rollNumber.trim();
  }
  if (b.name) await User.updateOne({ _id: req.user._id }, { $set: { name: b.name } });
  for (const k of ['collegeName', 'degree', 'currentSemester']) if (b[k] !== undefined) p[k] = b[k];
  if (b.department && normalizeDept(b.department) !== p.department) {
    const policies = await getAllPolicies();
    if (policies.departments?.length && !policies.departments.map(normalizeDept).includes(normalizeDept(b.department))) {
      throw badRequest(`Department must be one of: ${policies.departments.join(', ')}`, 'DEPARTMENT_NOT_ALLOWED');
    }
    p.department = normalizeDept(b.department);
    academicChanged = true;
  }
  if (b.graduationYear && b.graduationYear !== p.graduationYear) { p.graduationYear = b.graduationYear; academicChanged = true; }
  if (b.personal) {
    if (b.personal.contactNumber !== undefined) p.personal.contactNumber = b.personal.contactNumber;
    if (b.personal.dateOfBirth !== undefined) p.personal.dateOfBirth = b.personal.dateOfBirth;
    if (b.personal.address !== undefined) p.personal.address = b.personal.address;
  }
  if (b.academic) {
    for (const [k, v] of Object.entries(b.academic)) {
      if (v === undefined) continue;
      if ((p.academicSummary.entered[k] ?? null) !== v) academicChanged = true;
      p.academicSummary.entered[k] = v;
    }
    if (b.academic.totalBacklogs != null && b.academic.activeBacklogs != null && b.academic.totalBacklogs < b.academic.activeBacklogs) {
      throw badRequest('Total backlogs cannot be less than active backlogs', 'INVALID_BACKLOGS');
    }
  }
  // Student-entered values are never auto-verified. Any change to academic data re-opens verification.
  if (academicChanged && p.verificationStatus !== PROFILE_VERIFICATION.PENDING) {
    p.verificationStatus = PROFILE_VERIFICATION.PENDING;
    p.verificationNote = 'Academic details changed by student - re-verification required';
    p.verificationUpdatedAt = new Date();
  }
  await p.save();
  req.profile = p;
  const user = await User.findById(req.user._id);
  if (user.mustCompleteProfile && user.name && user.name !== 'Student' && p.rollNumber && !p.rollNumber.startsWith('PENDING-') && p.degree && p.department && p.graduationYear && p.currentSemester) {
    user.mustCompleteProfile = false;
    await user.save();
  }
  return ok(res, { user, profile: p, completion: await completionFor(req), verificationReset: academicChanged });
}));

// photo (private file, optional)
studentRouter.post('/profile/photo', uploadPhoto, asyncHandler(async (req, res) => {
  const mime = assertFileMatches(req.file, ['image/jpeg', 'image/png']);
  const full = await StudentProfile.findById(req.profile._id).select('+personal.photoStorageKey');
  const key = await storage.saveFile('photos', req.file.buffer, storage.extFor(mime));
  if (full.personal.photoStorageKey) await storage.deleteFile(full.personal.photoStorageKey);
  full.personal.photoStorageKey = key;
  full.personal.photoMimeType = mime;
  await full.save();
  return ok(res, { message: 'Photo updated', url: `/api/v1/files/photos/${full._id}` });
}));
studentRouter.delete('/profile/photo', asyncHandler(async (req, res) => {
  const full = await StudentProfile.findById(req.profile._id).select('+personal.photoStorageKey');
  if (full.personal.photoStorageKey) await storage.deleteFile(full.personal.photoStorageKey);
  full.personal.photoStorageKey = undefined;
  full.personal.photoMimeType = undefined;
  await full.save();
  return ok(res, { message: 'Photo removed' });
}));

// ------------------------------------------------------------------ academic records (per level / semester)
const recordInput = z.object({
  recordType: z.enum(RECORD_TYPES),
  semester: z.coerce.number().int().min(1).max(12).optional(),
  score: z.coerce.number().min(0).max(100),
  scoreScale: z.enum(SCORE_SCALES),
  institution: zText(200).optional(),
  board: zText(120).optional(),
  yearOfPassing: z.coerce.number().int().min(1990).max(2100).optional(),
}).refine((r) => (r.scoreScale === 'cgpa_10' ? r.score <= 10 : r.scoreScale === 'cgpa_4' ? r.score <= 4 : r.score <= 100), { message: 'Score exceeds the maximum of the selected scale', path: ['score'] })
  .refine((r) => r.recordType !== 'semester' || r.semester, { message: 'Semester is required for semester results', path: ['semester'] });

studentRouter.get('/academic-records', asyncHandler(async (req, res) => ok(res, await AcademicRecord.find({ studentId: req.profile._id }).sort({ recordType: 1, semester: 1 }).lean())));
studentRouter.post('/academic-records', validate({ body: recordInput }), asyncHandler(async (req, res) => {
  const count = await AcademicRecord.countDocuments({ studentId: req.profile._id });
  if (count >= 40) throw conflict('Academic record limit reached', 'LIMIT_REACHED');
  return created(res, await AcademicRecord.create({ ...req.body, studentId: req.profile._id }));
}));
studentRouter.put('/academic-records/:id', objectIdParams('id'), validate({ body: recordInput }), asyncHandler(async (req, res) => {
  const rec = await AcademicRecord.findOne({ _id: req.params.id, studentId: req.profile._id });
  if (!rec) throw notFound('Record not found');
  rec.set({ ...req.body, verificationStatus: PROFILE_VERIFICATION.PENDING, verifiedBy: undefined, verifiedAt: undefined });
  await rec.save();
  return ok(res, rec);
}));
studentRouter.delete('/academic-records/:id', objectIdParams('id'), asyncHandler(async (req, res) => {
  const r = await AcademicRecord.deleteOne({ _id: req.params.id, studentId: req.profile._id });
  if (!r.deletedCount) throw notFound('Record not found');
  return ok(res, { deleted: true });
}));

// ------------------------------------------------------------------ skills, experiences, projects
studentRouter.put('/skills', validate({ body: z.object({ skills: zStrList(60).optional(), interests: zStrList(30).optional() }) }), asyncHandler(async (req, res) => {
  if (req.body.skills) req.profile.skills = [...new Set(req.body.skills)];
  if (req.body.interests) req.profile.interests = [...new Set(req.body.interests)];
  await req.profile.save();
  return ok(res, { skills: req.profile.skills, interests: req.profile.interests });
}));

const experienceInput = z.object({
  type: z.enum(['internship', 'certification', 'achievement', 'experience']),
  title: zReqText(160),
  organization: zText(160).optional(),
  description: zText(2000).optional(),
  startDate: zDate.optional(),
  endDate: zDate.optional(),
  url: zUrl.optional(),
});
studentRouter.post('/experiences', validate({ body: experienceInput }), asyncHandler(async (req, res) => {
  if (req.profile.experiences.length >= 50) throw conflict('Limit of 50 entries reached', 'LIMIT_REACHED');
  req.profile.experiences.push(req.body);
  await req.profile.save();
  return created(res, req.profile.experiences);
}));
studentRouter.put('/experiences/:id', objectIdParams('id'), validate({ body: experienceInput }), asyncHandler(async (req, res) => {
  const e = req.profile.experiences.id(req.params.id);
  if (!e) throw notFound('Entry not found');
  e.set(req.body);
  await req.profile.save();
  return ok(res, req.profile.experiences);
}));
studentRouter.delete('/experiences/:id', objectIdParams('id'), asyncHandler(async (req, res) => {
  const e = req.profile.experiences.id(req.params.id);
  if (!e) throw notFound('Entry not found');
  e.deleteOne();
  await req.profile.save();
  return ok(res, req.profile.experiences);
}));

const projectInput = z.object({
  title: zReqText(160),
  description: zText(3000).optional(),
  technologies: zStrList(30).optional(),
  projectUrl: zUrl.optional(),
  repositoryUrl: zUrl.optional(),
});
studentRouter.get('/projects', asyncHandler(async (req, res) => ok(res, await StudentProject.find({ studentId: req.profile._id }).sort({ createdAt: -1 }).lean())));
studentRouter.post('/projects', validate({ body: projectInput }), asyncHandler(async (req, res) => {
  if ((await StudentProject.countDocuments({ studentId: req.profile._id })) >= 30) throw conflict('Project limit reached', 'LIMIT_REACHED');
  return created(res, await StudentProject.create({ ...req.body, studentId: req.profile._id }));
}));
studentRouter.put('/projects/:id', objectIdParams('id'), validate({ body: projectInput }), asyncHandler(async (req, res) => {
  const p = await StudentProject.findOneAndUpdate({ _id: req.params.id, studentId: req.profile._id }, { $set: req.body }, { new: true, runValidators: true });
  if (!p) throw notFound('Project not found');
  return ok(res, p);
}));
studentRouter.delete('/projects/:id', objectIdParams('id'), asyncHandler(async (req, res) => {
  const r = await StudentProject.deleteOne({ _id: req.params.id, studentId: req.profile._id });
  if (!r.deletedCount) throw notFound('Project not found');
  return ok(res, { deleted: true });
}));

// ------------------------------------------------------------------ resumes (metadata in Mongo, bytes in private storage)
studentRouter.get('/resumes', asyncHandler(async (req, res) => ok(res, await Resume.find({ studentId: req.profile._id, isActive: true }).sort({ uploadedAt: -1 }))));

studentRouter.post('/resumes', uploadResume, asyncHandler(async (req, res) => {
  const mime = assertFileMatches(req.file, ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
  const replaceId = req.body?.replaceId;
  const activeCount = await Resume.countDocuments({ studentId: req.profile._id, isActive: true });
  if (activeCount >= 5 && !replaceId) throw conflict('You can keep at most 5 resumes. Delete or replace one first.', 'RESUME_LIMIT');
  const key = await storage.saveFile('resumes', req.file.buffer, storage.extFor(mime));
  const resume = await Resume.create({ studentId: req.profile._id, storageKey: key, originalName: safeFilename(req.file.originalname), mimeType: mime, sizeBytes: req.file.size });
  if (replaceId && /^[a-f\d]{24}$/i.test(replaceId)) await deactivateResume(req.profile._id, replaceId); // "replace" keeps the old file only if applications used it
  return created(res, resume);
}));

async function deactivateResume(studentId, resumeId) {
  const resume = await Resume.findOne({ _id: resumeId, studentId }).select('+storageKey');
  if (!resume) return false;
  resume.isActive = false;
  await resume.save();
  const used = await Application.exists({ resumeId: resume._id });
  if (!used) { await storage.deleteFile(resume.storageKey); await Resume.deleteOne({ _id: resume._id }); }
  return true;
}
studentRouter.delete('/resumes/:id', objectIdParams('id'), asyncHandler(async (req, res) => {
  if (!(await deactivateResume(req.profile._id, req.params.id))) throw notFound('Resume not found');
  return ok(res, { deleted: true });
}));

// ------------------------------------------------------------------ dashboard
studentRouter.get('/dashboard', asyncHandler(async (req, res) => {
  const nowDate = new Date();
  const [completion, apps, offers, unread, upcoming, driveCount] = await Promise.all([
    completionFor(req),
    Application.aggregate([{ $match: { studentId: req.profile._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Offer.find({ studentId: req.profile._id, isCurrent: true, status: OFFER_STATUS.ISSUED, responseDeadline: { $gte: nowDate } }).select('jobTitle responseDeadline companyId').populate('companyId', 'name').lean(),
    Notification.countDocuments({ userId: req.user._id, readAt: null }),
    Application.find({ studentId: req.profile._id }).select('_id').lean().then((a) => Interview.find({ applicationId: { $in: a.map((x) => x._id) }, startsAt: { $gte: nowDate }, status: { $in: ['scheduled', 'rescheduled'] } }).sort({ startsAt: 1 }).limit(5).lean()),
    PlacementDrive.countDocuments({ approvalStatus: APPROVAL.APPROVED, publicationStatus: PUBLICATION.PUBLISHED, applicationDeadline: { $gte: nowDate } }),
  ]);
  return ok(res, {
    verificationStatus: req.profile.verificationStatus,
    completion,
    applicationsByStatus: Object.fromEntries(apps.map((a) => [a._id, a.n])),
    totalApplications: apps.reduce((s, a) => s + a.n, 0),
    pendingOffers: offers,
    unreadNotifications: unread,
    upcomingInterviews: upcoming,
    openDrives: driveCount,
  });
}));

// ------------------------------------------------------------------ drives (browse, details, eligibility, apply)
async function publicDrive(drive, company, rounds) {
  const d = drive.toObject ? drive.toObject() : drive;
  const { createdBy, reviewedBy, statusReason, submittedAt, ...pub } = d;
  return {
    ...pub,
    company: company ? { _id: company._id, name: company.name, website: company.website, industry: company.industry, description: company.description, headquarters: company.headquarters } : undefined,
    rounds: (rounds || []).map((r) => ({ _id: r._id, name: r.name, type: r.type, sequence: r.sequence, isOptional: r.isOptional })),
  };
}

async function studentCanSeeDrive(profile, drive) {
  if (drive.approvalStatus === APPROVAL.APPROVED && drive.publicationStatus === PUBLICATION.PUBLISHED) return true;
  // closed / paused drives stay visible to students who already applied (to follow their application)
  return !!(await Application.exists({ studentId: profile._id, driveId: drive._id }));
}

function evalFor(profile, drive, policies) {
  return evaluateEligibility(profile.toObject(), drive.toObject ? drive.toObject() : drive, {
    requireVerification: policies.requireAcademicVerification,
    globalMaxActiveBacklogs: policies.maxActiveBacklogsGlobal,
  });
}

drivesRouter.get(
  '/',
  validate({ query: z.object({ ...paginationQuery, employmentType: z.string().max(40).optional(), eligibility: z.enum(['eligible', 'ineligible', 'pending_verification']).optional(), applied: zBool.optional() }) }),
  asyncHandler(async (req, res) => {
    const policies = await getAllPolicies();
    const pg = parsePagination(req.query);
    const filter = { approvalStatus: APPROVAL.APPROVED, publicationStatus: PUBLICATION.PUBLISHED };
    if (req.query.employmentType) filter.employmentType = req.query.employmentType;
    if (req.query.q) filter.$or = [{ jobTitle: new RegExp(req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
    const drives = await PlacementDrive.find(filter).sort({ applicationDeadline: 1 }).limit(500);
    const companies = new Map((await Company.find({ _id: { $in: drives.map((d) => d.companyId) }, verificationStatus: 'verified' }).select('name industry website').lean()).map((c) => [String(c._id), c]));
    const myApps = new Map((await Application.find({ studentId: req.profile._id, driveId: { $in: drives.map((d) => d._id) } }).select('driveId status').lean()).map((a) => [String(a.driveId), a]));
    let rows = drives
      .filter((d) => companies.has(String(d.companyId)))
      .map((d) => {
        const ev = evalFor(req.profile, d, policies);
        const company = companies.get(String(d.companyId));
        const state = driveOpenState(d, { verificationStatus: 'verified' });
        const mine = myApps.get(String(d._id));
        return {
          _id: d._id, jobTitle: d.jobTitle, company: { _id: company._id, name: company.name, industry: company.industry },
          employmentType: d.employmentType, workMode: d.workMode, locations: d.locations, compensation: d.compensation,
          applicationOpensAt: d.applicationOpensAt, applicationDeadline: d.applicationDeadline,
          eligibility: { result: ev.result, reasons: ev.reasons }, open: state.open, openState: state.open ? 'open' : state.code,
          applied: !!mine, applicationId: mine?._id, applicationStatus: mine?.status,
        };
      });
    if (req.query.eligibility) rows = rows.filter((r) => r.eligibility.result === req.query.eligibility);
    if (req.query.applied !== undefined) rows = rows.filter((r) => r.applied === req.query.applied);
    const total = rows.length;
    return ok(res, rows.slice(pg.skip, pg.skip + pg.limit), pageMeta(pg, total));
  })
);

drivesRouter.get('/:id', objectIdParams('id'), asyncHandler(async (req, res) => {
  const policies = await getAllPolicies();
  const drive = await PlacementDrive.findById(req.params.id);
  if (!drive || !(await studentCanSeeDrive(req.profile, drive))) throw notFound('Drive not found'); // unpublished drives are invisible
  const [company, rounds, mine] = await Promise.all([
    Company.findById(drive.companyId),
    RecruitmentRound.find({ driveId: drive._id }).sort({ sequence: 1 }),
    Application.findOne({ studentId: req.profile._id, driveId: drive._id }).select('status appliedAt'),
  ]);
  const ev = evalFor(req.profile, drive, policies);
  const state = driveOpenState(drive, company);
  return ok(res, { drive: await publicDrive(drive, company, rounds), eligibility: ev, open: state, application: mine });
}));

drivesRouter.get('/:id/eligibility', objectIdParams('id'), asyncHandler(async (req, res) => {
  const policies = await getAllPolicies();
  const drive = await PlacementDrive.findById(req.params.id);
  if (!drive || !(await studentCanSeeDrive(req.profile, drive))) throw notFound('Drive not found');
  return ok(res, { ...evalFor(req.profile, drive, policies), verificationStatus: req.profile.verificationStatus, note: 'Final eligibility is re-checked on the server when you apply.' });
}));

drivesRouter.post('/:id/applications', objectIdParams('id'), validate({ body: z.object({ resumeId: zObjectId.optional() }) }), asyncHandler(async (req, res) => {
  const { application, evaluation } = await submitApplication({ user: req.user, driveId: req.params.id, resumeId: req.body.resumeId });
  return created(res, { application, eligibility: { result: evaluation.result, reasons: evaluation.reasons }, message: 'Application submitted successfully' });
}));

// ------------------------------------------------------------------ applications
studentRouter.get(
  '/applications',
  validate({ query: z.object({ ...paginationQuery, status: z.enum(APP_STATUS_LIST).optional() }) }),
  asyncHandler(async (req, res) => {
    const pg = parsePagination(req.query);
    const filter = { studentId: req.profile._id, ...(req.query.status ? { status: req.query.status } : {}) };
    const [items, total] = await Promise.all([
      Application.find(filter).sort({ appliedAt: -1 }).skip(pg.skip).limit(pg.limit).populate('driveId', 'jobTitle employmentType applicationDeadline compensation').populate('companyId', 'name').lean(),
      Application.countDocuments(filter),
    ]);
    return ok(res, items.map(({ driveId: drive, companyId: company, ...a }) => ({ ...a, drive, company })), pageMeta(pg, total));
  })
);

async function myApplication(req) {
  const app = await Application.findOne({ _id: req.params.id, studentId: req.profile._id }); // ownership enforced in the query
  if (!app) throw notFound('Application not found');
  return app;
}

studentRouter.get('/applications/:id', objectIdParams('id'), asyncHandler(async (req, res) => {
  const app = await myApplication(req);
  const [drive, company, events, interviews, offers, resume] = await Promise.all([
    PlacementDrive.findById(app.driveId).select('jobTitle description employmentType applicationDeadline compensation locations selectionProcess').lean(),
    Company.findById(app.companyId).select('name website').lean(),
    ApplicationEvent.find({ applicationId: app._id }).sort({ createdAt: 1 }).select('fromStatus toStatus reason createdAt actorRole').lean(),
    Interview.find({ applicationId: app._id }).sort({ startsAt: 1 }).populate('roundId', 'name type').lean(),
    Offer.find({ applicationId: app._id, status: { $ne: OFFER_STATUS.DRAFT } }).sort({ version: -1 }),
    app.resumeId ? Resume.findById(app.resumeId).select('originalName uploadedAt') : null,
  ]);
  return ok(res, { application: app, drive, company, timeline: events, interviews, offers, resume });
}));

studentRouter.get('/applications/:id/timeline', objectIdParams('id'), asyncHandler(async (req, res) => {
  const app = await myApplication(req);
  return ok(res, await ApplicationEvent.find({ applicationId: app._id }).sort({ createdAt: 1 }).select('fromStatus toStatus reason createdAt actorRole').lean());
}));

studentRouter.post('/applications/:id/withdraw', objectIdParams('id'), asyncHandler(async (req, res) => {
  const app = await withdrawApplication({ user: req.user, applicationId: req.params.id });
  return ok(res, app);
}));

studentRouter.get('/interviews', asyncHandler(async (req, res) => {
  const apps = await Application.find({ studentId: req.profile._id }).select('_id driveId').populate('driveId', 'jobTitle companyId').lean();
  const byApp = new Map(apps.map((a) => [String(a._id), a]));
  const interviews = await Interview.find({ applicationId: { $in: apps.map((a) => a._id) } }).sort({ startsAt: 1 }).populate('roundId', 'name type').lean();
  const companies = new Map((await Company.find({ _id: { $in: apps.map((a) => a.driveId?.companyId).filter(Boolean) } }).select('name').lean()).map((c) => [String(c._id), c.name]));
  return ok(res, interviews.map((i) => {
    const a = byApp.get(String(i.applicationId));
    return { ...i, jobTitle: a?.driveId?.jobTitle, company: companies.get(String(a?.driveId?.companyId)), history: undefined };
  }));
}));

// ------------------------------------------------------------------ offers
studentRouter.get('/offers', asyncHandler(async (req, res) => {
  const offers = await Offer.find({ studentId: req.profile._id, status: { $ne: OFFER_STATUS.DRAFT } }).sort({ createdAt: -1 }).populate('companyId', 'name website').lean();
  return ok(res, offers.map(({ companyId, ...o }) => ({ ...o, company: companyId, hasDocument: !!o.documentOriginalName, documentStorageKey: undefined })));
}));
studentRouter.get('/offers/:id', objectIdParams('id'), asyncHandler(async (req, res) => {
  const offer = await Offer.findOne({ _id: req.params.id, studentId: req.profile._id, status: { $ne: OFFER_STATUS.DRAFT } }).populate('companyId', 'name website');
  if (!offer) throw notFound('Offer not found');
  const history = await Offer.find({ applicationId: offer.applicationId, status: { $ne: OFFER_STATUS.DRAFT } }).sort({ version: 1 }).select('version status compensation issuedAt respondedAt statusReason');
  return ok(res, { offer, company: offer.companyId, history, hasDocument: !!offer.documentOriginalName });
}));
studentRouter.post('/offers/:id/respond', objectIdParams('id'), validate({ body: z.object({ decision: z.enum(['accept', 'decline']) }) }), asyncHandler(async (req, res) => {
  const offer = await respondToOffer({ user: req.user, offerId: req.params.id, decision: req.body.decision });
  await audit({ actor: req.user, action: req.body.decision === 'accept' ? 'offer.accepted' : 'offer.declined', entityType: 'Offer', entityId: offer._id, req });
  return ok(res, offer);
}));

// notifications alias (spec: GET /api/v1/student/notifications)
studentRouter.use('/notifications', notificationRouter);
