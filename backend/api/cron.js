import { timingSafeEqual } from 'node:crypto';
import { ensureDbConnected } from '../src/config/db.js';
import { assertProductionConfig } from '../src/config/env.js';
import { processEmailQueue } from '../src/services/email.service.js';
import { runOfferMaintenance } from '../src/services/offer.service.js';
import { Session, Token } from '../src/models/index.js';
import { logger } from '../src/utils/logger.js';

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization || '';
  if (!secret || !authorization.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    assertProductionConfig();
    await ensureDbConnected();

    const emailsProcessed = await processEmailQueue();
    const offers = await runOfferMaintenance();
    const cutoff = new Date();
    const [sessions, tokens] = await Promise.all([
      Session.deleteMany({ expiresAt: { $lt: cutoff } }),
      Token.deleteMany({ expiresAt: { $lt: cutoff } }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        emailsProcessed,
        offers,
        sessionsDeleted: sessions.deletedCount,
        tokensDeleted: tokens.deletedCount,
      },
    });
  } catch (err) {
    logger.error('Vercel scheduled maintenance failed', { message: err.message });
    return res.status(500).json({ error: 'Scheduled maintenance failed' });
  }
}
