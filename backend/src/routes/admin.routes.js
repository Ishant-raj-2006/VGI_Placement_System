import { Router } from 'express';
import { z } from 'zod';
import {
  validate, objectIdParams, zReqText, zText, zDate, zEmail, zPassword, paginationQuery, zObjectId, zBool, zNullableNum,
} from '../middleware/validate.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { uploadCsv } from '../middleware/upload.js';
import { asyncHandler, parsePagination, pageMeta, escapeRegex, normalizeDept } from '../utils/helpers.js';
import { ok, created } from '../utils/response.js';
import {
  User, StudentProfile, AcademicRecord, StudentProject, Resume, Company, CompanyUser, PlacementDrive, DriveRuleVersion, Application,
  RecruitmentRound, Offer, AuditLog, Ticket, Session, EmailLog, Policy,
} from '../models/index.js';
import {
  ROLES, ADMIN_ROLES, ACCOUNT_STATUS, PROFILE_VERIFICATION, COMPANY_STATUS, APPROVAL, PUBLICATION, APP_STATUS_LIST, OFFER_STATUS,
  TICKET_STATUS, TICKET_TYPES, ROLE_LIST, POLICY_CATEGORY,
} from '../constants/index.js';
import { notFound, conflict, badRequest, forbidden } from '../utils/AppError.js';
import * as driveSvc from '../services/drive.service.js';
import * as analytics from '../services/analytics.service.js';
import * as policySvc from '../services/policy.service.js';
import * as authSvc from '../services/auth.service.js';
import { importStudents, IMPORT_COLUMNS } from '../services/import.service.js';
import { sendTable } from '../services/export.service.js';
import { audit } from '../services/audit.service.js';
import { notify } from '../services/notification.service.js';
import { companyMemberUserIds } from '../services/offer.service.js';
import { dbState } from '../config/db.js';
import { MAX_GRADUATION_YEAR } from '../constants/index.js';

export const adminRouter = Router();
adminRouter.use(authenticate, requireRole(...ADMIN_ROLES));
const superOnly = requireRole(ROLES.SUPER_ADMIN);

// ================================================================= dashboard & analytics
adminRouter.get('/dashboard', asyncHandler(async (_req, res) => ok(res, await analytics.adminDashboard())));

const analyticsRouter = Router();
analyticsRouter.get('/placements', asyncHandler(async (req, res) => {
  const [dashboard, funnel, departments, companies, salary] = await Promise.all([
    analytics.adminDashboard(), analytics.funnel(), analytics.departmentReport({}), analytics.companyReport(), analytics.salaryReport({ scope: 'accepted' }),
  ]);
  return ok(res, { totals: dashboard.totals, definitions: dashboard.definitions, funnel, departments, companies, salary });
}));
analyticsRouter.get('/departments', validate({ query: z.object({ graduationYear: z.coerce.number().int().optional(), driveId: zObjectId.optional() }) }), asyncHandler(async (req, res) => ok(res, await analytics.departmentReport(req.query))));
analyticsRouter.get('/companies', asyncHandler(async (_req, res) => ok(res, await analytics.companyReport())));
analyticsRouter.get('/salary', validate({ query: z.object({ scope: z.enum(['accepted', 'issued']).optional(), normalize: z.enum(['annual']).optional() }) }), asyncHandler(async (req, res) => ok(res, await analytics.salaryReport(req.query))));
analyticsRouter.get('/funnel', validate({ query: z.object({ driveId: zObjectId.optional(), companyId: zObjectId.optional() }) }), asyncHandler(async (req, res) => ok(res, await analytics.funnel(req.query))));
adminRouter.use('/analytics', analyticsRouter);
adminRouter.get('/recruitment', asyncHandler(async (_req, res) => ok(res, await analytics.recruitmentMonitoring())));

// ================================================================= students
const studentFilter = async (q) => {
  const f = {};
  if (q.department) f.department = { $in: q.department.split(',').map(normalizeDept) };
  if (q.graduationYear) f.graduationYear = q.graduationYear;
  if (q.verificationStatus) f.verificationStatus = q.verificationStatus;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    const users = await User.find({ role: ROLES.STUDENT, $or: [{ name: rx }, { email: rx }] }).select('_id').lean();
    f.$or = [{ userId: { $in: users.map((u) => u._id) } }, { studentId: rx }, { rollNumber: rx }];
  }
  if (q.accountStatus) {
    const users = await User.find({ role: ROLES.STUDENT, accountStatus: q.accountStatus }).select('_id').lean();
    f.userId = { $in: users.map((u) => u._id) };
  }
  return f;
};

adminRouter.get(
  '/students',
  validate({ query: z.object({ ...paginationQuery, department: z.string().max(200).optional(), graduationYear: z.coerce.number().int().optional(), verificationStatus: z.enum(Object.values(PROFILE_VERIFICATION)).optional(), accountStatus: z.enum(Object.values(ACCOUNT_STATUS)).optional() }) }),
  asyncHandler(async (req, res) => {
    const pg = parsePagination(req.query);
    const filter = await studentFilter(req.query);
    const [profiles, total] = await Promise.all([
      StudentProfile.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(),
      StudentProfile.countDocuments(filter),
    ]);
    const users = new Map((await User.find({ _id: { $in: profiles.map((p) => p.userId) } }).select('name email accountStatus').lean()).map((u) => [String(u._id), u]));
    return ok(res, profiles.map((p) => ({
      _id: p._id, studentId: p.studentId, rollNumber: p.rollNumber, department: p.department, degree: p.degree, graduationYear: p.graduationYear,
      verificationStatus: p.verificationStatus, cgpaEntered: p.academicSummary?.entered?.cgpa ?? null, cgpaVerified: p.academicSummary?.verified?.cgpa ?? null,
      activeBacklogsEntered: p.academicSummary?.entered?.activeBacklogs ?? null,
      user: users.get(String(p.userId)),
    })), pageMeta(pg, total));
  })
);

adminRouter.get('/students/import/template', asyncHandler(async (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="student_import_template.csv"');
  res.send(`${IMPORT_COLUMNS.join(',')}\r\nCS2024001,22CS001,Asha Verma,asha.verma@college.edu,CSE,B.Tech,2028,5,8.4,0,0,92,88,,9876543210\r\n`);
}));

adminRouter.post(
  '/students/import',
  uploadCsv,
  validate({ query: z.object({ dryRun: zBool.optional(), createMissing: zBool.optional() }) }),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Upload a CSV file in the "file" field', 'FILE_REQUIRED');
    const dryRun = req.query.dryRun !== false; // default to preview: nothing is written unless dryRun=false is explicit
    const result = await importStudents({ buffer: req.file.buffer, dryRun, createMissing: req.query.createMissing !== false, actor: req.user });
    await audit({ actor: req.user, action: dryRun ? 'students.import_preview' : 'students.imported', entityType: 'StudentProfile', metadata: result.summary, req });
    return ok(res, result);
  })
);

adminRouter.get('/students/duplicates', asyncHandler(async (_req, res) => {
  const profiles = await StudentProfile.find({}).select('studentId rollNumber department graduationYear personal.contactNumber userId').lean();
  const users = new Map((await User.find({ _id: { $in: profiles.map((p) => p.userId) } }).select('name email').lean()).map((u) => [String(u._id), u]));
  const groups = new Map();
  const add = (key, p) => { if (!groups.has(key)) groups.set(key, []); groups.get(key).push({ _id: p._id, studentId: p.studentId, rollNumber: p.rollNumber, name: users.get(String(p.userId))?.name, email: users.get(String(p.userId))?.email }); };
  for (const p of profiles) {
    const u = users.get(String(p.userId));
    if (u?.name) add(`name:${u.name.toLowerCase().replace(/\s+/g, ' ')}|${p.department}|${p.graduationYear}`, p);
    if (p.personal?.contactNumber) add(`phone:${p.personal.contactNumber.replace(/\D/g, '')}`, p);
  }
  return ok(res, [...groups.entries()].filter(([, v]) => v.length > 1).map(([key, records]) => ({ reason: key.startsWith('phone') ? 'Same contact number' : 'Same name, department and batch', records })));
}));

adminRouter.get('/students/:id', objectIdParams('id'), asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findById(req.params.id);
  if (!profile) throw notFound('Student not found');
  const [user, records, projects, resumes, applications] = await Promise.all([
    User.findById(profile.userId),
    AcademicRecord.find({ studentId: profile._id }).sort({ recordType: 1, semester: 1 }).lean(),
    StudentProject.find({ studentId: profile._id }).lean(),
    Resume.find({ studentId: profile._id, isActive: true }),
    Application.find({ studentId: profile._id }).sort({ appliedAt: -1 }).populate('driveId', 'jobTitle').populate('companyId', 'name').lean(),
  ]);
  return ok(res, { user, profile, academicRecords: records, projects, resumes, applications: applications.map(({ driveId, companyId, ...a }) => ({ ...a, drive: driveId, company: companyId })) });
}));

const correctionInput = z.object({
  name: zReqText(120).optional(),
  studentId: zReqText(40).optional(),
  rollNumber: zReqText(40).optional(),
  department: zReqText(40).optional(),
  degree: zText(60).optional(),
  graduationYear: z.coerce.number().int().min(2000).max(MAX_GRADUATION_YEAR).optional(),
  currentSemester: zNullableNum(1, 12),
  academic: z.object({ cgpa: zNullableNum(0, 10), activeBacklogs: zNullableNum(0, 100), totalBacklogs: zNullableNum(0, 100), tenthPercentage: zNullableNum(0, 100), twelfthPercentage: zNullableNum(0, 100), diplomaPercentage: zNullableNum(0, 100) }).optional(),
  reason: zReqText(500),
});

// Authorised correction (BR-15): requires a reason, writes before/after to the audit log
adminRouter.put('/students/:id', objectIdParams('id'), validate({ body: correctionInput }), asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findById(req.params.id);
  if (!profile) throw notFound('Student not found');
  const before = profile.toObject();
  const { reason, name, academic, ...fields } = req.body;
  if (name) await User.updateOne({ _id: profile.userId }, { $set: { name } });
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) profile[k] = k === 'department' ? normalizeDept(v) : v;
  if (academic) {
    for (const [k, v] of Object.entries(academic)) {
      if (v === undefined) continue;
      profile.academicSummary.entered[k] = v;
      if (profile.verificationStatus === PROFILE_VERIFICATION.VERIFIED) profile.academicSummary.verified[k] = v;
    }
    if (profile.verificationStatus === PROFILE_VERIFICATION.VERIFIED) {
      profile.academicSummary.verified.verifiedAt = new Date();
      profile.academicSummary.verified.verifiedBy = req.user._id;
      profile.academicSummary.verified.source = 'tpo';
    }
  }
  await profile.save();
  await audit({ actor: req.user, action: 'student.record_corrected', entityType: 'StudentProfile', entityId: profile._id, metadata: { reason, before: { department: before.department, graduationYear: before.graduationYear, academicSummary: before.academicSummary, studentId: before.studentId, rollNumber: before.rollNumber }, after: { ...fields, academic } }, req });
  notify(profile.userId, { type: 'profile_verification', title: 'Your record was corrected', message: `The placement cell updated your student record. Reason: ${reason}`, relatedEntity: { kind: 'profile', id: profile._id } });
  return ok(res, profile);
}));

// Academic verification: copies student-entered values (optionally corrected by the TPO) into the verified record.
adminRouter.post(
  '/students/:id/verify',
  objectIdParams('id'),
  validate({ body: z.object({ overrides: z.object({ cgpa: zNullableNum(0, 10), activeBacklogs: zNullableNum(0, 100), totalBacklogs: zNullableNum(0, 100), tenthPercentage: zNullableNum(0, 100), twelfthPercentage: zNullableNum(0, 100), diplomaPercentage: zNullableNum(0, 100) }).optional(), note: zText(1000).optional() }) }),
  asyncHandler(async (req, res) => {
    const profile = await StudentProfile.findById(req.params.id);
    if (!profile) throw notFound('Student not found');
    const entered = profile.academicSummary.entered.toObject();
    const values = { ...entered };
    for (const [k, v] of Object.entries(req.body.overrides || {})) if (v !== undefined) values[k] = v;
    if (values.cgpa == null || values.activeBacklogs == null) throw badRequest('CGPA and active backlogs are required before an academic record can be verified', 'INCOMPLETE_ACADEMIC_DATA');
    if (values.totalBacklogs == null) values.totalBacklogs = values.activeBacklogs;
    const corrected = JSON.stringify(values) !== JSON.stringify({ ...entered, totalBacklogs: entered.totalBacklogs ?? values.totalBacklogs });
    profile.academicSummary.verified = { ...values, verifiedAt: new Date(), verifiedBy: req.user._id, source: 'tpo' };
    profile.academicSummary.entered = { ...values };
    profile.verificationStatus = PROFILE_VERIFICATION.VERIFIED;
    profile.verificationNote = req.body.note;
    profile.verificationUpdatedAt = new Date();
    await profile.save();
    await AcademicRecord.updateMany({ studentId: profile._id, verificationStatus: PROFILE_VERIFICATION.PENDING }, { $set: { verificationStatus: PROFILE_VERIFICATION.VERIFIED, verifiedBy: req.user._id, verifiedAt: new Date() } });
    await audit({ actor: req.user, action: 'student.academic_verified', entityType: 'StudentProfile', entityId: profile._id, metadata: { corrected, entered, verified: values }, req });
    notify(profile.userId, { type: 'profile_verification', title: 'Academic record verified', message: 'Your academic details have been verified. You can now apply to eligible drives.', relatedEntity: { kind: 'profile', id: profile._id } });
    return ok(res, profile);
  })
);

adminRouter.post('/students/:id/reject-verification', objectIdParams('id'), validate({ body: z.object({ note: zReqText(1000) }) }), asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findById(req.params.id);
  if (!profile) throw notFound('Student not found');
  profile.verificationStatus = PROFILE_VERIFICATION.CORRECTION_REQUIRED;
  profile.verificationNote = req.body.note;
  profile.verificationUpdatedAt = new Date();
  await profile.save();
  await audit({ actor: req.user, action: 'student.verification_rejected', entityType: 'StudentProfile', entityId: profile._id, metadata: { note: req.body.note }, req });
  notify(profile.userId, { type: 'profile_verification', title: 'Correction required', message: `Please correct your academic details: ${req.body.note}`, relatedEntity: { kind: 'profile', id: profile._id } });
  return ok(res, profile);
}));

for (const [action, status] of [['deactivate', ACCOUNT_STATUS.DEACTIVATED], ['activate', ACCOUNT_STATUS.ACTIVE]]) {
  adminRouter.post(`/students/:id/${action}`, objectIdParams('id'), asyncHandler(async (req, res) => {
    const profile = await StudentProfile.findById(req.params.id);
    if (!profile) throw notFound('Student not found');
    await User.updateOne({ _id: profile.userId }, { $set: { accountStatus: status } });
    if (status === ACCOUNT_STATUS.DEACTIVATED) await authSvc.revokeAllSessions(profile.userId);
    await audit({ actor: req.user, action: `user.${action}d`, entityType: 'User', entityId: profile.userId, req });
    return ok(res, { accountStatus: status });
  }));
}

adminRouter.post('/academic-records/:id/:decision(verify|reject)', objectIdParams('id'), asyncHandler(async (req, res) => {
  const rec = await AcademicRecord.findById(req.params.id);
  if (!rec) throw notFound('Record not found');
  rec.verificationStatus = req.params.decision === 'verify' ? PROFILE_VERIFICATION.VERIFIED : PROFILE_VERIFICATION.CORRECTION_REQUIRED;
  rec.verifiedBy = req.user._id;
  rec.verifiedAt = new Date();
  rec.note = req.body?.note;
  await rec.save();
  await audit({ actor: req.user, action: `academic_record.${req.params.decision}`, entityType: 'AcademicRecord', entityId: rec._id, req });
  return ok(res, rec);
}));

// ================================================================= companies
adminRouter.get('/companies', validate({ query: z.object({ ...paginationQuery, status: z.enum(Object.values(COMPANY_STATUS)).optional() }) }), asyncHandler(async (req, res) => {
  const pg = parsePagination(req.query);
  const filter = { ...(req.query.status ? { verificationStatus: req.query.status } : {}), ...(req.query.q ? { name: new RegExp(escapeRegex(req.query.q), 'i') } : {}) };
  const [items, total] = await Promise.all([Company.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), Company.countDocuments(filter)]);
  const drives = await PlacementDrive.aggregate([{ $match: { companyId: { $in: items.map((c) => c._id) } } }, { $group: { _id: '$companyId', n: { $sum: 1 } } }]);
  const dm = new Map(drives.map((d) => [String(d._id), d.n]));
  return ok(res, items.map((c) => ({ ...c, nameKey: undefined, driveCount: dm.get(String(c._id)) || 0 })), pageMeta(pg, total));
}));

adminRouter.get('/companies/:id', objectIdParams('id'), asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw notFound('Company not found');
  const [members, drives] = await Promise.all([
    CompanyUser.find({ companyId: company._id }).populate('userId', 'name email accountStatus').lean(),
    PlacementDrive.find({ companyId: company._id }).sort({ createdAt: -1 }).select('jobTitle approvalStatus publicationStatus applicationDeadline').lean(),
  ]);
  return ok(res, { company, members: members.map(({ userId, ...m }) => ({ ...m, user: userId })), drives });
}));

const companyAction = (action, { status, needReason, label }) =>
  adminRouter.post(`/companies/:id/${action}`, objectIdParams('id'), validate({ body: z.object({ reason: needReason ? zReqText(1000) : zText(1000).optional() }) }), asyncHandler(async (req, res) => {
    const company = await Company.findById(req.params.id);
    if (!company) throw notFound('Company not found');
    if (company.verificationStatus === status) throw conflict(`Company is already ${status}`, 'INVALID_STATE');
    if (action === 'review' && company.verificationStatus !== COMPANY_STATUS.PENDING) throw conflict('Only pending companies can be moved to review', 'INVALID_STATE');
    company.verificationStatus = status;
    company.statusReason = status === COMPANY_STATUS.VERIFIED ? undefined : req.body.reason;
    if (status === COMPANY_STATUS.VERIFIED) { company.verifiedBy = req.user._id; company.verifiedAt = new Date(); }
    await company.save();
    let pausedDrives = 0;
    if (status === COMPANY_STATUS.SUSPENDED) pausedDrives = await driveSvc.applyCompanySuspension(company, req.user);
    await audit({ actor: req.user, action: `company.${label}`, entityType: 'Company', entityId: company._id, metadata: { reason: req.body.reason, pausedDrives }, req });
    companyMemberUserIds(company._id).then((ids) => notify(ids, { type: 'company_verification', title: `Company ${label}`, message: `${company.name} has been ${label}.${req.body.reason ? ' Reason: ' + req.body.reason : ''}`, relatedEntity: { kind: 'company', id: company._id } }));
    return ok(res, { company, pausedDrives });
  }));
companyAction('review', { status: COMPANY_STATUS.UNDER_REVIEW, needReason: false, label: 'under review' });
companyAction('approve', { status: COMPANY_STATUS.VERIFIED, needReason: false, label: 'verified' });
companyAction('reject', { status: COMPANY_STATUS.REJECTED, needReason: true, label: 'rejected' });
companyAction('suspend', { status: COMPANY_STATUS.SUSPENDED, needReason: true, label: 'suspended' });

// ================================================================= drives
adminRouter.get('/drives/pending', asyncHandler(async (_req, res) => {
  const drives = await PlacementDrive.find({ approvalStatus: { $in: [APPROVAL.SUBMITTED, APPROVAL.UNDER_REVIEW] } }).sort({ submittedAt: 1 }).populate('companyId', 'name verificationStatus website industry').lean();
  return ok(res, drives.map(({ companyId, ...d }) => ({ ...d, company: companyId })));
}));

adminRouter.get('/drives', validate({ query: z.object({ ...paginationQuery, approvalStatus: z.string().max(30).optional(), publicationStatus: z.string().max(30).optional(), companyId: zObjectId.optional() }) }), asyncHandler(async (req, res) => {
  const pg = parsePagination(req.query);
  const filter = {};
  for (const k of ['approvalStatus', 'publicationStatus', 'companyId']) if (req.query[k]) filter[k] = req.query[k];
  if (req.query.q) filter.jobTitle = new RegExp(escapeRegex(req.query.q), 'i');
  const [items, total] = await Promise.all([PlacementDrive.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('companyId', 'name').lean(), PlacementDrive.countDocuments(filter)]);
  const counts = await Application.aggregate([{ $match: { driveId: { $in: items.map((d) => d._id) } } }, { $group: { _id: '$driveId', n: { $sum: 1 } } }]);
  const cm = new Map(counts.map((c) => [String(c._id), c.n]));
  return ok(res, items.map(({ companyId, ...d }) => ({ ...d, company: companyId, applicantCount: cm.get(String(d._id)) || 0 })), pageMeta(pg, total));
}));

adminRouter.get('/drives/:id', objectIdParams('id'), asyncHandler(async (req, res) => {
  const drive = await PlacementDrive.findById(req.params.id);
  if (!drive) throw notFound('Drive not found');
  const [company, rounds, versions, byStatus] = await Promise.all([
    Company.findById(drive.companyId), RecruitmentRound.find({ driveId: drive._id }).sort({ sequence: 1 }),
    DriveRuleVersion.find({ driveId: drive._id }).sort({ version: -1 }).limit(20).lean(),
    Application.aggregate([{ $match: { driveId: drive._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  return ok(res, { drive, company, rounds, ruleVersions: versions, applicationsByStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])) });
}));

for (const [path, action] of [['review', 'review'], ['approve', 'approve'], ['reject', 'reject'], ['request-changes', 'request_changes'], ['publish', 'publish'], ['pause', 'pause'], ['resume', 'resume'], ['cancel', 'cancel'], ['close', 'close']]) {
  adminRouter.post(`/drives/:id/${path}`, objectIdParams('id'), validate({ body: z.object({ reason: zText(1000).optional() }) }), asyncHandler(async (req, res) => {
    const drive = await PlacementDrive.findById(req.params.id);
    if (!drive) throw notFound('Drive not found');
    const upd = await driveSvc.reviewDrive({ drive, action, actor: req.user, reason: req.body.reason });
    await audit({ actor: req.user, action: `drive.${action}`, entityType: 'PlacementDrive', entityId: drive._id, metadata: { reason: req.body.reason, approvalStatus: upd.approvalStatus, publicationStatus: upd.publicationStatus }, req });
    return ok(res, upd);
  }));
}

// ================================================================= applications / offers monitoring (minimal PII)
adminRouter.get('/applications', validate({ query: z.object({ ...paginationQuery, driveId: zObjectId.optional(), companyId: zObjectId.optional(), status: z.enum(APP_STATUS_LIST).optional(), department: z.string().max(100).optional() }) }), asyncHandler(async (req, res) => {
  const pg = parsePagination(req.query);
  const filter = {};
  for (const k of ['driveId', 'companyId', 'status']) if (req.query[k]) filter[k] = req.query[k];
  if (req.query.department) {
    const ids = await StudentProfile.find({ department: normalizeDept(req.query.department) }).select('_id').lean();
    filter.studentId = { $in: ids.map((i) => i._id) };
  }
  const [apps, total] = await Promise.all([Application.find(filter).sort({ appliedAt: -1 }).skip(pg.skip).limit(pg.limit).populate('driveId', 'jobTitle').populate('companyId', 'name').lean(), Application.countDocuments(filter)]);
  const profiles = new Map((await StudentProfile.find({ _id: { $in: apps.map((a) => a.studentId) } }).select('studentId department userId').lean()).map((p) => [String(p._id), p]));
  const users = new Map((await User.find({ _id: { $in: [...profiles.values()].map((p) => p.userId) } }).select('name').lean()).map((u) => [String(u._id), u.name]));
  return ok(res, apps.map((a) => {
    const p = profiles.get(String(a.studentId));
    return { _id: a._id, status: a.status, appliedAt: a.appliedAt, statusUpdatedAt: a.statusUpdatedAt, drive: a.driveId, company: a.companyId, eligibility: a.eligibilitySnapshot?.result, student: { studentId: p?.studentId, name: users.get(String(p?.userId)), department: p?.department } };
  }), pageMeta(pg, total));
}));

adminRouter.get('/offers', validate({ query: z.object({ ...paginationQuery, status: z.enum(Object.values(OFFER_STATUS)).optional(), companyId: zObjectId.optional() }) }), asyncHandler(async (req, res) => {
  const pg = parsePagination(req.query);
  const filter = { ...(req.query.status ? { status: req.query.status } : {}), ...(req.query.companyId ? { companyId: req.query.companyId } : {}) };
  const [items, total] = await Promise.all([Offer.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('companyId', 'name').lean(), Offer.countDocuments(filter)]);
  const profiles = new Map((await StudentProfile.find({ _id: { $in: items.map((o) => o.studentId) } }).select('studentId department userId').lean()).map((p) => [String(p._id), p]));
  const users = new Map((await User.find({ _id: { $in: [...profiles.values()].map((p) => p.userId) } }).select('name').lean()).map((u) => [String(u._id), u.name]));
  return ok(res, items.map(({ companyId, documentStorageKey, ...o }) => ({ ...o, company: companyId, hasDocument: !!o.documentOriginalName, student: { studentId: profiles.get(String(o.studentId))?.studentId, name: users.get(String(profiles.get(String(o.studentId))?.userId)), department: profiles.get(String(o.studentId))?.department } })), pageMeta(pg, total));
}));

// ================================================================= policies (versioned, effective-dated)
adminRouter.get('/policies', asyncHandler(async (req, res) => ok(res, await policySvc.listPoliciesWithMeta(req.user.role === ROLES.SUPER_ADMIN ? undefined : 'placement'))));
adminRouter.get('/policies/:key/history', asyncHandler(async (req, res) => ok(res, await policySvc.policyHistory(req.params.key))));
adminRouter.put('/policies/:key', validate({ body: z.object({ value: z.any(), effectiveFrom: zDate.optional(), note: zText(500).optional() }) }), asyncHandler(async (req, res) => {
  const key = req.params.key;
  if (POLICY_CATEGORY[key] === 'system' && req.user.role !== ROLES.SUPER_ADMIN) throw forbidden('Only a Super Admin can change system settings', 'SUPER_ADMIN_REQUIRED');
  if (req.body.value === undefined) throw badRequest('value is required', 'VALUE_REQUIRED');
  const row = await policySvc.setPolicy({ key, value: req.body.value, effectiveFrom: req.body.effectiveFrom, note: req.body.note, actor: req.user });
  await audit({ actor: req.user, action: 'policy.changed', entityType: 'Policy', entityId: row._id, metadata: { key, value: req.body.value, effectiveFrom: row.effectiveFrom, note: req.body.note }, req });
  return ok(res, row);
}));

// ================================================================= reports & exports (no unnecessary PII)
const REPORTS = {
  departments: async (q) => {
    const r = await analytics.departmentReport({ graduationYear: q.graduationYear, driveId: q.driveId });
    return { sheet: 'Departments', rows: r.rows, columns: [
      { header: 'Department', key: 'department' }, { header: 'Registered students', key: 'totalRegistered' }, { header: 'Eligible students', key: 'eligibleStudents' },
      { header: 'Students applied', key: 'studentsApplied' }, { header: 'Students placed', key: 'studentsPlaced' }, { header: 'Offers issued', key: 'offersIssued' },
      { header: 'Offers accepted', key: 'offersAccepted' }, { header: 'Placement %', key: 'placementPercentage' }] };
  },
  companies: async () => {
    const r = await analytics.companyReport();
    return { sheet: 'Companies', rows: r.rows, columns: [
      { header: 'Company', key: 'company' }, { header: 'Drives', key: 'drives' }, { header: 'Applicants', key: 'totalApplicants' }, { header: 'Shortlisted', key: 'shortlisted' },
      { header: 'Interviews conducted', key: 'interviewsConducted' }, { header: 'Selected', key: 'selected' }, { header: 'Offers issued', key: 'offersIssued' }, { header: 'Offers accepted', key: 'offersAccepted' }] };
  },
  salary: async (q) => {
    const r = await analytics.salaryReport({ scope: q.scope || 'accepted' });
    return { sheet: 'Salary', rows: r.groups, columns: [
      { header: 'Compensation type', key: 'kind' }, { header: 'Unit', key: 'unit' }, { header: 'Currency', key: 'currency' }, { header: 'Offers', key: 'count' },
      { header: 'Minimum', key: 'min' }, { header: 'Maximum', key: 'max' }, { header: 'Average', key: 'average' }, { header: 'Median', key: 'median' }] };
  },
  applications: async (q) => {
    const filter = {};
    if (q.driveId) filter.driveId = q.driveId;
    const apps = await Application.find(filter).sort({ appliedAt: -1 }).limit(20000).populate('driveId', 'jobTitle').populate('companyId', 'name').lean();
    const profiles = new Map((await StudentProfile.find({ _id: { $in: apps.map((a) => a.studentId) } }).select('studentId department graduationYear userId').lean()).map((p) => [String(p._id), p]));
    const users = new Map((await User.find({ _id: { $in: [...profiles.values()].map((p) => p.userId) } }).select('name').lean()).map((u) => [String(u._id), u.name]));
    const rows = apps.map((a) => { const p = profiles.get(String(a.studentId)); return { company: a.companyId?.name, job: a.driveId?.jobTitle, studentId: p?.studentId, name: users.get(String(p?.userId)), department: p?.department, year: p?.graduationYear, status: a.status, appliedAt: a.appliedAt }; });
    return { sheet: 'Applications', rows, columns: [
      { header: 'Company', key: 'company' }, { header: 'Job title', key: 'job' }, { header: 'Student ID', key: 'studentId' }, { header: 'Name', key: 'name' },
      { header: 'Department', key: 'department' }, { header: 'Graduation year', key: 'year' }, { header: 'Status', key: 'status' }, { header: 'Applied at', key: 'appliedAt' }] };
  },
  offers: async () => {
    const offers = await Offer.find({ status: { $ne: OFFER_STATUS.DRAFT } }).sort({ createdAt: -1 }).limit(20000).populate('companyId', 'name').lean();
    const profiles = new Map((await StudentProfile.find({ _id: { $in: offers.map((o) => o.studentId) } }).select('studentId department').lean()).map((p) => [String(p._id), p]));
    const rows = offers.map((o) => ({ company: o.companyId?.name, job: o.jobTitle, studentId: profiles.get(String(o.studentId))?.studentId, department: profiles.get(String(o.studentId))?.department, kind: o.compensation.kind, amount: o.compensation.amount, currency: o.compensation.currency, status: o.status, version: o.version, issuedAt: o.issuedAt, respondedAt: o.respondedAt }));
    return { sheet: 'Offers', rows, columns: [
      { header: 'Company', key: 'company' }, { header: 'Job title', key: 'job' }, { header: 'Student ID', key: 'studentId' }, { header: 'Department', key: 'department' },
      { header: 'Compensation type', key: 'kind' }, { header: 'Amount', key: 'amount' }, { header: 'Currency', key: 'currency' }, { header: 'Status', key: 'status' },
      { header: 'Version', key: 'version' }, { header: 'Issued at', key: 'issuedAt' }, { header: 'Responded at', key: 'respondedAt' }] };
  },
  students: async () => {
    const profiles = await StudentProfile.find({}).select('studentId rollNumber department degree graduationYear verificationStatus userId').limit(20000).lean();
    const users = new Map((await User.find({ _id: { $in: profiles.map((p) => p.userId) } }).select('name').lean()).map((u) => [String(u._id), u.name]));
    const placed = new Set((await Offer.distinct('studentId', { status: OFFER_STATUS.ACCEPTED, isCurrent: true })).map(String));
    const rows = profiles.map((p) => ({ studentId: p.studentId, rollNumber: p.rollNumber, name: users.get(String(p.userId)), department: p.department, degree: p.degree, year: p.graduationYear, verification: p.verificationStatus, placed: placed.has(String(p._id)) ? 'Yes' : 'No' }));
    return { sheet: 'Students', rows, columns: [
      { header: 'Student ID', key: 'studentId' }, { header: 'Roll number', key: 'rollNumber' }, { header: 'Name', key: 'name' }, { header: 'Department', key: 'department' },
      { header: 'Degree', key: 'degree' }, { header: 'Graduation year', key: 'year' }, { header: 'Verification', key: 'verification' }, { header: 'Placed', key: 'placed' }] };
  },
};

adminRouter.get(
  '/reports/:type',
  validate({ query: z.object({ format: z.enum(['csv', 'xlsx', 'json']).optional(), graduationYear: z.coerce.number().int().optional(), driveId: zObjectId.optional(), scope: z.enum(['accepted', 'issued']).optional() }) }),
  asyncHandler(async (req, res) => {
    const gen = REPORTS[req.params.type];
    if (!gen) throw notFound(`Unknown report. Available: ${Object.keys(REPORTS).join(', ')}`);
    const { sheet, rows, columns } = await gen(req.query);
    await audit({ actor: req.user, action: 'report.exported', entityType: 'Report', metadata: { type: req.params.type, format: req.query.format || 'csv', rows: rows.length }, req });
    if (req.query.format === 'json') return ok(res, { columns: columns.map((c) => c.header), rows });
    return sendTable(res, { format: req.query.format || 'csv', filename: `cpms_${req.params.type}_${new Date().toISOString().slice(0, 10)}`, columns, rows, sheetName: sheet });
  })
);

// ================================================================= audit logs
adminRouter.get(
  '/audit-logs',
  validate({ query: z.object({ ...paginationQuery, action: z.string().max(100).optional(), entityType: z.string().max(60).optional(), entityId: zObjectId.optional(), actorId: zObjectId.optional(), from: zDate.optional(), to: zDate.optional() }) }),
  asyncHandler(async (req, res) => {
    const pg = parsePagination(req.query, { defaultLimit: 50 });
    const f = {};
    if (req.query.action) f.action = new RegExp(`^${escapeRegex(req.query.action)}`);
    for (const k of ['entityType', 'entityId', 'actorId']) if (req.query[k]) f[k] = req.query[k];
    if (req.query.from || req.query.to) f.createdAt = { ...(req.query.from ? { $gte: req.query.from } : {}), ...(req.query.to ? { $lte: req.query.to } : {}) };
    const [items, total] = await Promise.all([AuditLog.find(f).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('actorId', 'name email role').lean(), AuditLog.countDocuments(f)]);
    return ok(res, items.map(({ actorId, ...l }) => ({ ...l, actor: actorId })), pageMeta(pg, total));
  })
);

// ================================================================= tickets (complaints, correction requests, contact)
adminRouter.get('/tickets', validate({ query: z.object({ ...paginationQuery, status: z.enum(TICKET_STATUS).optional(), type: z.enum(TICKET_TYPES).optional() }) }), asyncHandler(async (req, res) => {
  const pg = parsePagination(req.query);
  const f = { ...(req.query.status ? { status: req.query.status } : {}), ...(req.query.type ? { type: req.query.type } : {}) };
  const [items, total] = await Promise.all([Ticket.find(f).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('createdBy', 'name email role').lean(), Ticket.countDocuments(f)]);
  return ok(res, items, pageMeta(pg, total));
}));
adminRouter.put('/tickets/:id', objectIdParams('id'), validate({ body: z.object({ status: z.enum(TICKET_STATUS).optional(), response: zText(3000).optional() }) }), asyncHandler(async (req, res) => {
  const t = await Ticket.findById(req.params.id);
  if (!t) throw notFound('Ticket not found');
  if (req.body.response) t.responses.push({ by: req.user._id, message: req.body.response });
  if (req.body.status) {
    t.status = req.body.status;
    if (['resolved', 'rejected'].includes(req.body.status)) { t.resolvedBy = req.user._id; t.resolvedAt = new Date(); }
  }
  await t.save();
  await audit({ actor: req.user, action: 'ticket.updated', entityType: 'Ticket', entityId: t._id, metadata: { status: t.status, type: t.type }, req });
  if (t.createdBy) notify(t.createdBy, { type: 'ticket_update', title: 'Your request was updated', message: `"${t.subject}" is now ${t.status}.${req.body.response ? ' ' + req.body.response : ''}`, relatedEntity: { kind: 'ticket', id: t._id } });
  return ok(res, t);
}));

// ================================================================= user management & system (Super Admin)
const userRouter = Router();
userRouter.use(superOnly);

userRouter.get('/', validate({ query: z.object({ ...paginationQuery, role: z.enum(ROLE_LIST).optional(), accountStatus: z.enum(Object.values(ACCOUNT_STATUS)).optional() }) }), asyncHandler(async (req, res) => {
  const pg = parsePagination(req.query);
  const f = { ...(req.query.role ? { role: req.query.role } : {}), ...(req.query.accountStatus ? { accountStatus: req.query.accountStatus } : {}) };
  if (req.query.q) { const rx = new RegExp(escapeRegex(req.query.q), 'i'); f.$or = [{ name: rx }, { email: rx }]; }
  const [items, total] = await Promise.all([User.find(f).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).select('+lockedUntil'), User.countDocuments(f)]);
  return ok(res, items.map((u) => ({ ...u.toJSON(), locked: !!(u.lockedUntil && u.lockedUntil > new Date()) })), pageMeta(pg, total));
}));

userRouter.post('/', validate({ body: z.object({ name: zReqText(120), email: zEmail, password: zPassword, role: z.enum([ROLES.TPO, ROLES.SUPER_ADMIN]) }) }), asyncHandler(async (req, res) => {
  const user = await authSvc.createStaffUser({ actor: req.user, ...req.body, req });
  return created(res, user);
}));

async function lastSuperAdminGuard(target) {
  if (target.role === ROLES.SUPER_ADMIN && target.accountStatus === ACCOUNT_STATUS.ACTIVE) {
    const others = await User.countDocuments({ role: ROLES.SUPER_ADMIN, accountStatus: ACCOUNT_STATUS.ACTIVE, _id: { $ne: target._id } });
    if (!others) throw conflict('At least one active Super Admin must remain', 'LAST_SUPER_ADMIN');
  }
}

userRouter.put('/:id/role', objectIdParams('id'), validate({ body: z.object({ role: z.enum(ROLE_LIST) }) }), asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) throw notFound('User not found');
  if (String(target._id) === String(req.user._id)) throw forbidden('You cannot change your own role', 'SELF_ROLE_CHANGE');
  // Student / recruiter accounts own role-specific data (profile, company membership), so only staff roles can be switched.
  if (!ADMIN_ROLES.includes(target.role) || !ADMIN_ROLES.includes(req.body.role)) {
    throw badRequest('Only staff accounts can be switched between tpo and super_admin. Student and recruiter accounts cannot be converted.', 'ROLE_CHANGE_NOT_ALLOWED');
  }
  if (target.role !== req.body.role) await lastSuperAdminGuard(target);
  const previous = target.role;
  target.role = req.body.role;
  await target.save();
  await authSvc.revokeAllSessions(target._id);
  await audit({ actor: req.user, action: 'user.role_changed', entityType: 'User', entityId: target._id, metadata: { from: previous, to: req.body.role }, req });
  return ok(res, target);
}));

for (const [action, status] of [['deactivate', ACCOUNT_STATUS.DEACTIVATED], ['activate', ACCOUNT_STATUS.ACTIVE]]) {
  userRouter.post(`/:id/${action}`, objectIdParams('id'), asyncHandler(async (req, res) => {
    const target = await User.findById(req.params.id);
    if (!target) throw notFound('User not found');
    if (status === ACCOUNT_STATUS.DEACTIVATED) {
      if (String(target._id) === String(req.user._id)) throw forbidden('You cannot deactivate your own account', 'SELF_DEACTIVATE');
      await lastSuperAdminGuard(target);
    }
    target.accountStatus = status;
    await target.save();
    if (status === ACCOUNT_STATUS.DEACTIVATED) await authSvc.revokeAllSessions(target._id);
    await audit({ actor: req.user, action: `user.${action}d`, entityType: 'User', entityId: target._id, req });
    return ok(res, target);
  }));
}

userRouter.post('/:id/unlock', objectIdParams('id'), asyncHandler(async (req, res) => {
  const r = await User.updateOne({ _id: req.params.id }, { $set: { failedLoginCount: 0, lockedUntil: null } });
  if (!r.matchedCount) throw notFound('User not found');
  await audit({ actor: req.user, action: 'user.unlocked', entityType: 'User', entityId: req.params.id, req });
  return ok(res, { unlocked: true });
}));

userRouter.post('/:id/revoke-sessions', objectIdParams('id'), asyncHandler(async (req, res) => {
  await authSvc.revokeAllSessions(req.params.id);
  await audit({ actor: req.user, action: 'user.sessions_revoked', entityType: 'User', entityId: req.params.id, req });
  return ok(res, { revoked: true });
}));
adminRouter.use('/users', userRouter);

adminRouter.get('/system/health', superOnly, asyncHandler(async (_req, res) => {
  const [users, queued, failed, activeSessions, auditCount] = await Promise.all([
    User.countDocuments({}), EmailLog.countDocuments({ providerStatus: { $in: ['queued', 'retrying'] } }), EmailLog.countDocuments({ providerStatus: 'failed' }),
    Session.countDocuments({ revokedAt: null, expiresAt: { $gt: new Date() } }), AuditLog.estimatedDocumentCount(),
  ]);
  return ok(res, { database: dbState(), uptimeSeconds: Math.round(process.uptime()), users, activeSessions, emailQueue: { pending: queued, failed }, auditLogEntries: auditCount, node: process.version });
}));

export { Policy };
