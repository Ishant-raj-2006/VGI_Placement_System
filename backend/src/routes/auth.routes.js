import { Router } from 'express';
import { z } from 'zod';
import { validate, zEmail, zPassword, zReqText, zText, zObjectId, zUrl } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { loginLimiter, sensitiveLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/helpers.js';
import { ok, created } from '../utils/response.js';
import * as auth from '../services/auth.service.js';
import { StudentProfile, CompanyUser, Company, User } from '../models/index.js';
import { audit } from '../services/audit.service.js';

const router = Router();

const recruiterRegister = z
  .object({
    role: z.literal('recruiter'),
    name: zReqText(120),
    email: zEmail,
    password: zPassword,
    joinCompanyId: zObjectId.optional(),
    company: z
      .object({
        name: zReqText(160),
        website: zUrl.optional(),
        industry: zText(120).optional(),
        description: zText(3000).optional(),
        headquarters: zText(200).optional(),
        contactEmail: zEmail.optional(),
        contactPhone: zText(20).optional(),
        registrationNumber: zText(60).optional(),
      })
      .optional(),
  })
  .refine((v) => v.joinCompanyId || v.company, { message: 'Provide company details or joinCompanyId', path: ['company'] });

router.post(
  '/register',
  sensitiveLimiter,
  validate({ body: recruiterRegister }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const result = await auth.registerRecruiter(body);
    await audit({ actor: result.user, action: 'user.registered', entityType: 'User', entityId: result.user._id, metadata: { role: result.user.role }, req });
    return created(res, {
      user: result.user,
      requiresEmailVerification: result.requiresEmailVerification,
      ...(result.membershipStatus ? { membershipStatus: result.membershipStatus } : {}),
      ...(result.devToken ? { devVerificationToken: result.devToken } : {}),
      message: result.requiresEmailVerification
        ? 'Account created. Please verify your e-mail before logging in.'
        : 'Account created. You can log in now. Academic records still need to be verified by the placement cell.',
    });
  })
);

router.post(
  '/login',
  loginLimiter,
  validate({ body: z.object({ identifier: z.string().trim().min(1).max(254).optional(), email: zEmail.optional(), password: z.string().min(1).max(128) }).refine((body) => body.identifier || body.email, { path: ['identifier'], message: 'College ID or e-mail is required' }) }),
  asyncHandler(async (req, res) => {
    const { token, expiresAt, user } = await auth.login({ ...req.body, identifier: req.body.identifier || req.body.email, ip: req.ip, userAgent: req.headers['user-agent'] });
    await audit({ actor: user, action: 'auth.login', entityType: 'User', entityId: user._id, req });
    return ok(res, { token, expiresAt, user, ...(await profileContext(user)) });
  })
);

router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await auth.logout(req.session);
  return ok(res, { message: 'Logged out' });
}));

async function profileContext(user) {
  if (user.role === 'student') {
    const p = await StudentProfile.findOne({ userId: user._id }).select('studentId rollNumber department degree graduationYear verificationStatus');
    return { profile: p };
  }
  if (user.role === 'recruiter') {
    const m = await CompanyUser.findOne({ userId: user._id });
    const company = m ? await Company.findById(m.companyId).select('name verificationStatus statusReason') : null;
    return { company, membership: m ? { companyRole: m.companyRole, status: m.status } : null };
  }
  return {};
}

router.get('/me', authenticate, asyncHandler(async (req, res) => ok(res, { user: req.user, ...(await profileContext(req.user)) })));

router.put(
  '/me',
  authenticate,
  validate({ body: z.object({ name: zReqText(120).optional(), notificationPrefs: z.object({ email: z.boolean() }).optional() }) }),
  asyncHandler(async (req, res) => {
    const u = await User.findById(req.user._id);
    if (req.body.name) u.name = req.body.name;
    if (req.body.notificationPrefs) u.notificationPrefs = req.body.notificationPrefs;
    await u.save();
    return ok(res, { user: u });
  })
);

router.post(
  '/change-password',
  authenticate,
  validate({ body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: zPassword }) }),
  asyncHandler(async (req, res) => {
    await auth.changePassword({ user: req.user, ...req.body, currentJti: req.session.jti });
    await audit({ actor: req.user, action: 'auth.password_changed', entityType: 'User', entityId: req.user._id, req });
    return ok(res, { message: 'Password changed. Other sessions were signed out.' });
  })
);

router.post(
  '/forgot-password',
  sensitiveLimiter,
  validate({ body: z.object({ email: zEmail }) }),
  asyncHandler(async (req, res) => {
    const { devToken } = await auth.forgotPassword(req.body.email);
    // Identical response whether or not the e-mail exists (FR-006)
    return ok(res, { message: 'If an account exists for this e-mail, a reset link has been sent.', ...(devToken ? { devResetToken: devToken } : {}) });
  })
);

router.post(
  '/reset-password',
  sensitiveLimiter,
  validate({ body: z.object({ token: z.string().min(20).max(200), password: zPassword }) }),
  asyncHandler(async (req, res) => {
    const user = await auth.resetPassword(req.body);
    await audit({ actor: user, action: 'auth.password_reset', entityType: 'User', entityId: user._id, req });
    return ok(res, { message: 'Password updated. You can now log in.' });
  })
);

router.post(
  '/verify-email',
  validate({ body: z.object({ token: z.string().min(20).max(200) }) }),
  asyncHandler(async (req, res) => {
    await auth.verifyEmail(req.body.token);
    return ok(res, { message: 'E-mail verified. You can now log in.' });
  })
);

router.post(
  '/resend-verification',
  sensitiveLimiter,
  validate({ body: z.object({ email: zEmail }) }),
  asyncHandler(async (req, res) => {
    const { devToken } = await auth.resendVerification(req.body.email);
    return ok(res, { message: 'If the account needs verification, a new link has been sent.', ...(devToken ? { devVerificationToken: devToken } : {}) });
  })
);

export default router;
