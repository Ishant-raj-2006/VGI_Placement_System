import { processEmailQueue } from '../services/email.service.js';
import { runOfferMaintenance } from '../services/offer.service.js';
import { Session, Token } from '../models/index.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Lightweight in-process scheduler (no external dependency). For multi-instance deployments run the jobs on ONE
 * instance (JOBS_ENABLED=true there, false elsewhere) or move them to a dedicated worker / cron - every job is idempotent.
 */
const timers = [];

function every(ms, name, fn) {
  let running = false;
  const t = setInterval(async () => {
    if (running) return; // never overlap
    running = true;
    try {
      await fn();
    } catch (err) {
      logger.error(`job ${name} failed`, { message: err.message });
    } finally {
      running = false;
    }
  }, ms);
  t.unref();
  timers.push(t);
}

export function startJobs() {
  if (!config.jobsEnabled) return;
  every(30 * 1000, 'email-queue', () => processEmailQueue());
  every(5 * 60 * 1000, 'offer-maintenance', () => runOfferMaintenance());
  every(6 * 3600 * 1000, 'cleanup', async () => {
    const cutoff = new Date();
    await Session.deleteMany({ expiresAt: { $lt: cutoff } });
    await Token.deleteMany({ expiresAt: { $lt: cutoff } });
  });
  logger.info('Background jobs started');
}

export function stopJobs() {
  while (timers.length) clearInterval(timers.pop());
}
