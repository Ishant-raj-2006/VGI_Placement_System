import { RecruitmentRound, RoundParticipant, Interview, Application, PlacementDrive } from '../models/index.js';
import { APP_STATUS, ASSESSMENT_ROUND_TYPES, INTERVIEW_ROUND_TYPES } from '../constants/index.js';
import { conflict, notFound, badRequest } from '../utils/AppError.js';
import { transitionApplication, recordEvent } from './application.service.js';
import { canTransition } from './statusMachine.js';
import { notify } from './notification.service.js';

const IN_PROCESS = [APP_STATUS.SHORTLISTED, APP_STATUS.ASSESSMENT, APP_STATUS.INTERVIEW];

/** Round lookup scoped to the recruiter's company: round -> drive -> company. */
export async function getCompanyRound(roundId, companyId) {
  const round = await RecruitmentRound.findById(roundId);
  if (!round) throw notFound('Round not found');
  const drive = await PlacementDrive.findOne({ _id: round.driveId, companyId });
  if (!drive) throw notFound('Round not found');
  return { round, drive };
}

/** Add shortlisted candidates to a round. Moves the application to the matching stage (assessment / interview). */
export async function addParticipants({ round, drive, applicationIds, actor }) {
  const apps = await Application.find({ _id: { $in: applicationIds }, driveId: drive._id });
  const found = new Set(apps.map((a) => String(a._id)));
  const results = [];
  for (const id of applicationIds) {
    if (!found.has(String(id))) results.push({ applicationId: id, ok: false, error: 'Application not found for this drive' });
  }
  for (const app of apps) {
    if (!IN_PROCESS.includes(app.status)) {
      results.push({ applicationId: app._id, ok: false, error: `Candidate must be shortlisted first (current status: ${app.status})` });
      continue;
    }
    try {
      await RoundParticipant.create({ roundId: round._id, driveId: drive._id, applicationId: app._id, updatedBy: actor._id });
    } catch (err) {
      if (err.code === 11000) {
        results.push({ applicationId: app._id, ok: false, error: 'Already added to this round' });
        continue;
      }
      throw err;
    }
    const target = ASSESSMENT_ROUND_TYPES.includes(round.type) ? APP_STATUS.ASSESSMENT : INTERVIEW_ROUND_TYPES.includes(round.type) ? APP_STATUS.INTERVIEW : null;
    if (target && app.status !== target && canTransition(app.status, target)) {
      await transitionApplication(app, target, { actor, actorRole: 'recruiter', reason: `Added to round "${round.name}"` });
    }
    notify(app.userId, {
      type: ASSESSMENT_ROUND_TYPES.includes(round.type) ? 'assessment_scheduled' : 'result_updated',
      title: `You have been added to: ${round.name}`,
      message: `You are part of the "${round.name}" round for "${drive.jobTitle}".${round.schedule?.startsAt ? ` Scheduled for ${round.schedule.startsAt.toString()}.` : ''}`,
      relatedEntity: { kind: 'application', id: app._id },
    });
    results.push({ applicationId: app._id, ok: true });
  }
  return results;
}

export async function updateParticipantResult({ participant, drive, actor, result, score, remarks, autoReject }) {
  if (result) participant.result = result;
  if (score !== undefined) participant.score = score;
  if (remarks !== undefined) participant.remarks = remarks;
  participant.updatedBy = actor._id;
  await participant.save();
  const application = await Application.findById(participant.applicationId);
  if (application) {
    if (result === 'failed' && autoReject && canTransition(application.status, APP_STATUS.REJECTED)) {
      await transitionApplication(application, APP_STATUS.REJECTED, { actor, actorRole: 'recruiter', reason: 'Did not clear a recruitment round' });
    }
    notify(application.userId, {
      type: 'result_updated',
      title: 'Round result updated',
      message: `Your result for a round of "${drive.jobTitle}" has been updated.`,
      relatedEntity: { kind: 'application', id: application._id },
    });
  }
  return participant;
}

export async function scheduleInterview({ round, drive, applicationId, data, actor }) {
  const application = await Application.findOne({ _id: applicationId, driveId: drive._id });
  if (!application) throw notFound('Application not found for this drive');
  if (![...IN_PROCESS].includes(application.status)) {
    throw conflict(`Interviews can only be scheduled for candidates who are shortlisted or in process (status: ${application.status})`, 'INVALID_APPLICATION_STATE');
  }
  // ensure participant record exists
  await RoundParticipant.updateOne(
    { roundId: round._id, applicationId: application._id },
    { $setOnInsert: { roundId: round._id, driveId: drive._id, applicationId: application._id, updatedBy: actor._id, result: 'pending' } },
    { upsert: true }
  );
  let interview;
  try {
    interview = await Interview.create({ ...data, roundId: round._id, driveId: drive._id, applicationId: application._id });
  } catch (err) {
    if (err.code === 11000) throw conflict('An interview is already scheduled for this candidate in this round. Reschedule it instead.', 'INTERVIEW_EXISTS');
    throw err;
  }
  if (application.status !== APP_STATUS.INTERVIEW && canTransition(application.status, APP_STATUS.INTERVIEW)) {
    await transitionApplication(application, APP_STATUS.INTERVIEW, { actor, actorRole: 'recruiter', reason: `Interview scheduled (${round.name})` });
  }
  notify(application.userId, {
    type: 'interview_scheduled',
    title: 'Interview scheduled',
    message: `${round.name} for "${drive.jobTitle}" on ${interview.startsAt.toString()} (${interview.mode}${interview.locationOrLink ? ': ' + interview.locationOrLink : ''}).`,
    relatedEntity: { kind: 'interview', id: interview._id },
  });
  return interview;
}

/** Reschedule keeps the previous schedule in `history` and notifies the student. */
export async function rescheduleInterview({ interview, drive, data, actor }) {
  if (['completed', 'cancelled'].includes(interview.status)) throw conflict(`A ${interview.status} interview cannot be rescheduled`, 'INTERVIEW_CLOSED');
  interview.history.push({
    startsAt: interview.startsAt,
    endsAt: interview.endsAt,
    mode: interview.mode,
    locationOrLink: interview.locationOrLink,
    changedBy: actor._id,
    reason: data.reason,
  });
  for (const k of ['startsAt', 'endsAt', 'timezone', 'mode', 'locationOrLink', 'instructions']) if (data[k] !== undefined) interview[k] = data[k];
  interview.status = 'rescheduled';
  await interview.save();
  const app = await Application.findById(interview.applicationId).select('userId');
  if (app) {
    notify(app.userId, {
      type: 'interview_rescheduled',
      title: 'Interview rescheduled',
      message: `Your interview for "${drive.jobTitle}" has moved to ${interview.startsAt.toString()} (${interview.mode}${interview.locationOrLink ? ': ' + interview.locationOrLink : ''}).${data.reason ? ' Reason: ' + data.reason : ''}`,
      relatedEntity: { kind: 'interview', id: interview._id },
    });
  }
  return interview;
}

export async function updateInterviewStatus({ interview, drive, status, actor }) {
  interview.status = status;
  await interview.save();
  if (status === 'cancelled') {
    const app = await Application.findById(interview.applicationId).select('userId');
    if (app) notify(app.userId, { type: 'interview_rescheduled', title: 'Interview cancelled', message: `Your interview for "${drive.jobTitle}" was cancelled.`, relatedEntity: { kind: 'interview', id: interview._id } });
  }
  return interview;
}

/**
 * Final selection result. Selected -> status "selected"; Not Selected -> "rejected";
 * On Hold / Further Evaluation keep the stage and record the outcome (+ history entry).
 */
export async function setSelectionOutcome({ application, outcome, reason, actor }) {
  if (!IN_PROCESS.includes(application.status) && application.status !== APP_STATUS.UNDER_REVIEW) {
    throw conflict(`Selection results cannot be recorded for an application in "${application.status}"`, 'INVALID_APPLICATION_STATE');
  }
  if (outcome === 'selected') {
    if (!IN_PROCESS.includes(application.status)) throw conflict('Shortlist the candidate before selecting them', 'INVALID_APPLICATION_STATE');
    const upd = await transitionApplication(application, APP_STATUS.SELECTED, { actor, actorRole: 'recruiter', reason: reason || 'Selected', extraSet: { selectionOutcome: 'selected' } });
    notify(upd.userId, { type: 'result_updated', title: 'Congratulations - you have been selected!', message: 'You have been selected in the recruitment process. The company will share the offer shortly.', relatedEntity: { kind: 'application', id: upd._id } });
    return upd;
  }
  if (outcome === 'not_selected') {
    const upd = await transitionApplication(application, APP_STATUS.REJECTED, { actor, actorRole: 'recruiter', reason: reason || 'Not selected', extraSet: { selectionOutcome: 'not_selected' } });
    notify(upd.userId, { type: 'result_updated', title: 'Application update', message: 'Thank you for participating. You were not selected for this opportunity.', relatedEntity: { kind: 'application', id: upd._id } });
    return upd;
  }
  if (!['on_hold', 'further_evaluation'].includes(outcome)) throw badRequest('Unknown outcome', 'INVALID_OUTCOME');
  const upd = await Application.findOneAndUpdate(
    { _id: application._id, status: application.status },
    { $set: { selectionOutcome: outcome, statusReason: reason } },
    { new: true }
  );
  if (!upd) throw conflict('The application changed in the meantime', 'STATUS_CONFLICT');
  await recordEvent({ application: upd, from: upd.status, to: upd.status, actor, actorRole: 'recruiter', reason: `Selection outcome: ${outcome}${reason ? ' - ' + reason : ''}` });
  notify(upd.userId, { type: 'result_updated', title: 'Application update', message: `Your application is currently ${outcome === 'on_hold' ? 'on hold' : 'under further evaluation'}.`, relatedEntity: { kind: 'application', id: upd._id } });
  return upd;
}

/** Shortlist / reject / review a list of applications (bulk requires explicit confirmation at the route level). */
export async function bulkTransition({ applicationIds, companyId, to, reason, actor }) {
  const apps = await Application.find({ _id: { $in: applicationIds }, companyId });
  const found = new Map(apps.map((a) => [String(a._id), a]));
  const results = [];
  for (const id of applicationIds) {
    const app = found.get(String(id));
    if (!app) {
      results.push({ applicationId: id, ok: false, error: 'Application not found' });
      continue;
    }
    try {
      const upd = await transitionApplication(app, to, { actor, actorRole: 'recruiter', reason });
      await notifyOnTransition(upd, to, reason);
      results.push({ applicationId: id, ok: true, status: upd.status });
    } catch (e) {
      results.push({ applicationId: id, ok: false, error: e.message });
    }
  }
  return results;
}

export async function notifyOnTransition(app, to, reason) {
  const drive = await PlacementDrive.findById(app.driveId).select('jobTitle').lean();
  const title = drive?.jobTitle || 'a drive';
  if (to === APP_STATUS.SHORTLISTED) {
    return notify(app.userId, { type: 'application_shortlisted', title: 'You have been shortlisted', message: `Congratulations! You have been shortlisted for "${title}".`, relatedEntity: { kind: 'application', id: app._id } });
  }
  if (to === APP_STATUS.REJECTED) {
    return notify(app.userId, { type: 'application_status', title: 'Application update', message: `Your application for "${title}" was not taken forward.${reason ? ' ' + reason : ''}`, relatedEntity: { kind: 'application', id: app._id } });
  }
  if (to === APP_STATUS.UNDER_REVIEW) {
    return notify(app.userId, { type: 'application_status', title: 'Application under review', message: `Your application for "${title}" is being reviewed.`, relatedEntity: { kind: 'application', id: app._id }, email: false });
  }
}
