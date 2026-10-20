// Shared integration-test bootstrap. Uses a throw-away database (never your real one):
//   MONGODB_URI_TEST=mongodb://127.0.0.1:27017/cpms_test npm run test:integration
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const uri = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/cpms_test';
if (!/test/i.test(uri)) throw new Error('Refusing to run integration tests against a DB whose name does not contain "test"');

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = uri;
process.env.JWT_SECRET = 'integration-test-secret-integration-test-secret';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.JOBS_ENABLED = 'false';
process.env.EXPOSE_DEV_TOKENS = 'true';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'cpms-test-storage-'));
process.env.SMTP_HOST = '';

export function seedDatabase() {
  const r = spawnSync(process.execPath, ['scripts/seed.js', '--reset'], { cwd: backendRoot, env: process.env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`Seed failed:\n${r.stdout}\n${r.stderr}`);
}

export async function boot() {
  seedDatabase();
  const { createApp } = await import('../../src/app.js');
  const { connectDb, disconnectDb } = await import('../../src/config/db.js');
  const { default: request } = await import('supertest');
  await connectDb();
  const app = createApp();
  const api = request(app);
  const tokens = {};
  const login = async (email, password) => {
    if (tokens[email]) return tokens[email];
    const res = await api.post('/api/v1/auth/login').send({ email, password });
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    return (tokens[email] = res.body.data.token);
  };
  const as = (token) => ({
    get: (u) => api.get(`/api/v1${u}`).set('Authorization', `Bearer ${token}`),
    post: (u, b) => api.post(`/api/v1${u}`).set('Authorization', `Bearer ${token}`).send(b ?? {}),
    put: (u, b) => api.put(`/api/v1${u}`).set('Authorization', `Bearer ${token}`).send(b ?? {}),
    del: (u) => api.delete(`/api/v1${u}`).set('Authorization', `Bearer ${token}`),
    raw: api,
  });
  const actor = async (email, password) => as(await login(email, password));
  return { api, app, login, as, actor, close: disconnectDb };
}

export const PW = { admin: 'Admin@12345', tpo: 'Tpo@12345', student: 'Student@123', recruiter: 'Recruiter@123' };
