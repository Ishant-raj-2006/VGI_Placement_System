import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { EmailLog } from '../models/index.js';
import { logger } from '../utils/logger.js';

/**
 * Durable e-mail queue. Business operations only INSERT an EmailLog row (cheap, can't fail the request in practice;
 * and callers wrap it in try/catch). A background worker (jobs/index.js) sends queued rows, retrying with
 * exponential back-off. If SMTP is down, applications / offers etc. are unaffected.
 */
let transporter;
function getTransporter() {
  if (transporter) return transporter;
  if (config.smtp.host) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  } else {
    // No SMTP configured: render the message and log it (development / demo mode)
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

export async function queueEmail({ userId, to, subject, body, notificationId, sensitive = false }) {
  try {
    return await EmailLog.create({ userId, recipient: to, subject, body, notificationId, sensitive });
  } catch (err) {
    logger.error('failed to queue email', { message: err.message });
    return null;
  }
}

export async function sendEmailLog(log) {
  const full = await EmailLog.findById(log._id).select('+body');
  if (!full) return;
  full.attempts += 1;
  full.lastAttemptAt = new Date();
  try {
    await getTransporter().sendMail({
      from: config.smtp.from,
      to: full.recipient,
      subject: full.subject,
      text: full.body,
    });
    full.providerStatus = 'sent';
    full.lastError = undefined;
    if (full.sensitive) full.body = '[sensitive content removed after sending]';
    if (!config.smtp.host && !config.isTest) logger.debug('E-mail (no SMTP configured, not delivered)', { to: full.recipient, subject: full.subject });
  } catch (err) {
    full.lastError = String(err.message || err).slice(0, 400);
    if (full.attempts >= config.smtp.maxAttempts) {
      full.providerStatus = 'failed';
    } else {
      full.providerStatus = 'retrying';
      const backoffMin = Math.min(60, 2 ** full.attempts); // 2,4,8,16,32,60 minutes
      full.nextAttemptAt = new Date(Date.now() + backoffMin * 60 * 1000);
    }
    logger.warn('email send failed', { id: String(full._id), attempts: full.attempts });
  }
  await full.save();
}

export async function processEmailQueue(batch = 25) {
  const due = await EmailLog.find({ providerStatus: { $in: ['queued', 'retrying'] }, nextAttemptAt: { $lte: new Date() } })
    .sort({ nextAttemptAt: 1 })
    .limit(batch);
  for (const log of due) await sendEmailLog(log);
  return due.length;
}
