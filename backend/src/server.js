import { config, assertProductionConfig } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { createApp } from './app.js';
import { startJobs, stopJobs } from './jobs/index.js';
import { logger } from './utils/logger.js';

async function main() {
  assertProductionConfig();
  await connectDb();
  logger.info('MongoDB connected');
  const app = createApp();
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

main().catch((err) => {
  logger.error('Failed to start server', { message: err.message });
  process.exit(1);
});
