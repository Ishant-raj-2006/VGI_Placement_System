import { Notification, User } from '../models/index.js';
import { queueEmail } from './email.service.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

/**
 * Creates in-app notifications and queues e-mails. NEVER throws: the calling business operation (e.g. a successful
 * application submit) must not fail because a notification could not be delivered.
 *
 * notify(userIds, { type, title, message, relatedEntity: {kind,id}, email: true })
 */
export async function notify(userIds, { type, title, message, relatedEntity, email = true }) {
  try {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
    if (!ids.length) return [];
    const docs = await Notification.insertMany(ids.map((userId) => ({ userId, type, title, message, relatedEntity })), { ordered: false });
    if (email) {
      const users = await User.find({ _id: { $in: ids }, 'notificationPrefs.email': { $ne: false } }).select('email name').lean();
      const byId = new Map(docs.map((d) => [String(d.userId), d]));
      for (const u of users) {
        await queueEmail({
          userId: u._id,
          to: u.email,
          subject: `[CPMS] ${title}`,
          body: `Hello ${u.name},\n\n${message}\n\nOpen the placement portal: ${config.appUrl}\n\n— Placement Cell`,
          notificationId: byId.get(String(u._id))?._id,
        });
      }
    }
    return docs;
  } catch (err) {
    logger.error('notify failed (ignored)', { type, message: err.message });
    return [];
  }
}
