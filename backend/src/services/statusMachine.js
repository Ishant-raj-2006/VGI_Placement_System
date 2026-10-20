import { APP_TRANSITIONS, STATUS_SETTERS } from '../constants/index.js';
import { AppError } from '../utils/AppError.js';

/** BR-07: application status changes only follow the allowed transition map, and only by an allowed actor. */
export function canTransition(from, to) {
  return Array.isArray(APP_TRANSITIONS[from]) && APP_TRANSITIONS[from].includes(to);
}

export function actorMaySet(actorRole, to) {
  return (STATUS_SETTERS[to] || []).includes(actorRole);
}

export function assertTransition(from, to, actorRole) {
  if (from === to) throw new AppError(409, 'STATUS_UNCHANGED', `Application is already ${from}`);
  if (!canTransition(from, to)) {
    throw new AppError(409, 'INVALID_TRANSITION', `Cannot move an application from "${from}" to "${to}"`, {
      from,
      to,
      allowed: APP_TRANSITIONS[from] || [],
    });
  }
  if (!actorMaySet(actorRole, to)) {
    throw new AppError(403, 'TRANSITION_FORBIDDEN', `Your role (${actorRole}) is not allowed to set the status "${to}"`);
  }
}

export const isTerminal = (status) => (APP_TRANSITIONS[status] || []).length === 0;
