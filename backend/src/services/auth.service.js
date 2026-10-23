import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { User, StudentProfile, Company, CompanyUser, Session, Token } from '../models/index.js';
import { ROLES, ACCOUNT_STATUS, COMPANY_STATUS } from '../constants/index.js';
import { AppError, conflict, forbidden, unauthorized, badRequest, notFound } from '../utils/AppError.js';
import { signAccessToken } from '../utils/tokens.js';
import { normalizeEmail, sha256, randomToken, escapeRegex } from '../utils/helpers.js';
import { getAllPolicies } from './policy.service.js';
import { queueEmail } from './email.service.js';
import { notify } from './notification.service.js';
import { audit } from './audit.service.js';

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 4); // constant-time-ish compare when the user does not exist

export const hashPassword = (pw) => bcrypt.hash(pw, config.bcryptRounds);

async function issueToken(user, type, ttlMs) {
  const raw = randomToken(32);
  await Token.deleteMany({ userId: user._id, type, usedAt: { $exists: false } }); // only the newest link works
  await Token.create({ userId: user._id, type, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlMs) });
  return raw;
}

async function sendVerificationEmail(user) {
  const raw = await issueToken(user, 'email_verify', 24 * 3600 * 1000);
  await queueEmail({
    userId: user._id, to: user.email, sensitive: true,
    subject: '[CPMS] Verify your e-mail address',
    body: `Hello ${user.name},\n\nPlease verify your e-mail address to activate your CPMS account:\n${config.appUrl}/verify-account?token=${raw}\n\nThis link is valid for 24 hours.`,
  });
  return raw;
}

export async function createStudentAccount({ actor, name, studentId, dateOfBirth, req }) {
  const collegeId = studentId.trim();
  const studentName = name?.trim() || 'Student';
  const idPattern = new RegExp(`^${escapeRegex(collegeId)}$`, 'i');
  if (await StudentProfile.exists({ studentId: idPattern })) {
    throw conflict('This college ID is already registered', 'STUDENT_ID_EXISTS');
  }

  const internalEmail = `student.${crypto.createHash('sha256').update(collegeId.toLowerCase()).digest('hex')}@students.cpms.local`;
  if (await User.exists({ email: internalEmail })) {
    throw conflict('A student account for this college ID already exists', 'STUDENT_ID_EXISTS');
  }
  const password = dateOfBirth.toISOString().slice(0, 10);
  const user = await User.create({
    name: studentName,
    email: internalEmail,
    passwordHash: await hashPassword(password),
    role: ROLES.STUDENT,
    accountStatus: ACCOUNT_STATUS.ACTIVE,
    emailVerifiedAt: new Date(),
    notificationPrefs: { email: false },
    mustChangePassword: true,
    mustCompleteProfile: true,
    facultyProvisioned: true,
  });

  let profile;
  try {
    profile = await StudentProfile.create({
      userId: user._id,
      studentId: collegeId,
      rollNumber: `PENDING-${crypto.createHash('sha256').update(collegeId.toLowerCase()).digest('hex').slice(0, 32)}`,
      personal: { dateOfBirth },
    });
  } catch (err) {
    await User.deleteOne({ _id: user._id });
    throw err;
  }
  await audit({ actor, action: 'student.account_created', entityType: 'StudentProfile', entityId: profile._id, metadata: { studentId: collegeId }, req });
  return { user, profile };
}

export async function registerRecruiter(data) {
  const policies = await getAllPolicies();
  const email = normalizeEmail(data.email);
  if (await User.exists({ email })) throw conflict('An account with this email already exists', 'EMAIL_EXISTS');

  let company;
  let membershipStatus = 'active';
  let companyRole = 'owner';
  if (data.joinCompanyId) {
    company = await Company.findById(data.joinCompanyId);
    if (!company) throw notFound('Company not found');
    membershipStatus = 'pending'; // an owner / HR manager of that company must approve the new recruiter
    companyRole = 'recruiter';
  } else {
    const nameKey = data.company.name.trim().toLowerCase().replace(/\s+/g, ' ');
    if (await Company.exists({ nameKey })) throw conflict('A company with this name is already registered. Ask its owner to add you, or choose "join existing company".', 'COMPANY_EXISTS');
  }
  const needVerify = policies.requireEmailVerification;
  const user = await User.create({
    name: data.name, email, passwordHash: await hashPassword(data.password), role: ROLES.RECRUITER,
    accountStatus: needVerify ? ACCOUNT_STATUS.PENDING_VERIFICATION : ACCOUNT_STATUS.ACTIVE,
  });
  try {
    if (!company) {
      const c = data.company;
      company = await Company.create({
        name: c.name.trim(), nameKey: c.name.trim().toLowerCase().replace(/\s+/g, ' '), website: c.website, industry: c.industry,
        description: c.description, headquarters: c.headquarters, contactEmail: c.contactEmail || email, contactPhone: c.contactPhone,
        registrationNumber: c.registrationNumber, verificationStatus: COMPANY_STATUS.PENDING, createdBy: user._id, submittedForVerificationAt: new Date(),
      });
    }
    await CompanyUser.create({ companyId: company._id, userId: user._id, companyRole, status: membershipStatus });
  } catch (err) {
    await User.deleteOne({ _id: user._id });
    throw err;
  }
  const devToken = needVerify ? await sendVerificationEmail(user) : undefined;
  return { user, company, membershipStatus, requiresEmailVerification: needVerify, devToken: config.exposeDevTokens ? devToken : undefined };
}

export async function login({ identifier, email, password, ip, userAgent }) {
  const policies = await getAllPolicies();
  const maxAttempts = policies.maxLoginAttempts || config.maxLoginAttempts;
  const lockoutMinutes = policies.lockoutMinutes || config.lockoutMinutes;
  const ttlHours = policies.sessionTtlHours || config.sessionTtlHours;

  const loginId = String(identifier || email || '').trim();
  let user;
  if (loginId.includes('@')) {
    user = await User.findOne({ email: normalizeEmail(loginId) }).select('+passwordHash +failedLoginCount +lockedUntil');
  } else {
    const profile = await StudentProfile.findOne({ studentId: new RegExp(`^${escapeRegex(loginId)}$`, 'i') }).select('userId');
    if (profile) user = await User.findById(profile.userId).select('+passwordHash +failedLoginCount +lockedUntil');
  }
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${Math.ceil((user.lockedUntil - Date.now()) / 60000)} minute(s).`);
  }
  const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !ok) {
    if (user) {
      user.failedLoginCount = (user.failedLoginCount || 0) + 1;
      if (user.failedLoginCount >= maxAttempts) {
        user.lockedUntil = new Date(Date.now() + lockoutMinutes * 60000);
        user.failedLoginCount = 0;
      }
      await user.save();
    }
    throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS'); // same message for unknown e-mail and wrong password
  }
  if (user.accountStatus === ACCOUNT_STATUS.DEACTIVATED) throw forbidden('This account has been deactivated. Contact the placement cell.', 'ACCOUNT_DEACTIVATED');
  if (user.role === ROLES.STUDENT && !user.facultyProvisioned) {
    throw forbidden('This student account is no longer active. Ask faculty to create a new account.', 'STUDENT_ACCOUNT_DISABLED');
  }
  if (user.accountStatus === ACCOUNT_STATUS.PENDING_VERIFICATION) throw forbidden('Please verify your e-mail address first. Check your inbox.', 'EMAIL_NOT_VERIFIED');
  if (user.accountStatus === ACCOUNT_STATUS.PENDING_ACTIVATION) throw forbidden('Your account was created by the placement cell. Use "Forgot password" to set your password first.', 'ACTIVATION_REQUIRED');
  if (policies.maintenanceMode && user.role !== ROLES.SUPER_ADMIN) throw new AppError(503, 'MAINTENANCE', 'The portal is under maintenance. Please try again later.');

  user.failedLoginCount = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save();

  const { token, jti, expiresAt } = signAccessToken({ userId: user._id, role: user.role, ttlHours });
  await Session.create({ userId: user._id, jti, expiresAt, ip, userAgent: (userAgent || '').slice(0, 300) });
  return { token, expiresAt, user: await User.findById(user._id) };
}

export async function logout(session) {
  await Session.updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId, exceptJti) {
  await Session.updateMany({ userId, revokedAt: null, ...(exceptJti ? { jti: { $ne: exceptJti } } : {}) }, { $set: { revokedAt: new Date() } });
}

export async function verifyEmail(rawToken) {
  const tok = await Token.findOne({ tokenHash: sha256(rawToken), type: 'email_verify', usedAt: { $exists: false } });
  if (!tok || tok.expiresAt < new Date()) throw badRequest('This verification link is invalid or has expired', 'INVALID_TOKEN');
  const user = await User.findById(tok.userId);
  if (!user) throw badRequest('This verification link is invalid or has expired', 'INVALID_TOKEN');
  user.emailVerifiedAt = new Date();
  if (user.accountStatus === ACCOUNT_STATUS.PENDING_VERIFICATION) user.accountStatus = ACCOUNT_STATUS.ACTIVE;
  await user.save();
  tok.usedAt = new Date();
  await tok.save();
  return user;
}

export async function resendVerification(email) {
  // Always responds the same way: never reveals whether an e-mail is registered.
  const user = await User.findOne({ email: normalizeEmail(email), accountStatus: ACCOUNT_STATUS.PENDING_VERIFICATION });
  if (!user) return { devToken: undefined };
  const raw = await sendVerificationEmail(user);
  return { devToken: config.exposeDevTokens ? raw : undefined };
}

export async function forgotPassword(email) {
  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user || user.accountStatus === ACCOUNT_STATUS.DEACTIVATED) return { devToken: undefined }; // generic response (FR-006)
  const raw = await issueToken(user, 'password_reset', 3600 * 1000);
  await queueEmail({
    userId: user._id, to: user.email, sensitive: true,
    subject: '[CPMS] Reset your password',
    body: `Hello ${user.name},\n\nUse this link to set a new password (valid for 1 hour):\n${config.appUrl}/reset-password?token=${raw}\n\nIf you did not request this, you can ignore this e-mail.`,
  });
  return { devToken: config.exposeDevTokens ? raw : undefined };
}

export async function resetPassword({ token, password }) {
  const tok = await Token.findOne({ tokenHash: sha256(token), type: 'password_reset', usedAt: { $exists: false } });
  if (!tok || tok.expiresAt < new Date()) throw badRequest('This reset link is invalid or has expired', 'INVALID_TOKEN');
  const user = await User.findById(tok.userId);
  if (!user) throw badRequest('This reset link is invalid or has expired', 'INVALID_TOKEN');
  user.passwordHash = await hashPassword(password);
  user.passwordChangedAt = new Date();
  user.failedLoginCount = 0;
  user.lockedUntil = null;
  if ([ACCOUNT_STATUS.PENDING_ACTIVATION, ACCOUNT_STATUS.PENDING_VERIFICATION].includes(user.accountStatus)) {
    user.accountStatus = ACCOUNT_STATUS.ACTIVE; // proves mailbox ownership
    user.emailVerifiedAt = new Date();
  }
  await user.save();
  tok.usedAt = new Date();
  await tok.save();
  await revokeAllSessions(user._id);
  return user;
}

export async function changePassword({ user, currentPassword, newPassword, currentJti }) {
  const full = await User.findById(user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, full.passwordHash))) throw new AppError(400, 'WRONG_PASSWORD', 'Current password is incorrect');
  if (currentPassword === newPassword) throw badRequest('New password must be different', 'SAME_PASSWORD');
  full.passwordHash = await hashPassword(newPassword);
  full.passwordChangedAt = new Date();
  full.mustChangePassword = false;
  await full.save();
  await revokeAllSessions(user._id, currentJti);
}

export async function createStaffUser({ actor, name, email, password, role, req }) {
  email = normalizeEmail(email);
  if (await User.exists({ email })) throw conflict('An account with this email already exists', 'EMAIL_EXISTS');
  const user = await User.create({
    name, email, passwordHash: await hashPassword(password), role, accountStatus: ACCOUNT_STATUS.ACTIVE, emailVerifiedAt: new Date(),
  });
  await audit({ actor, action: 'user.created', entityType: 'User', entityId: user._id, metadata: { role, email }, req });
  notify(user._id, { type: 'system', title: 'Account created', message: `A ${role} account was created for you by the administrator.`, email: false });
  return user;
}

export { sha256 };
export const _crypto = crypto;
