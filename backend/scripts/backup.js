/**
 * Logical backup helper: wraps `mongodump` (MongoDB Database Tools) and also archives the private file storage.
 *   node scripts/backup.js [outputDir]
 * Restore:
 *   mongorestore --uri="$MONGODB_URI" --gzip --archive=<file>.archive.gz --drop
 *   tar -xzf <file>.files.tar.gz -C backend/storage
 * Schedule it (cron / task scheduler) and TEST a restore regularly - an untested backup is not a backup.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../src/config/env.js';

const out = path.resolve(process.argv[2] || './backups');
fs.mkdirSync(out, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dbArchive = path.join(out, `cpms-${stamp}.archive.gz`);
const filesArchive = path.join(out, `cpms-${stamp}.files.tar.gz`);

const dump = spawnSync('mongodump', [`--uri=${config.mongoUri}`, '--gzip', `--archive=${dbArchive}`], { stdio: 'inherit' });
if (dump.error || dump.status !== 0) {
  console.error('mongodump failed. Install the MongoDB Database Tools (https://www.mongodb.com/docs/database-tools/) and retry.');
  process.exit(1);
}
if (fs.existsSync(config.storage.dir)) {
  const tar = spawnSync('tar', ['-czf', filesArchive, '-C', config.storage.dir, '.'], { stdio: 'inherit' });
  if (tar.status !== 0) console.error('File storage archive failed');
}
console.log(`Backup written to ${out}`);
