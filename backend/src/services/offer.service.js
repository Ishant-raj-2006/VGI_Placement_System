import { Offer, Application, CompanyUser, PlacementDrive, Company } from '../models/index.js';
import { APP_STATUS, OFFER_STATUS, COMPENSATION_UNIT_BY_KIND } from '../constants/index.js';
import { AppError, badRequest, conflict, notFound, forbidden } from '../utils/AppError.js';
import { transitionApplication } from './application.service.js';
import { getAllPolicies } from './policy.service.js';
import { notify } from './notification.service.js';
import { logger } from '../utils/logger.js';

const ACTIVE_OFFER = [OFFER_STATUS.ISSUED, OFFER_STATUS.ACCEPTED];

export async function companyMemberUserIds(companyId) {
  const members = await CompanyUser.find({ companyId, status: 'active' }).select('userId').lean();
  return members.map((m) => m.userId);
}

/** Create a draft offer. BR-09: only for an application that is "selected" and belongs to the recruiter's company. */
export async function createOffer({ application, user, data }) {
  if (application.status !== APP_STATUS.SELECTED) {
    throw conflict('Offers can only be created for selected candidates', 'APPLICATION_NOT_SELECTED');
  }
  const latest = await Offer.findOne({ applicationId: application._id }).sort({ version: -1 });
  if (latest && [OFFER_STATUS.DRAFT, OFFER_STATUS.ISSUED, OFFER_STATUS.ACCEPTED].includes(latest.status) && latest.isCurrent) {
    throw conflict('An active offer already exists for this application. Edit it or create a revision.', 'OFFER_EXISTS');
  }
  const drive = await PlacementDrive.findById(application.driveId);
  const version = (latest?.version || 0) + 1;
  if (latest) await Offer.updateOne({ _id: latest._id }, { $set: { isCurrent: false } });
  try {
    return await Offer.create({
      applicationId: application._id,
      studentId: application.studentId,
      userId: application.userId,
      driveId: application.driveId,
      companyId: application.companyId,
      version,
      jobTitle: data.jobTitle || drive.jobTitle,
      compensation: normalizeCompensation(data.compensation),
      responseDeadline: data.responseDeadline,
      joiningDate: data.joiningDate,
      createdBy: user._id,
      status: OFFER_STATUS.DRAFT,
    });
  } catch (err) {
    if (latest) await Offer.updateOne({ _id: latest._id }, { $set: { isCurrent: true } }); // undo on failure
    throw err;
  }
}

export function normalizeCompensation(c) {
  if (!c) throw badRequest('Compensation is required', 'COMPENSATION_REQUIRED');
  return { ...c, unit: COMPENSATION_UNIT_BY_KIND[c.kind], currency: (c.currency || 'INR').toUpperCase() };
}

export async function updateDraftOffer({ offer, data }) {
  if (offer.status !== OFFER_STATUS.DRAFT) throw conflict('Only draft offers can be edited. Create a revision instead.', 'OFFER_NOT_DRAFT');
  if (data.compensation) offer.compensation = normalizeCompensation(data.compensation);
  for (const k of ['jobTitle', 'responseDeadline', 'joiningDate']) if (data[k] !== undefined) offer[k] = data[k];
  await offer.save();
  return offer;
}

/** Issue a draft offer: draft -> issued, application selected -> offered. Enforces the configurable offer policy. */
export async function issueOffer({ offer, user }) {
  const policies = await getAllPolicies();
  if (offer.status !== OFFER_STATUS.DRAFT) throw conflict('Only draft offers can be issued', 'OFFER_NOT_DRAFT');
  if (offer.responseDeadline <= new Date()) throw badRequest('The response deadline must be in the future', 'INVALID_DEADLINE');

  const application = await Application.findById(offer.applicationId);
  if (!application || application.status !== APP_STATUS.SELECTED) {
    throw conflict('The candidate is no longer in the "selected" state', 'APPLICATION_NOT_SELECTED');
  }
  if (policies.offerPolicy === 'single_offer') {
    const other = await Offer.exists({ studentId: offer.studentId, _id: { $ne: offer._id }, isCurrent: true, status: { $in: ACTIVE_OFFER } });
    if (other) throw new AppError(409, 'ONE_OFFER_POLICY', 'This student already holds an active offer and the college allows only one at a time');
  }
  const issued = await Offer.findOneAndUpdate(
    { _id: offer._id, status: OFFER_STATUS.DRAFT },
    { $set: { status: OFFER_STATUS.ISSUED, issuedAt: new Date() } },
    { new: true }
  );
  if (!issued) throw conflict('The offer was modified in the meantime', 'OFFER_CONFLICT');
  try {
    await transitionApplication(application, APP_STATUS.OFFERED, { actor: user, actorRole: 'system', reason: `Offer v${issued.version} issued` });
  } catch (err) {
    await Offer.updateOne({ _id: issued._id }, { $set: { status: OFFER_STATUS.DRAFT }, $unset: { issuedAt: '' } });
    throw err;
  }
  const company = await Company.findById(issued.companyId).select('name').lean();
  notify(issued.userId, {
    type: 'offer_issued',
    title: 'You have received an offer!',
    message: `${company?.name} has issued an offer for "${issued.jobTitle}". Please respond before ${issued.responseDeadline.toDateString()}.`,
    relatedEntity: { kind: 'offer', id: issued._id },
  });
  return issued;
}

/** Withdraw an issued/accepted offer (company side). Application returns to "selected". */
export async function withdrawOffer({ offer, user, reason }) {
  if (![OFFER_STATUS.ISSUED, OFFER_STATUS.ACCEPTED, OFFER_STATUS.DRAFT].includes(offer.status)) {
    throw conflict('This offer can no longer be withdrawn', 'OFFER_NOT_WITHDRAWABLE');
  }
  const prev = offer.status;
  const upd = await Offer.findOneAndUpdate({ _id: offer._id, status: prev }, { $set: { status: OFFER_STATUS.WITHDRAWN, statusReason: reason } }, { new: true });
  if (!upd) throw conflict('The offer was modified in the meantime', 'OFFER_CONFLICT');
  if (prev !== OFFER_STATUS.DRAFT) {
    const application = await Application.findById(offer.applicationId);
    if (application && [APP_STATUS.OFFERED, APP_STATUS.OFFER_ACCEPTED].includes(application.status)) {
      // accepted -> selected is only reachable via the explicit transition map
      await transitionApplication(application, APP_STATUS.SELECTED, { actor: user, actorRole: 'recruiter', reason: `Offer withdrawn: ${reason}` });
    }
    notify(upd.userId, {
      type: 'offer_withdrawn',
      title: 'Offer withdrawn',
      message: `The offer for "${upd.jobTitle}" was withdrawn by the company. Reason: ${reason}`,
      relatedEntity: { kind: 'offer', id: upd._id },
    });
  }
  return upd;
}

/** Revision = new version (previous offer history is kept). Previous issued offer is withdrawn automatically. */
export async function reviseOffer({ offer, user, data }) {
  if (offer.status === OFFER_STATUS.DRAFT) return updateDraftOffer({ offer, data });
  if (![OFFER_STATUS.ISSUED, OFFER_STATUS.ACCEPTED, OFFER_STATUS.WITHDRAWN, OFFER_STATUS.EXPIRED].includes(offer.status)) {
    throw conflict('This offer cannot be revised', 'OFFER_NOT_REVISABLE');
  }
  if ([OFFER_STATUS.ISSUED, OFFER_STATUS.ACCEPTED].includes(offer.status)) {
    await withdrawOffer({ offer, user, reason: `Superseded by revised offer v${offer.version + 1}` });
  }
  const application = await Application.findById(offer.applicationId);
  return createOffer({
    application,
    user,
    data: {
      jobTitle: data.jobTitle || offer.jobTitle,
      compensation: data.compensation || offer.compensation.toObject?.() || offer.compensation,
      responseDeadline: data.responseDeadline || offer.responseDeadline,
      joiningDate: data.joiningDate ?? offer.joiningDate,
    },
  });
}

/** Student accepts / declines. Atomic on the offer status so double-clicks and races cannot double-accept. */
export async function respondToOffer({ user, offerId, decision }) {
  const policies = await getAllPolicies();
  const offer = await Offer.findOne({ _id: offerId, userId: user._id });
  if (!offer) throw notFound('Offer not found');
  if (!offer.isCurrent) throw conflict('This offer has been replaced by a newer version', 'OFFER_SUPERSEDED');
  if (offer.status !== OFFER_STATUS.ISSUED) throw conflict(`This offer is ${offer.status} and cannot be responded to`, 'OFFER_NOT_OPEN'); // valid issued offer required

  if (offer.responseDeadline < new Date()) {
    await expireOffer(offer);
    throw conflict('The response deadline for this offer has passed', 'OFFER_EXPIRED');
  }

  const accept = decision === 'accept';
  if (accept && policies.offerPolicy !== 'multiple_accept') {
    const another = await Offer.exists({ studentId: offer.studentId, _id: { $ne: offer._id }, isCurrent: true, status: OFFER_STATUS.ACCEPTED });
    if (another) throw new AppError(409, 'ONE_OFFER_POLICY', 'You have already accepted another offer. The college policy allows only one accepted offer.');
  }

  const updated = await Offer.findOneAndUpdate(
    { _id: offer._id, status: OFFER_STATUS.ISSUED, isCurrent: true },
    { $set: { status: accept ? OFFER_STATUS.ACCEPTED : OFFER_STATUS.DECLINED, respondedAt: new Date() } },
    { new: true }
  );
  if (!updated) throw conflict('This offer was already answered or changed', 'OFFER_CONFLICT');

  const application = await Application.findById(offer.applicationId);
  try {
    await transitionApplication(application, accept ? APP_STATUS.OFFER_ACCEPTED : APP_STATUS.OFFER_DECLINED, {
      actor: user,
      actorRole: 'system',
      reason: accept ? 'Offer accepted by student' : 'Offer declined by student',
    });
  } catch (err) {
    await Offer.updateOne({ _id: updated._id }, { $set: { status: OFFER_STATUS.ISSUED }, $unset: { respondedAt: '' } });
    throw err;
  }
  companyMemberUserIds(updated.companyId).then((ids) =>
    notify(ids, {
      type: 'offer_response',
      title: `Offer ${accept ? 'accepted' : 'declined'}`,
      message: `A candidate has ${accept ? 'accepted' : 'declined'} the offer for "${updated.jobTitle}".`,
      relatedEntity: { kind: 'offer', id: updated._id },
    })
  );
  return updated;
}

async function expireOffer(offer) {
  const upd = await Offer.findOneAndUpdate({ _id: offer._id, status: OFFER_STATUS.ISSUED }, { $set: { status: OFFER_STATUS.EXPIRED } }, { new: true });
  if (!upd) return null;
  const application = await Application.findById(offer.applicationId);
  if (application?.status === APP_STATUS.OFFERED) {
    await transitionApplication(application, APP_STATUS.SELECTED, { actorRole: 'system', reason: 'Offer expired without response' });
  }
  notify(upd.userId, { type: 'offer_withdrawn', title: 'Offer expired', message: `The offer for "${upd.jobTitle}" expired because it was not answered in time.`, relatedEntity: { kind: 'offer', id: upd._id } });
  companyMemberUserIds(upd.companyId).then((ids) =>
    notify(ids, { type: 'offer_response', title: 'Offer expired', message: `An offer for "${upd.jobTitle}" expired without a response.`, relatedEntity: { kind: 'offer', id: upd._id } })
  );
  return upd;
}

/** Background job: expire overdue issued offers and send "deadline approaching" reminders. */
export async function runOfferMaintenance() {
  const policies = await getAllPolicies();
  const nowDate = new Date();
  const overdue = await Offer.find({ status: OFFER_STATUS.ISSUED, isCurrent: true, responseDeadline: { $lt: nowDate } }).limit(200);
  for (const o of overdue) {
    try {
      await expireOffer(o);
    } catch (e) {
      logger.error('offer expiry failed', { offerId: String(o._id), message: e.message });
    }
  }
  const horizon = new Date(nowDate.getTime() + policies.offerExpiryReminderHours * 3600 * 1000);
  const soon = await Offer.find({ status: OFFER_STATUS.ISSUED, isCurrent: true, responseDeadline: { $gte: nowDate, $lte: horizon }, reminderSentAt: { $exists: false } }).limit(200);
  for (const o of soon) {
    await Offer.updateOne({ _id: o._id, reminderSentAt: { $exists: false } }, { $set: { reminderSentAt: new Date() } });
    notify(o.userId, {
      type: 'offer_deadline',
      title: 'Offer deadline approaching',
      message: `Please respond to your offer for "${o.jobTitle}" before ${o.responseDeadline.toString()}.`,
      relatedEntity: { kind: 'offer', id: o._id },
    });
  }
  return { expired: overdue.length, reminded: soon.length };
}

export function assertOfferBelongsToCompany(offer, companyId) {
  if (String(offer.companyId) !== String(companyId)) throw notFound('Offer not found');
}

export { forbidden };
