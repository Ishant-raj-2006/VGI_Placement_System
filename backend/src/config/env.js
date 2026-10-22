import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.resolve(backendRoot, '..', 'atlas-credentials.env') });
dotenv.config({ path: path.resolve(backendRoot, '.env') });

const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const int = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : parseInt(v, 10));

function getMongoUri() {
  const uri = new URL(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campus_placement');
  if (!uri.pathname || uri.pathname === '/') uri.pathname = '/campus_placement';
  if (uri.protocol === 'mongodb+srv:') {
    if (!uri.username && process.env.MONGODB_USERNAME) uri.username = process.env.MONGODB_USERNAME;
    if (!uri.password && process.env.MONGODB_PASSWORD) uri.password = process.env.MONGODB_PASSWORD;
    if (!uri.searchParams.has('retryWrites')) uri.searchParams.set('retryWrites', 'true');
    if (!uri.searchParams.has('w')) uri.searchParams.set('w', 'majority');
  }
  return uri.toString();
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';
const isVercel = bool(process.env.VERCEL);

export const config = {
  nodeEnv,
  isProd,
  isVercel,
  isTest: nodeEnv === 'test',
  port: int(process.env.PORT, 5000),
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGINS || process.env.APP_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  mongoUri: getMongoUri(),
  mongoAutoIndex: bool(process.env.MONGO_AUTO_INDEX, true),
  mongoMaxPoolSize: int(process.env.MONGO_MAX_POOL_SIZE, process.env.VERCEL ? 5 : 20),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
  sessionTtlHours: int(process.env.SESSION_TTL_HOURS, 12),
  bcryptRounds: int(process.env.BCRYPT_ROUNDS, isProd ? 12 : 10),
  maxLoginAttempts: int(process.env.MAX_LOGIN_ATTEMPTS, 5),
  lockoutMinutes: int(process.env.LOCKOUT_MINUTES, 15),
  rateLimit: {
    enabled: bool(process.env.RATE_LIMIT_ENABLED, true),
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: int(process.env.RATE_LIMIT_MAX, 600),
    loginMax: int(process.env.LOGIN_RATE_LIMIT_MAX, 20),
  },
  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    dir: path.resolve(backendRoot, process.env.STORAGE_DIR || './storage'),
    maxResumeBytes: int(process.env.MAX_RESUME_MB, 2) * 1024 * 1024,
    maxOfferDocBytes: int(process.env.MAX_OFFER_DOC_MB, process.env.VERCEL ? 4 : 5) * 1024 * 1024,
    maxImportBytes: int(process.env.MAX_IMPORT_MB, process.env.VERCEL ? 4 : 5) * 1024 * 1024,
    maxPhotoBytes: 1024 * 1024,
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'CPMS <no-reply@college.edu>',
    maxAttempts: int(process.env.EMAIL_MAX_ATTEMPTS, 5),
  },
  exposeDevTokens: bool(process.env.EXPOSE_DEV_TOKENS, false) && !isProd,
  // Built React app to serve from this process. Set SERVE_FRONTEND=false to disable (e.g. when nginx serves it).
  frontendDist: bool(process.env.SERVE_FRONTEND, true) ? path.resolve(backendRoot, process.env.FRONTEND_DIST || '../frontend/dist') : null,
  jobsEnabled: bool(process.env.JOBS_ENABLED, !isVercel) && !isVercel,
  backendRoot,
};

export function assertProductionConfig() {
  if (!config.isProd) return;
  const problems = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /change-me|dev-only/i.test(process.env.JWT_SECRET)) {
    problems.push('JWT_SECRET must be set to a random string of at least 32 characters');
  }
  if (!process.env.MONGODB_URI) problems.push('MONGODB_URI must be set');
  if (!['local', 'vercel-blob'].includes(config.storage.driver)) problems.push('STORAGE_DRIVER must be local or vercel-blob');
  if (
    config.storage.driver === 'vercel-blob' &&
    !((process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) || process.env.BLOB_READ_WRITE_TOKEN)
  ) {
    problems.push('Vercel Blob requires a connected Blob store or BLOB_READ_WRITE_TOKEN');
  }
  if (process.env.EXPOSE_DEV_TOKENS && bool(process.env.EXPOSE_DEV_TOKENS)) problems.push('EXPOSE_DEV_TOKENS must not be enabled in production');
  if (problems.length) {
    throw new Error(`Invalid production configuration:\n - ${problems.join('\n - ')}`);
  }
}
