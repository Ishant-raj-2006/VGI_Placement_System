import { Router } from 'express';
import { z } from 'zod';
import { validate, objectIdParams, zEmail, zReqText, zText, paginationQuery, zBool } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { sensitiveLimiter } from '../middleware/rateLimit.js';
import { asyncHandler, parsePagination, pageMeta } from '../utils/helpers.js';
import { ok, created } from '../utils/response.js';
import { Notification, Ticket, Resume, Application, Offer, StudentProfile, PlacementDrive, CompanyUser } from '../models/index.js';
import { notFound, forbidden } from '../utils/AppError.js';
import * as storage from '../services/storage.service.js';
import { ROLES } from '../constants/index.js';

// ======================= NOTIFICATIONS (all roles) =======================
export const notificationRouter = Router();
notificationRouter.use(authenticate);

notificationRouter.get(
  '/',
  validate({ query: z.object({ ...paginationQuery, unread: zBool.optional() }) }),
  asyncHandler(async (req, res) => {
    const pg = parsePagination(req.query);
    const filter = { userId: req.user._id, ...(req.query.unread ? { readAt: null } : {}) };
    const [items, total, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: req.user._id, readAt: null }),
    ]);
    return ok(res, items, { ...pageMeta(pg, total), unread });
  })
);

notificationRouter.get('/unread-count', asyncHandler(async (req, res) => ok(res, { unread: await Notification.countDocuments({ userId: req.user._id, readAt: null }) })));

notificationRouter.post('/read-all', asyncHandler(async (req, res) => {
  const r = await Notification.updateMany({ userId: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  return ok(res, { updated: r.modifiedCount });
}));

notificationRouter.post('/:id/read', objectIdParams('id'), asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: { readAt: new Date() } }, { new: true });
  if (!n) throw notFound('Notification not found');
  return ok(res, n);
}));

// ======================= SUPPORT / CONTACT / COMPLAINTS =======================
export const supportRouter = Router();

// Public contact form (rate limited)
supportRouter.post(
  '/contact',
  sensitiveLimiter,
  validate({ body: z.object({ name: zReqText(120), email: zEmail, subject: zReqText(200), message: zReqText(5000) }) }),
  asyncHandler(async (req, res) => {
    const t = await Ticket.create({ type: 'contact', createdByRole: 'public', contactName: req.body.name, contactEmail: req.body.email, subject: req.body.subject, message: req.body.message });
    return created(res, { id: t._id, message: 'Thanks! The placement cell will get back to you.' });
  })
);

supportRouter.use(authenticate);

supportRouter.post(
  '/tickets',
  validate({
    body: z.object({
      type: z.enum(['complaint', 'correction_request', 'support']),
      subject: zReqText(200),
      message: zReqText(5000),
      payload: z.object({ field: zText(60).optional(), requestedValue: z.union([z.string().max(200), z.number()]).optional() }).optional(),
      relatedEntity: z.object({ kind: z.enum(['drive', 'application', 'offer', 'company', 'profile']), id: z.string().regex(/^[a-f\d]{24}$/i) }).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    if (req.body.type === 'correction_request' && req.user.role !== ROLES.STUDENT) throw forbidden('Only students can raise correction requests');
    const t = await Ticket.create({ ...req.body, createdBy: req.user._id, createdByRole: req.user.role });
    return created(res, t);
  })
);

supportRouter.get('/tickets', asyncHandler(async (req, res) => {
  const items = await Ticket.find({ createdBy: req.user._id }).sort({ createdAt: -1 }).limit(100).populate('responses.by', 'name role').lean();
  return ok(res, items);
}));

// ======================= PRIVATE FILE DOWNLOADS =======================
// Every download is authorised per resource - there is no public URL for any file.
export const fileRouter = Router();
fileRouter.use(authenticate);

async function streamFile(res, key, name, mime, inline = false) {
  if (!key || !(await storage.exists(key))) throw notFound('File not found');
  const stream = await storage.openStream(key);
  if (!stream) throw notFound('File not found');
  res.setHeader('Content-Type', mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(name || 'file')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  stream.on('error', () => res.destroy()).pipe(res);
}

/** Who may see a student's resume/photo? The student, TPO/Super Admin, or a recruiter whose company has an application from that student. */
async function canViewStudentFiles(user, studentProfileId, { resumeId } = {}) {
  if (user.role === ROLES.TPO || user.role === ROLES.SUPER_ADMIN) return true;
  if (user.role === ROLES.STUDENT) {
    const p = await StudentProfile.findOne({ userId: user._id }).select('_id');
    return !!p && String(p._id) === String(studentProfileId);
  }
  if (user.role === ROLES.RECRUITER) {
    const m = await CompanyUser.findOne({ userId: user._id, status: 'active' });
    if (!m) return false;
    const filter = { companyId: m.companyId, studentId: studentProfileId };
    if (resumeId) filter.resumeId = resumeId; // recruiters only get the resume the student actually applied with
    return !!(await Application.exists(filter));
  }
  return false;
}

fileRouter.get('/resumes/:id', objectIdParams('id'), asyncHandler(async (req, res) => {
  const resume = await Resume.findById(req.params.id).select('+storageKey');
  if (!resume || !(await canViewStudentFiles(req.user, resume.studentId, { resumeId: resume._id }))) throw notFound('File not found'); // 404: do not confirm existence
  return streamFile(res, resume.storageKey, resume.originalName, resume.mimeType);
}));

fileRouter.get('/photos/:studentId', objectIdParams('studentId'), asyncHandler(async (req, res) => {
  const p = await StudentProfile.findById(req.params.studentId).select('+personal.photoStorageKey personal.photoMimeType');
  if (!p || !p.personal?.photoStorageKey || !(await canViewStudentFiles(req.user, p._id))) throw notFound('File not found');
  return streamFile(res, p.personal.photoStorageKey, 'photo', p.personal.photoMimeType, true);
}));

fileRouter.get('/offers/:id/document', objectIdParams('id'), asyncHandler(async (req, res) => {
  const offer = await Offer.findById(req.params.id);
  if (!offer) throw notFound('File not found');
  let allowed = false;
  if (req.user.role === ROLES.TPO || req.user.role === ROLES.SUPER_ADMIN) allowed = true;
  else if (req.user.role === ROLES.STUDENT) allowed = String(offer.userId) === String(req.user._id) && offer.status !== 'draft';
  else if (req.user.role === ROLES.RECRUITER) allowed = !!(await CompanyUser.exists({ userId: req.user._id, companyId: offer.companyId, status: 'active' }));
  if (!allowed) throw notFound('File not found');
  return streamFile(res, offer.documentStorageKey, offer.documentOriginalName || 'offer-letter.pdf', 'application/pdf');
}));

export { PlacementDrive };
