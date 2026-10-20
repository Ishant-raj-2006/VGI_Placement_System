import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibility, resolveRules } from '../../src/services/eligibility.service.js';

// Drive used throughout the spec: CSE/IT, CGPA >= 7.0, zero active backlogs, batch 2028
const drive = {
  rulesVersion: 3,
  allowedDepartments: ['CSE', 'IT'],
  graduationYears: [2028],
  eligibilityRules: { minimumCgpa: 7.0, maximumActiveBacklogs: 0 },
};

const student = (over = {}) => {
  const { cgpa = 8.1, activeBacklogs = 0, totalBacklogs = 0, tenth = 90, twelfth = 85, verified = true, ...rest } = over;
  const v = { cgpa, activeBacklogs, totalBacklogs, tenthPercentage: tenth, twelfthPercentage: twelfth };
  return {
    department: 'CSE', degree: 'B.Tech', graduationYear: 2028,
    verificationStatus: verified ? 'verified' : 'pending_verification',
    academicSummary: { entered: v, ...(verified ? { verified: v } : {}) },
    ...rest,
  };
};

describe('Eligibility engine - spec test matrix (21.3)', () => {
  it('CGPA equal to the minimum and all other rules pass -> Eligible (boundary)', () => {
    assert.equal(evaluateEligibility(student({ cgpa: 7.0 }), drive).result, 'eligible');
  });
  it('CGPA below minimum -> Ineligible with reason', () => {
    const r = evaluateEligibility(student({ cgpa: 6.99 }), drive);
    assert.equal(r.result, 'ineligible');
    assert.match(r.reasons.join(' '), /CGPA 6.99 is below the minimum 7/);
  });
  it('Branch not in allowed list -> Ineligible with reason', () => {
    const r = evaluateEligibility(student({ department: 'MECH' }), drive);
    assert.equal(r.result, 'ineligible');
    assert.match(r.reasons[0], /Department not allowed/);
  });
  it('Active backlogs above the limit -> Ineligible with reason', () => {
    const r = evaluateEligibility(student({ activeBacklogs: 1 }), drive);
    assert.equal(r.result, 'ineligible');
    assert.match(r.reasons[0], /Active backlogs \(1\) exceed the limit of 0/);
  });
  it('Required academic data missing / unverified -> Pending Verification (never a pass)', () => {
    const r = evaluateEligibility(student({ verified: false }), drive);
    assert.equal(r.result, 'pending_verification');
    assert.ok(r.reasons.length >= 2);
  });
  it('Missing CGPA inside a verified record -> Pending Verification', () => {
    const s = student();
    s.academicSummary.verified.cgpa = null;
    assert.equal(evaluateEligibility(s, drive).result, 'pending_verification');
  });
  it('Graduation year not allowed -> Ineligible with reason', () => {
    const r = evaluateEligibility(student({ graduationYear: 2027 }), drive);
    assert.equal(r.result, 'ineligible');
    assert.match(r.reasons[0], /Graduation year 2027 not allowed/);
  });
  it('All configured criteria satisfied -> Eligible', () => {
    const r = evaluateEligibility(student(), drive);
    assert.equal(r.result, 'eligible');
    assert.equal(r.rulesVersion, 3);
    assert.equal(r.reasons.length, 0);
  });
});

describe('Eligibility engine - rules from the spec examples', () => {
  it('a high CGPA never overrides a department restriction (Mechanical 8.5 vs CSE/IT)', () => {
    const r = evaluateEligibility(student({ department: 'MECH', cgpa: 8.5 }), drive);
    assert.equal(r.result, 'ineligible');
    assert.match(r.reasons.join(' '), /Department not allowed/);
  });
  it('ineligible wins over pending: a definite failure is reported even when other data is unverified', () => {
    const r = evaluateEligibility(student({ department: 'MECH', verified: false }), drive);
    assert.equal(r.result, 'ineligible');
  });
  it('Company B: all branches, CGPA 6.5, max two active backlogs', () => {
    const b = { eligibilityRules: { minimumCgpa: 6.5, maximumActiveBacklogs: 2 }, allowedDepartments: [], graduationYears: [] };
    assert.equal(evaluateEligibility(student({ department: 'CIVIL', cgpa: 6.5, activeBacklogs: 2 }), b).result, 'eligible');
    assert.equal(evaluateEligibility(student({ department: 'CIVIL', cgpa: 6.5, activeBacklogs: 3 }), b).result, 'ineligible');
  });
  it('zero is a valid limit (0 backlogs allowed) and not treated as "no rule"', () => {
    assert.equal(evaluateEligibility(student({ activeBacklogs: 0 }), drive).result, 'eligible');
    assert.equal(evaluateEligibility(student({ activeBacklogs: 1 }), drive).result, 'ineligible');
  });
  it('empty department / year lists mean "no restriction"', () => {
    const open = { eligibilityRules: {}, allowedDepartments: [], graduationYears: [] };
    assert.equal(evaluateEligibility(student({ department: 'ANYTHING', graduationYear: 1999 }), open).result, 'eligible');
  });
  it('department comparison is case-insensitive and trims whitespace', () => {
    assert.equal(evaluateEligibility(student({ department: ' cse ' }), drive).result, 'eligible');
  });
  it('degree rule is formatting-insensitive (B.Tech == btech)', () => {
    const d = { ...drive, eligibilityRules: { ...drive.eligibilityRules, degrees: ['BTech'] } };
    assert.equal(evaluateEligibility(student({ degree: 'B.Tech' }), d).result, 'eligible');
    assert.equal(evaluateEligibility(student({ degree: 'MBA' }), d).result, 'ineligible');
  });
  it('10th and 12th percentage rules; 12th falls back to diploma percentage', () => {
    const d = { eligibilityRules: { minimumTenthPercentage: 75, minimumTwelfthPercentage: 70 }, allowedDepartments: [], graduationYears: [] };
    assert.equal(evaluateEligibility(student({ tenth: 74.9 }), d).result, 'ineligible');
    assert.equal(evaluateEligibility(student({ tenth: 75, twelfth: 70 }), d).result, 'eligible');
    const s = student({ twelfth: null });
    s.academicSummary.verified.diplomaPercentage = 72;
    assert.equal(evaluateEligibility(s, d).result, 'eligible');
  });
  it('total backlog limit is enforced', () => {
    const d = { eligibilityRules: { maximumTotalBacklogs: 1 }, allowedDepartments: [], graduationYears: [] };
    assert.equal(evaluateEligibility(student({ totalBacklogs: 2 }), d).result, 'ineligible');
  });
  it('college-wide backlog policy applies on top of the drive rules', () => {
    const open = { eligibilityRules: {}, allowedDepartments: [], graduationYears: [] };
    const r = evaluateEligibility(student({ activeBacklogs: 2 }), open, { globalMaxActiveBacklogs: 1 });
    assert.equal(r.result, 'ineligible');
    assert.match(r.reasons[0], /college-wide/);
  });
  it('float artefacts do not break the boundary (7.000000001 vs 7.0, 6.999999 treated as 7.0 at 2dp)', () => {
    assert.equal(evaluateEligibility(student({ cgpa: 7.0000001 }), drive).result, 'eligible');
  });
  it('when verification is not required by policy, student-entered values are used', () => {
    const r = evaluateEligibility(student({ verified: false }), drive, { requireVerification: false });
    assert.equal(r.result, 'eligible');
  });
  it('additionalRequirements are informational and never fail a student', () => {
    const d = { ...drive, eligibilityRules: { ...drive.eligibilityRules, additionalRequirements: 'Must relocate' } };
    const r = evaluateEligibility(student(), d);
    assert.equal(r.result, 'eligible');
    assert.ok(r.checks.some((c) => c.key === 'additionalRequirements' && c.status === 'info'));
  });
  it('resolveRules prefers top-level drive lists and normalises departments', () => {
    const r = resolveRules({ allowedDepartments: ['cse'], graduationYears: [2028], eligibilityRules: { allowedDepartments: ['ECE'] } });
    assert.deepEqual(r.allowedDepartments, ['CSE']);
  });
  it('rejected verification status is not trusted', () => {
    const s = student();
    s.verificationStatus = 'correction_required';
    assert.equal(evaluateEligibility(s, drive).result, 'pending_verification');
  });
});
