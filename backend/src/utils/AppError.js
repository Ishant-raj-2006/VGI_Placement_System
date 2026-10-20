export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export const badRequest = (message = 'Bad request', code = 'BAD_REQUEST', details) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentication required', code = 'UNAUTHENTICATED') => new AppError(401, code, message);
export const forbidden = (message = 'You do not have permission to perform this action', code = 'FORBIDDEN', details) =>
  new AppError(403, code, message, details);
export const notFound = (message = 'Resource not found', code = 'NOT_FOUND') => new AppError(404, code, message);
export const conflict = (message = 'Conflict', code = 'CONFLICT', details) => new AppError(409, code, message, details);
export const unprocessable = (message = 'Request cannot be processed', code = 'UNPROCESSABLE', details) =>
  new AppError(422, code, message, details);
