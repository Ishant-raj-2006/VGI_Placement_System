import { verifyAccessToken } from '../utils/tokens.js';
import { Session, User, CompanyUser, Company } from '../models/index.js';
import { unauthorized, forbidden, notFound } from '../utils/AppError.js';
import { ACCOUNT_STATUS, COMPANY_STATUS, COMPANY_MANAGER_ROLES } from '../constants/index.js';
import { asyncHandler } from '../utils/helpers.js';

/**
 * Authentication: validates the bearer token AND that its server-side session is still alive.
 * Logout, password change and account deactivation revoke sessions, so a leaked token dies with them.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw unauthorized('Session expired or invalid. Please log in again.', 'INVALID_TOKEN');
  }

  const session = await Session.findOne({ jti: payload.jti, userId: payload.sub, revokedAt: null });
  if (!session || session.expiresAt < new Date()) throw unauthorized('Session expired. Please log in again.', 'SESSION_EXPIRED');

  const user = await User.findById(payload.sub);
  if (!user) throw unauthorized();
  if (user.accountStatus === ACCOUNT_STATUS.DEACTIVATED) throw forbidden('This account has been deactivated', 'ACCOUNT_DEACTIVATED');

  req.user = user;
  req.session = session;
  next();
});

/** Authorization by role. The role always comes from the DB user, never from the token payload or client. */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden('Your role is not allowed to access this resource', 'ROLE_FORBIDDEN'));
    next();
  };

/**
 * Loads the recruiter's company membership. All recruiter data access is scoped by req.company._id (BR-08).
 *  - requireVerified: company must be verified (BR-02) - needed to create/submit drives, issue offers.
 *  - requireManager: owner / hr_manager only.
 */
export const loadCompany = ({ requireVerified = false, requireManager = false } = {}) =>
  asyncHandler(async (req, _res, next) => {
    const membership = await CompanyUser.findOne({ userId: req.user._id });
    if (!membership || membership.status === 'removed') throw forbidden('You are not linked to a company', 'NO_COMPANY');
    if (membership.status === 'pending') throw forbidden('Your access to the company is awaiting approval', 'MEMBERSHIP_PENDING');
    const company = await Company.findById(membership.companyId);
    if (!company) throw notFound('Company not found');
    if (company.verificationStatus === COMPANY_STATUS.SUSPENDED) {
      throw forbidden('Your company is suspended. Please contact the placement cell.', 'COMPANY_SUSPENDED');
    }
    if (requireVerified && company.verificationStatus !== COMPANY_STATUS.VERIFIED) {
      throw forbidden('Your company must be verified by the placement cell for this action', 'COMPANY_NOT_VERIFIED');
    }
    if (requireManager && !COMPANY_MANAGER_ROLES.includes(membership.companyRole)) {
      throw forbidden('Only the company owner or HR manager can do this', 'COMPANY_ROLE_FORBIDDEN');
    }
    req.company = company;
    req.membership = membership;
    next();
  });
