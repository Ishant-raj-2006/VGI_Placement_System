import { AuditLog } from '../models/index.js';
import { redact } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';

/**
 * Append-only audit trail (BR-12). Failures to write an audit entry are logged but never break the user's request.
 * `actor` is the req.user document (or null for system jobs). Metadata is redacted for secrets.
 */
export async function audit({ actor, action, entityType, entityId, metadata, req }) {
  try {
    await AuditLog.create({
      actorId: actor?._id,
      actorRole: actor?.role || 'system',
      action,
      entityType,
      entityId,
      metadata: redact(metadata),
      ip: req?.ip,
    });
  } catch (err) {
    logger.error('audit write failed', { action, message: err.message });
  }
}
