import { ELIGIBILITY, PROFILE_VERIFICATION } from '../constants/index.js';
import { round2 } from '../utils/helpers.js';

/**
 * ELIGIBILITY ENGINE (pure function - no DB access, fully unit-tested).
 *
 * Inputs
 *   student : plain StudentProfile { department, degree, graduationYear, verificationStatus, academicSummary:{entered,verified} }
 *   drive   : { eligibilityRules, allowedDepartments, graduationYears, rulesVersion }
 *   options : { requireVerification (default true), globalMaxActiveBacklogs (college-wide cap, default null) }
 *
 * Outcomes
 *   eligible              every configured criterion passes
 *   ineligible            at least one mandatory criterion definitively fails (reasons listed)
 *   pending_verification  nothing fails, but at least one academic criterion cannot be checked because the data is
 *                         missing or has not been verified by the institution. Missing data is NEVER treated as a pass (BR-06).
 *
 * Department / degree / graduation-year are identity data validated at registration or import, so they are evaluated
 * immediately and a failure there is a definite "ineligible" (a high CGPA never overrides a department restriction).
 * Academic numbers (CGPA, backlogs, 10th/12th %) require institution-verified data.
 */

const norm = (s) => String(s ?? '').trim().toUpperCase();
const normDegree = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const has = (v) => v !== undefined && v !== null && v !== '' && !Number.isNaN(v);

export function resolveRules(drive) {
  const r = drive?.eligibilityRules || {};
  return {
    degrees: r.degrees || [],
    minimumCgpa: r.minimumCgpa,
    minimumTenthPercentage: r.minimumTenthPercentage,
    minimumTwelfthPercentage: r.minimumTwelfthPercentage,
    maximumActiveBacklogs: r.maximumActiveBacklogs,
    maximumTotalBacklogs: r.maximumTotalBacklogs,
    additionalRequirements: r.additionalRequirements,
    // top-level drive fields are the source of truth for these two (they are also indexed for browsing)
    allowedDepartments: (drive?.allowedDepartments?.length ? drive.allowedDepartments : r.allowedDepartments || []).map(norm),
    graduationYears: drive?.graduationYears?.length ? drive.graduationYears : r.graduationYears || [],
  };
}

export function evaluateEligibility(student, drive, options = {}) {
  const { requireVerification = true, globalMaxActiveBacklogs = null } = options;
  const rules = resolveRules(drive);
  const checks = [];
  const add = (key, label, status, expected, actual, message) => checks.push({ key, label, status, expected, actual, message });

  // ---- identity-level criteria: evaluated immediately ----
  if (rules.allowedDepartments.length) {
    const dept = norm(student?.department);
    const ok = rules.allowedDepartments.includes(dept);
    add('department', 'Department', ok ? 'pass' : 'fail', rules.allowedDepartments, dept || null,
      ok ? 'Department allowed' : `Department not allowed (${dept || 'unknown'}). Allowed: ${rules.allowedDepartments.join(', ')}`);
  }
  if (rules.degrees.length) {
    const ok = rules.degrees.map(normDegree).includes(normDegree(student?.degree));
    add('degree', 'Degree', ok ? 'pass' : 'fail', rules.degrees, student?.degree || null,
      ok ? 'Degree allowed' : `Degree not allowed (${student?.degree || 'unknown'}). Allowed: ${rules.degrees.join(', ')}`);
  }
  if (rules.graduationYears.length) {
    const ok = rules.graduationYears.map(Number).includes(Number(student?.graduationYear));
    add('graduationYear', 'Graduation year', ok ? 'pass' : 'fail', rules.graduationYears, student?.graduationYear ?? null,
      ok ? 'Graduation year allowed' : `Graduation year ${student?.graduationYear ?? 'unknown'} not allowed. Allowed: ${rules.graduationYears.join(', ')}`);
  }

  // ---- academic criteria: need verified data ----
  const verifiedOk = student?.verificationStatus === PROFILE_VERIFICATION.VERIFIED && !!student?.academicSummary?.verified;
  const entered = student?.academicSummary?.entered || {};
  const verified = student?.academicSummary?.verified || {};
  // If the college does not require verification (policy), fall back to student-entered numbers.
  const usable = verifiedOk ? verified : requireVerification ? null : entered;

  const academic = (key, label, ruleValue, getter, cmp, passMsg, failMsg) => {
    if (!has(ruleValue)) return;
    if (!usable) {
      add(key, label, 'pending', ruleValue, null, `${label}: academic record not verified yet`);
      return;
    }
    const actual = getter(usable);
    if (!has(actual)) {
      add(key, label, 'pending', ruleValue, null, `${label}: value is missing from your verified record`);
      return;
    }
    const ok = cmp(round2(actual), round2(ruleValue));
    add(key, label, ok ? 'pass' : 'fail', ruleValue, actual, ok ? passMsg : failMsg(actual, ruleValue));
  };

  academic('minimumCgpa', 'CGPA', rules.minimumCgpa, (u) => u.cgpa, (a, r) => a >= r,
    'CGPA meets the minimum', (a, r) => `CGPA ${a} is below the minimum ${r}`);
  academic('minimumTenthPercentage', '10th percentage', rules.minimumTenthPercentage, (u) => u.tenthPercentage, (a, r) => a >= r,
    '10th percentage meets the minimum', (a, r) => `10th percentage ${a}% is below the minimum ${r}%`);
  academic('minimumTwelfthPercentage', '12th / diploma percentage', rules.minimumTwelfthPercentage,
    (u) => (has(u.twelfthPercentage) ? u.twelfthPercentage : u.diplomaPercentage), (a, r) => a >= r,
    '12th/diploma percentage meets the minimum', (a, r) => `12th/diploma percentage ${a}% is below the minimum ${r}%`);
  academic('maximumActiveBacklogs', 'Active backlogs', rules.maximumActiveBacklogs, (u) => u.activeBacklogs, (a, r) => a <= r,
    'Active backlogs within limit', (a, r) => `Active backlogs (${a}) exceed the limit of ${r}`);
  academic('maximumTotalBacklogs', 'Total backlogs', rules.maximumTotalBacklogs, (u) => u.totalBacklogs, (a, r) => a <= r,
    'Total backlogs within limit', (a, r) => `Total backlogs (${a}) exceed the limit of ${r}`);
  if (has(globalMaxActiveBacklogs)) {
    academic('collegeBacklogPolicy', 'College backlog policy', globalMaxActiveBacklogs, (u) => u.activeBacklogs, (a, r) => a <= r,
      'Within the college-wide backlog limit', (a, r) => `Active backlogs (${a}) exceed the college-wide placement limit of ${r}`);
  }

  if (has(rules.additionalRequirements) && String(rules.additionalRequirements).trim()) {
    add('additionalRequirements', 'Additional requirements', 'info', rules.additionalRequirements, null,
      'Additional requirements are reviewed manually by the recruiter');
  }

  const failed = checks.filter((c) => c.status === 'fail');
  const pending = checks.filter((c) => c.status === 'pending');
  const result = failed.length ? ELIGIBILITY.INELIGIBLE : pending.length ? ELIGIBILITY.PENDING : ELIGIBILITY.ELIGIBLE;

  return {
    result,
    reasons: [...failed, ...pending].map((c) => c.message),
    checks,
    rulesVersion: drive?.rulesVersion ?? 1,
    evaluatedAt: new Date(),
  };
}

/** Compact snapshot stored on the application at submit time (what was evaluated, against which rule version). */
export function buildSnapshot(evaluation, student) {
  const v = student?.academicSummary?.verified || {};
  return {
    result: evaluation.result,
    rulesVersion: evaluation.rulesVersion,
    reasons: evaluation.reasons,
    checks: evaluation.checks.map(({ key, status, expected, actual }) => ({ key, status, expected, actual })),
    evaluatedAt: evaluation.evaluatedAt,
    studentData: {
      department: student?.department,
      degree: student?.degree,
      graduationYear: student?.graduationYear,
      verificationStatus: student?.verificationStatus,
      cgpa: v.cgpa ?? null,
      activeBacklogs: v.activeBacklogs ?? null,
      totalBacklogs: v.totalBacklogs ?? null,
    },
  };
}
