import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
}

const DUP_LABELS = {
  email: ['EMAIL_EXISTS', 'An account with this email already exists'],
  studentId: ['STUDENT_ID_EXISTS', 'This student ID is already registered'],
  rollNumber: ['ROLL_NUMBER_EXISTS', 'This roll number is already registered'],
  nameKey: ['COMPANY_EXISTS', 'A company with this name already exists'],
  studentId_driveId: ['DUPLICATE_APPLICATION', 'You have already applied to this drive'],
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    code = 'INVALID_VALUE';
    message = `Invalid value for ${err.path}`;
  } else if (err?.code === 11000) {
    status = 409;
    const fields = Object.keys(err.keyPattern || err.keyValue || {});
    const key = fields.join('_');
    const known = DUP_LABELS[key] || DUP_LABELS[fields[0]];
    code = known ? known[0] : 'DUPLICATE_KEY';
    message = known ? known[1] : 'A record with the same unique value already exists';
  } else if (err?.name === 'MulterError') {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR';
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message;
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  } else if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Malformed JSON body';
  }

  if (status >= 500) {
    logger.error('Unhandled error', { path: req.path, method: req.method, message: err?.message, stack: config.isProd ? undefined : err?.stack });
  }

  res.status(status).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
    ...(config.isProd || status < 500 ? {} : { debug: err?.message }),
  });
}
