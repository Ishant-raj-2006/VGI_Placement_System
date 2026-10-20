import {
  StudentProfile, Company, PlacementDrive, Application, ApplicationEvent, Offer, Interview, RoundParticipant, RecruitmentRound,
} from '../models/index.js';
import { APPROVAL, PUBLICATION, COMPANY_STATUS, OFFER_STATUS, APP_STATUS, PROFILE_VERIFICATION } from '../constants/index.js';
import { median, round2 } from '../utils/helpers.js';
import { evaluateEligibility } from './eligibility.service.js';
import { getAllPolicies } from './policy.service.js';

/**
 * METRIC DEFINITIONS (BR-11) - returned with every response so the UI can show them next to the numbers.
 * Unique students placed, offers issued and offers accepted are DIFFERENT metrics.
 */
export const METRIC_DEFINITIONS = {
  totalStudents: 'Registered student profiles.',
  verifiedStudentProfiles: 'Student profiles whose academic record has been verified by the placement cell.',
  registeredCompanies: 'All company accounts created by recruiters.',
  verifiedCompanies: 'Companies verified by the placement cell.',
  activeDrives: 'Approved and published drives whose application deadline has not passed.',
  totalApplications: 'All applications ever submitted (including withdrawn / rejected).',
  shortlisted: 'Distinct applications that reached "shortlisted" or any later stage.',
  studentsPlaced: 'Distinct students holding at least one ACCEPTED offer (a student with 3 accepted offers counts once).',
  offersIssued: 'Distinct applications for which an offer was issued (revised offers for the same application count once).',
  offersAccepted: 'Offers currently in the accepted state.',
  offersDeclined: 'Offers declined by students.',
  interviewsConducted: 'Interviews marked as completed.',
  funnelReached: 'A candidate "reaches" a funnel stage when their application history shows that stage (or the offer was accepted).',
};

const AFTER_SHORTLIST = ['shortlisted', 'assessment', 'interview', 'selected', 'offered', 'offer_accepted'];
const AFTER_SELECTED = ['selected', 'offered', 'offer_accepted'];
const idStr = (v) => String(v);

async function distinctReached(statuses, driveFilter = {}) {
  const ids = await ApplicationEvent.distinct('applicationId', { toStatus: { $in: statuses }, ...driveFilter });
  return new Set(ids.map(idStr));
}

export async function adminDashboard() {
  const nowDate = new Date();
  const [
    totalStudents, verifiedStudentProfiles, registeredCompanies, verifiedCompanies, activeDrives, totalApplications,
    shortlistedSet, placedIds, issuedApps, offersAccepted, offersDeclined, pendingDrives, pendingCompanies, pendingVerifications,
  ] = await Promise.all([
    StudentProfile.countDocuments({}),
    StudentProfile.countDocuments({ verificationStatus: PROFILE_VERIFICATION.VERIFIED }),
    Company.countDocuments({}),
    Company.countDocuments({ verificationStatus: COMPANY_STATUS.VERIFIED }),
    PlacementDrive.countDocuments({ approvalStatus: APPROVAL.APPROVED, publicationStatus: PUBLICATION.PUBLISHED, applicationDeadline: { $gte: nowDate } }),
    Application.countDocuments({}),
    distinctReached(AFTER_SHORTLIST),
    Offer.distinct('studentId', { status: OFFER_STATUS.ACCEPTED, isCurrent: true }),
    Offer.distinct('applicationId', { issuedAt: { $exists: true, $ne: null } }),
    Offer.countDocuments({ status: OFFER_STATUS.ACCEPTED, isCurrent: true }),
    Offer.countDocuments({ status: OFFER_STATUS.DECLINED }),
    PlacementDrive.countDocuments({ approvalStatus: { $in: [APPROVAL.SUBMITTED, APPROVAL.UNDER_REVIEW] } }),
    Company.countDocuments({ verificationStatus: { $in: [COMPANY_STATUS.PENDING, COMPANY_STATUS.UNDER_REVIEW] } }),
    StudentProfile.countDocuments({ verificationStatus: PROFILE_VERIFICATION.PENDING }),
  ]);
  return {
    totals: {
      totalStudents, verifiedStudentProfiles, registeredCompanies, verifiedCompanies, activeDrives, totalApplications,
      shortlisted: shortlistedSet.size, studentsPlaced: placedIds.length, offersIssued: issuedApps.length, offersAccepted, offersDeclined,
    },
    pending: { drivesAwaitingApproval: pendingDrives, companiesAwaitingVerification: pendingCompanies, studentsAwaitingVerification: pendingVerifications },
    definitions: METRIC_DEFINITIONS,
  };
}

export async function recruiterDashboard(companyId) {
  const nowDate = new Date();
  const driveIds = (await PlacementDrive.find({ companyId }).select('_id').lean()).map((d) => d._id);
  const [activeDrives, totalApplicants, eligibleApplicants, byStatus, upcomingInterviews, pendingResults, issuedApps] = await Promise.all([
    PlacementDrive.countDocuments({ companyId, approvalStatus: APPROVAL.APPROVED, publicationStatus: PUBLICATION.PUBLISHED, applicationDeadline: { $gte: nowDate } }),
    Application.countDocuments({ companyId }),
    Application.countDocuments({ companyId, 'eligibilitySnapshot.result': 'eligible' }),
    Application.aggregate([{ $match: { companyId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Interview.countDocuments({ driveId: { $in: driveIds }, startsAt: { $gte: nowDate }, status: { $in: ['scheduled', 'rescheduled'] } }),
    RoundParticipant.countDocuments({ driveId: { $in: driveIds }, result: 'pending' }),
    Offer.distinct('applicationId', { companyId, issuedAt: { $exists: true, $ne: null } }),
  ]);
  const s = Object.fromEntries(byStatus.map((r) => [r._id, r.n]));
  const reachedShortlist = await distinctReached(AFTER_SHORTLIST, { driveId: { $in: driveIds } });
  const reachedSelected = await distinctReached(AFTER_SELECTED, { driveId: { $in: driveIds } });
  return {
    activeDrives, totalApplicants, eligibleApplicants,
    shortlisted: reachedShortlist.size,
    upcomingInterviews, pendingResults,
    selected: reachedSelected.size,
    offersIssued: issuedApps.length,
    statusBreakdown: s,
  };
}

export async function departmentReport({ graduationYear, driveId } = {}) {
  const policies = await getAllPolicies();
  const profFilter = graduationYear ? { graduationYear: Number(graduationYear) } : {};
  const profiles = await StudentProfile.find(profFilter).select('department graduationYear degree verificationStatus academicSummary').lean();
  const profileIds = profiles.map((p) => p._id);
  const [apps, offers] = await Promise.all([
    Application.find({ studentId: { $in: profileIds }, ...(driveId ? { driveId } : {}) }).select('studentId').lean(),
    Offer.find({ studentId: { $in: profileIds }, ...(driveId ? { driveId } : {}) }).select('studentId applicationId status isCurrent issuedAt').lean(),
  ]);
  let drive = null;
  if (driveId) drive = await PlacementDrive.findById(driveId).lean();

  const dept = new Map();
  const deptOf = new Map(profiles.map((p) => [idStr(p._id), p.department]));
  const row = (d) => {
    if (!dept.has(d)) dept.set(d, { department: d, totalRegistered: 0, eligibleStudents: 0, studentsApplied: new Set(), studentsPlaced: new Set(), offersIssued: new Set(), offersAccepted: 0 });
    return dept.get(d);
  };
  for (const p of profiles) {
    const r = row(p.department);
    r.totalRegistered += 1;
    if (drive) {
      const ev = evaluateEligibility(p, drive, { requireVerification: policies.requireAcademicVerification, globalMaxActiveBacklogs: policies.maxActiveBacklogsGlobal });
      if (ev.result === 'eligible') r.eligibleStudents += 1;
    } else if (p.verificationStatus === PROFILE_VERIFICATION.VERIFIED) {
      r.eligibleStudents += 1; // scope without a drive: "verified profiles"
    }
  }
  for (const a of apps) row(deptOf.get(idStr(a.studentId))).studentsApplied.add(idStr(a.studentId));
  for (const o of offers) {
    const r = row(deptOf.get(idStr(o.studentId)));
    if (o.issuedAt) r.offersIssued.add(idStr(o.applicationId));
    if (o.status === OFFER_STATUS.ACCEPTED && o.isCurrent) {
      r.offersAccepted += 1;
      r.studentsPlaced.add(idStr(o.studentId));
    }
  }
  const rows = [...dept.values()]
    .map((r) => ({
      department: r.department,
      totalRegistered: r.totalRegistered,
      eligibleStudents: r.eligibleStudents,
      studentsApplied: r.studentsApplied.size,
      studentsPlaced: r.studentsPlaced.size,
      offersIssued: r.offersIssued.size,
      offersAccepted: r.offersAccepted,
      placementPercentage: r.totalRegistered ? round2((r.studentsPlaced.size / r.totalRegistered) * 100) : 0,
    }))
    .sort((a, b) => a.department.localeCompare(b.department));
  return {
    scope: drive ? `Eligible = meets the rules of "${drive.jobTitle}"` : 'Eligible = students with a verified academic record',
    denominator: 'placementPercentage = studentsPlaced / totalRegistered (registered students in the department for the selected batch)',
    rows,
  };
}

export async function companyReport() {
  const [companies, drives, apps, events, offers, interviews] = await Promise.all([
    Company.find({}).select('name verificationStatus').lean(),
    PlacementDrive.find({}).select('companyId').lean(),
    Application.find({}).select('companyId').lean(),
    ApplicationEvent.find({ toStatus: { $in: [...AFTER_SHORTLIST] } }).select('applicationId driveId toStatus').lean(),
    Offer.find({}).select('companyId applicationId status isCurrent issuedAt').lean(),
    Interview.find({ status: 'completed' }).select('driveId').lean(),
  ]);
  const driveCompany = new Map(drives.map((d) => [idStr(d._id), idStr(d.companyId)]));
  const rows = new Map(companies.map((c) => [idStr(c._id), {
    companyId: idStr(c._id), company: c.name, verificationStatus: c.verificationStatus, drives: 0, totalApplicants: 0,
    shortlisted: new Set(), selected: new Set(), interviewsConducted: 0, offersIssued: new Set(), offersAccepted: 0,
  }]));
  for (const d of drives) rows.get(idStr(d.companyId)) && (rows.get(idStr(d.companyId)).drives += 1);
  for (const a of apps) rows.get(idStr(a.companyId)) && (rows.get(idStr(a.companyId)).totalApplicants += 1);
  for (const e of events) {
    const r = rows.get(driveCompany.get(idStr(e.driveId)));
    if (!r) continue;
    r.shortlisted.add(idStr(e.applicationId));
    if (AFTER_SELECTED.includes(e.toStatus)) r.selected.add(idStr(e.applicationId));
  }
  for (const i of interviews) {
    const r = rows.get(driveCompany.get(idStr(i.driveId)));
    if (r) r.interviewsConducted += 1;
  }
  for (const o of offers) {
    const r = rows.get(idStr(o.companyId));
    if (!r) continue;
    if (o.issuedAt) r.offersIssued.add(idStr(o.applicationId));
    if (o.status === OFFER_STATUS.ACCEPTED && o.isCurrent) r.offersAccepted += 1;
  }
  return {
    rows: [...rows.values()].map((r) => ({
      ...r, shortlisted: r.shortlisted.size, selected: r.selected.size, offersIssued: r.offersIssued.size,
    })).sort((a, b) => a.company.localeCompare(b.company)),
  };
}

const BUCKETS = {
  annual_ctc: [[0, 300000, '< 3 LPA'], [300000, 500000, '3-5 LPA'], [500000, 800000, '5-8 LPA'], [800000, 1200000, '8-12 LPA'], [1200000, 2000000, '12-20 LPA'], [2000000, Infinity, '20+ LPA']],
  monthly_stipend: [[0, 10000, '< 10k'], [10000, 25000, '10k-25k'], [25000, 50000, '25k-50k'], [50000, 75000, '50k-75k'], [75000, Infinity, '75k+']],
};

function stats(values) {
  if (!values.length) return { count: 0, min: null, max: null, average: null, median: null };
  const sum = values.reduce((a, b) => a + b, 0);
  return { count: values.length, min: Math.min(...values), max: Math.max(...values), average: Math.round(sum / values.length), median: median(values) };
}

/**
 * Salary statistics. Compensation kinds are NEVER mixed: annual CTC and monthly stipend are reported in separate groups.
 * With normalize=annual an additional, clearly labelled group converts monthly stipends to annual (x12).
 */
export async function salaryReport({ scope = 'accepted', normalize } = {}) {
  const filter = { isCurrent: true };
  if (scope === 'accepted') filter.status = OFFER_STATUS.ACCEPTED;
  else filter.status = { $in: [OFFER_STATUS.ISSUED, OFFER_STATUS.ACCEPTED] };
  const offers = await Offer.find(filter).select('compensation').lean();
  const groups = new Map();
  for (const o of offers) {
    const key = `${o.compensation.kind}|${o.compensation.currency}`;
    if (!groups.has(key)) groups.set(key, { kind: o.compensation.kind, currency: o.compensation.currency, unit: o.compensation.unit, values: [] });
    groups.get(key).values.push(o.compensation.amount);
  }
  const out = [...groups.values()].map((g) => ({
    kind: g.kind, currency: g.currency, unit: g.unit, ...stats(g.values),
    distribution: (BUCKETS[g.kind] || []).map(([lo, hi, label]) => ({ label, count: g.values.filter((v) => v >= lo && v < hi).length })),
  }));
  let normalized = null;
  if (normalize === 'annual') {
    const vals = [];
    for (const g of groups.values()) for (const v of g.values) vals.push(g.kind === 'monthly_stipend' ? v * 12 : v);
    normalized = { label: 'Annualised (monthly stipend x 12) - indicative only', ...stats(vals) };
  }
  return { scope, groups: out, normalized, note: 'Annual CTC and monthly stipend are reported separately and never averaged together.' };
}

export async function funnel({ driveId, companyId } = {}) {
  const policies = await getAllPolicies();
  let driveFilter = {};
  let eligible = 0;
  let eligibleLabel = 'Verified students';
  if (driveId) {
    driveFilter = { driveId };
    const drive = await PlacementDrive.findById(driveId).lean();
    if (drive) {
      const profiles = await StudentProfile.find({}).select('department degree graduationYear verificationStatus academicSummary').lean();
      eligible = profiles.filter((p) => evaluateEligibility(p, drive, { requireVerification: policies.requireAcademicVerification, globalMaxActiveBacklogs: policies.maxActiveBacklogsGlobal }).result === 'eligible').length;
      eligibleLabel = 'Eligible students';
    }
  } else if (companyId) {
    const ids = (await PlacementDrive.find({ companyId }).select('_id').lean()).map((d) => d._id);
    driveFilter = { driveId: { $in: ids } };
    eligible = await StudentProfile.countDocuments({ verificationStatus: PROFILE_VERIFICATION.VERIFIED });
  } else {
    eligible = await StudentProfile.countDocuments({ verificationStatus: PROFILE_VERIFICATION.VERIFIED });
  }
  const stage = async (statuses) => (await distinctReached(statuses, driveFilter)).size;
  const [applied, shortlisted, assessment, interview, selected, offered, accepted] = await Promise.all([
    Application.countDocuments(driveFilter),
    stage(AFTER_SHORTLIST),
    stage(['assessment', 'interview', 'selected', 'offered', 'offer_accepted']),
    stage(['interview', 'selected', 'offered', 'offer_accepted']),
    stage(AFTER_SELECTED),
    stage(['offered', 'offer_accepted']),
    Offer.countDocuments({ ...driveFilter, status: OFFER_STATUS.ACCEPTED, isCurrent: true }),
  ]);
  const stages = [
    { key: 'eligible', label: eligibleLabel, count: eligible },
    { key: 'applied', label: 'Applications', count: applied },
    { key: 'shortlisted', label: 'Shortlisted', count: shortlisted },
    { key: 'assessment', label: 'Reached assessment or later', count: assessment },
    { key: 'interview', label: 'Reached interview or later', count: interview },
    { key: 'selected', label: 'Selected', count: selected },
    { key: 'offered', label: 'Offers issued', count: offered },
    { key: 'accepted', label: 'Offers accepted', count: accepted },
  ].map((s, i, arr) => ({ ...s, conversionFromPrevious: i === 0 || !arr[i - 1].count ? null : round2((s.count / arr[i - 1].count) * 100) }));
  return { stages, definition: METRIC_DEFINITIONS.funnelReached };
}

/** Per-drive progress for TPO "Recruitment Monitoring" */
export async function recruitmentMonitoring() {
  const drives = await PlacementDrive.find({ approvalStatus: APPROVAL.APPROVED, publicationStatus: { $in: [PUBLICATION.PUBLISHED, PUBLICATION.PAUSED, PUBLICATION.CLOSED] } })
    .sort({ applicationDeadline: -1 }).limit(200).populate('companyId', 'name').lean();
  const ids = drives.map((d) => d._id);
  const [appsByDrive, upcoming, pendingParticipants, rounds] = await Promise.all([
    Application.aggregate([{ $match: { driveId: { $in: ids } } }, { $group: { _id: { d: '$driveId', s: '$status' }, n: { $sum: 1 } } }]),
    Interview.aggregate([{ $match: { driveId: { $in: ids }, startsAt: { $gte: new Date() }, status: { $in: ['scheduled', 'rescheduled'] } } }, { $group: { _id: '$driveId', n: { $sum: 1 } } }]),
    RoundParticipant.aggregate([{ $match: { driveId: { $in: ids }, result: 'pending' } }, { $group: { _id: '$driveId', n: { $sum: 1 } } }]),
    RecruitmentRound.aggregate([{ $match: { driveId: { $in: ids } } }, { $group: { _id: '$driveId', n: { $sum: 1 } } }]),
  ]);
  const by = new Map();
  for (const r of appsByDrive) {
    const k = idStr(r._id.d);
    if (!by.has(k)) by.set(k, {});
    by.get(k)[r._id.s] = r.n;
  }
  const m = (arr) => new Map(arr.map((x) => [idStr(x._id), x.n]));
  const up = m(upcoming); const pp = m(pendingParticipants); const rc = m(rounds);
  return drives.map((d) => {
    const s = by.get(idStr(d._id)) || {};
    const total = Object.values(s).reduce((a, b) => a + b, 0);
    return {
      driveId: d._id, jobTitle: d.jobTitle, company: d.companyId?.name, publicationStatus: d.publicationStatus, applicationDeadline: d.applicationDeadline,
      totalApplications: total, byStatus: s,
      shortlisted: (s.shortlisted || 0) + (s.assessment || 0) + (s.interview || 0),
      selected: s.selected || 0, offered: s.offered || 0, accepted: s.offer_accepted || 0,
      pendingInterviews: up.get(idStr(d._id)) || 0, pendingResults: pp.get(idStr(d._id)) || 0, rounds: rc.get(idStr(d._id)) || 0,
    };
  });
}

export { APP_STATUS };
