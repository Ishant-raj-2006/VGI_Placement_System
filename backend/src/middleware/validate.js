import { z } from 'zod';
import { isObjectId } from '../utils/helpers.js';
import { badRequest } from '../utils/AppError.js';

/**
 * validate({ body, query, params }) - parses with zod and REPLACES the request parts with the parsed (typed, stripped) data.
 * Unknown keys are stripped by default (zod object default), so mass-assignment of unexpected fields is impossible.
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const parsed = schemas[part].parse(req[part] ?? {});
      if (part === 'query') {
        for (const k of Object.keys(req.query)) delete req.query[k];
        Object.assign(req.query, parsed);
      } else {
        req[part] = parsed;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
};

/** Guards :id style params so malformed ids return 400 rather than a Mongoose CastError. */
export const objectIdParams = (...names) => (req, _res, next) => {
  for (const n of names) {
    if (!isObjectId(req.params[n])) return next(badRequest(`Invalid ${n}`, 'INVALID_ID'));
  }
  next();
};

// ---------- reusable zod building blocks ----------
export const zObjectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const zEmail = z.string().trim().toLowerCase().email().max(254);
export const zPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), 'Password needs upper-case, lower-case and a digit');
export const zText = (max = 200) => z.string().trim().max(max);
export const zReqText = (max = 200) => z.string().trim().min(1, 'Required').max(max);
export const zDate = z.coerce.date();
export const zNum = z.coerce.number().finite();
export const zOptNum = (min, max) => {
  let n = z.coerce.number().finite();
  if (min !== undefined) n = n.min(min);
  if (max !== undefined) n = n.max(max);
  return n.optional();
};
export const zNullableNum = (min, max) => {
  let n = z.coerce.number().finite();
  if (min !== undefined) n = n.min(min);
  if (max !== undefined) n = n.max(max);
  return z.preprocess((v) => (v === '' || v === null ? null : v), n.nullable()).optional();
};
export const zStrList = (maxItems = 50, maxLen = 60) => z.array(z.string().trim().min(1).max(maxLen)).max(maxItems);
export const zBool = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean());
export const zUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => /^https?:\/\//i.test(u), 'Must start with http:// or https://');

export const paginationQuery = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sort: z.string().max(60).optional(),
  q: z.string().trim().max(100).optional(),
};
