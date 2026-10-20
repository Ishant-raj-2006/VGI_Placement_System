import { Policy } from '../models/index.js';
import { POLICY_DEFAULTS, POLICY_CATEGORY, OFFER_POLICY_VALUES } from '../constants/index.js';
import { badRequest } from '../utils/AppError.js';

/**
 * Policies are versioned and effective-dated: changing a policy inserts a new row; reads pick the latest row whose
 * effectiveFrom <= now. History is therefore preserved (see GET /admin/policies/:key/history).
 */
let cache = { at: 0, values: null };
const CACHE_MS = 5000;

export function clearPolicyCache() {
  cache = { at: 0, values: null };
}

export async function getAllPolicies() {
  if (cache.values && Date.now() - cache.at < CACHE_MS) return cache.values;
  const nowDate = new Date();
  const rows = await Policy.find({ effectiveFrom: { $lte: nowDate } }).sort({ effectiveFrom: -1, createdAt: -1 }).lean();
  const values = { ...POLICY_DEFAULTS };
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    if (r.key in POLICY_DEFAULTS) values[r.key] = r.value;
  }
  cache = { at: Date.now(), values };
  return values;
}

export async function getPolicy(key) {
  const all = await getAllPolicies();
  return all[key];
}

const validators = {
  offerPolicy: (v) => OFFER_POLICY_VALUES.includes(v),
  suspendedCompanyDrivePolicy: (v) => ['pause', 'review'].includes(v),
  profileRequiredSections: (v) => Array.isArray(v) && v.every((s) => ['personal', 'academic', 'skills', 'projects', 'resume'].includes(s)),
  departments: (v) => Array.isArray(v) && v.every((s) => typeof s === 'string'),
  allowedStudentEmailDomains: (v) => Array.isArray(v) && v.every((s) => typeof s === 'string' && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)),
  maxActiveBacklogsGlobal: (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 50),
  sessionTtlHours: (v) => v === null || (Number.isFinite(v) && v >= 1 && v <= 24 * 30),
  maxLoginAttempts: (v) => v === null || (Number.isInteger(v) && v >= 3 && v <= 20),
  lockoutMinutes: (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 1440),
  withdrawalDeadlineHoursBeforeApplicationClose: (v) => Number.isFinite(v) && v >= 0 && v <= 24 * 30,
  offerExpiryReminderHours: (v) => Number.isFinite(v) && v >= 1 && v <= 24 * 14,
};

export function validatePolicyValue(key, value) {
  if (!(key in POLICY_DEFAULTS)) throw badRequest(`Unknown policy key: ${key}`, 'UNKNOWN_POLICY');
  const def = POLICY_DEFAULTS[key];
  if (validators[key]) {
    if (!validators[key](value)) throw badRequest(`Invalid value for ${key}`, 'INVALID_POLICY_VALUE');
  } else if (typeof def === 'boolean' && typeof value !== 'boolean') {
    throw badRequest(`${key} must be true or false`, 'INVALID_POLICY_VALUE');
  }
}

export async function setPolicy({ key, value, effectiveFrom, note, actor }) {
  validatePolicyValue(key, value);
  const row = await Policy.create({
    key,
    category: POLICY_CATEGORY[key],
    value,
    effectiveFrom: effectiveFrom || new Date(),
    note,
    createdBy: actor?._id,
  });
  clearPolicyCache();
  return row;
}

export async function policyHistory(key) {
  if (!(key in POLICY_DEFAULTS)) throw badRequest(`Unknown policy key: ${key}`, 'UNKNOWN_POLICY');
  return Policy.find({ key }).sort({ effectiveFrom: -1, createdAt: -1 }).limit(100).populate('createdBy', 'name email').lean();
}

export async function listPoliciesWithMeta(category) {
  const values = await getAllPolicies();
  return Object.keys(POLICY_DEFAULTS)
    .filter((k) => !category || POLICY_CATEGORY[k] === category)
    .map((k) => ({ key: k, category: POLICY_CATEGORY[k], value: values[k], default: POLICY_DEFAULTS[k] }));
}
