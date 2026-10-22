import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, assertProductionConfig } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import app from './app.js';
import { startJobs, stopJobs } from './jobs/index.js';
import { logger } from './utils/logger.js';

export default app;

async function main() {
  assertProductionConfig();
  await connectDb();
  logger.info('MongoDB connected');
  const server = app.listen(config.port, () => logger.info(`CPMS API listening on :${config.port} (${config.nodeEnv})`));
  startJobs();

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    stopJobs();
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (r) => logger.error('unhandledRejection', { reason: String(r) }));
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentFile = fileURLToPath(import.meta.url);

if (!config.isVercel && invokedFile === currentFile) main().catch((err) => {
  logger.error('Failed to start server', { message: err.message });
  process.exit(1);
});
