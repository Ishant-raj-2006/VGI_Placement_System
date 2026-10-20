import crypto from 'node:crypto';
import mongoose from 'mongoose';

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
export const toObjectId = (v) => new mongoose.Types.ObjectId(String(v));
export const idEq = (a, b) => a != null && b != null && String(a) === String(b);

export const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
export const normalizeDept = (d) => String(d || '').trim().toUpperCase();
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function omit(obj, keys) {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

export function parsePagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function pageMeta({ page, limit }, total) {
  return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}

export function parseSort(sortParam, allowed, fallback = { createdAt: -1 }) {
  if (!sortParam || typeof sortParam !== 'string') return fallback;
  const sort = {};
  for (const part of sortParam.split(',')) {
    const desc = part.startsWith('-');
    const key = desc ? part.slice(1) : part;
    if (allowed.includes(key)) sort[key] = desc ? -1 : 1;
  }
  return Object.keys(sort).length ? sort : fallback;
}

/** Round to 2 decimals to avoid float artefacts in CGPA comparisons (e.g. 7.0 vs 6.999999). */
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const now = () => new Date();
export const hoursFromNow = (h) => new Date(Date.now() + h * 3600 * 1000);

/** Remove secrets before anything lands in audit metadata or logs. */
const SENSITIVE_KEYS = /pass(word)?|token|secret|hash|authorization|cookie|otp/i;
export function redact(value, depth = 0) {
  if (value == null || depth > 5) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Date || value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

export function csvEscape(v) {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const header = columns.map((c) => csvEscape(c.header)).join(',');
  const lines = rows.map((r) => columns.map((c) => csvEscape(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}
