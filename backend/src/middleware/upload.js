import multer from 'multer';
import { config } from '../config/env.js';
import { badRequest } from '../utils/AppError.js';

const storage = multer.memoryStorage(); // validated in memory, then written to private storage by the storage service

const make = (maxBytes, allowedMimes) =>
  multer({
    storage,
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!allowedMimes.includes(file.mimetype)) return cb(badRequest(`Unsupported file type: ${file.mimetype}`, 'UNSUPPORTED_FILE_TYPE'));
      cb(null, true);
    },
  }).single('file');

export const uploadResume = make(config.storage.maxResumeBytes, [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
export const uploadOfferDoc = make(config.storage.maxOfferDocBytes, ['application/pdf']);
export const uploadPhoto = make(config.storage.maxPhotoBytes, ['image/jpeg', 'image/png']);
export const uploadCsv = make(config.storage.maxImportBytes, ['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/csv']);

// Magic-byte verification: never trust the client-supplied MIME type or extension alone.
export function sniffType(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

export function assertFileMatches(file, expected) {
  if (!file) throw badRequest('No file uploaded. Send the file in the "file" form field.', 'FILE_REQUIRED');
  const real = sniffType(file.buffer);
  if (!real || !expected.includes(real)) {
    throw badRequest('File content does not match an allowed type', 'FILE_CONTENT_MISMATCH');
  }
  return real;
}

export function safeFilename(name) {
  return String(name || 'file').replace(/[^\w.\- ()]/g, '_').slice(0, 120);
}
