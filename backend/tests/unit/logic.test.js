import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, assertTransition, actorMaySet, isTerminal } from '../../src/services/statusMachine.js';
import { computeCompletion } from '../../src/services/profileCompletion.js';
import { csvEscape, toCsv, median, redact, parsePagination, normalizeEmail, round2 } from '../../src/utils/helpers.js';
import { _clean } from '../../src/middleware/sanitize.js';
import { sniffType } from '../../src/middleware/upload.js';
import { validatePolicyValue } from '../../src/services/policy.service.js';
import { APP_STATUS_LIST } from '../../src/constants/index.js';

describe('Application status machine (BR-07)', () => {
  it('allows the normal happy path', () => {
    const path = ['applied', 'under_review', 'shortlisted', 'assessment', 'interview', 'selected', 'offered', 'offer_accepted'];
    for (let i = 0; i < path.length - 1; i++) assert.ok(canTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]}`);
  });
  it('rejects skipping stages and going backwards', () => {
    assert.equal(canTransition('applied', 'selected'), false);
    assert.equal(canTransition('applied', 'offered'), false);
    assert.equal(canTransition('shortlisted', 'applied'), false);
    assert.equal(canTransition('selected', 'applied'), false);
    assert.equal(canTransition('offer_declined', 'offered'), false);
  });
  it('terminal statuses cannot move', () => {
    for (const s of ['rejected', 'offer_declined']) assert.ok(isTerminal(s));
  });
  it('shortlisted and selected are different statuses', () => {
    assert.notEqual(APP_STATUS_LIST.indexOf('shortlisted'), APP_STATUS_LIST.indexOf('selected'));
    assert.equal(canTransition('shortlisted', 'offered'), false);
  });
  it('students can only withdraw - never select, shortlist or offer', () => {
    assert.ok(actorMaySet('student', 'withdrawn'));
    for (const s of ['selected', 'shortlisted', 'offered', 'offer_accepted', 'rejected', 'interview']) assert.equal(actorMaySet('student', s), false, s);
    assert.throws(() => assertTransition('shortlisted', 'selected', 'student'), /not allowed to set/);
  });
  it('recruiters cannot mark offered / offer_accepted directly (offer service only)', () => {
    assert.equal(actorMaySet('recruiter', 'offered'), false);
    assert.equal(actorMaySet('recruiter', 'offer_accepted'), false);
  });
  it('assertTransition produces a 409 with the allowed list', () => {
    try {
      assertTransition('applied', 'selected', 'recruiter');
      assert.fail('should throw');
    } catch (e) {
      assert.equal(e.status, 409);
      assert.equal(e.code, 'INVALID_TRANSITION');
      assert.ok(e.details.allowed.includes('shortlisted'));
    }
  });
  it('same-status transitions are rejected', () => {
    assert.throws(() => assertTransition('applied', 'applied', 'recruiter'), /already/);
  });
});

describe('Profile completion', () => {
  const user = { name: 'A' };
  const full = { personal: { contactNumber: '9' }, department: 'CSE', degree: 'B.Tech', graduationYear: 2028, skills: ['Java'], academicSummary: { entered: { cgpa: 8, activeBacklogs: 0 } } };
  it('is 100% when every required section is done', () => {
    assert.equal(computeCompletion(full, { user, projectCount: 1, hasResume: true }).percentage, 100);
  });
  it('4 of 5 sections = 80% (spec example)', () => {
    const r = computeCompletion(full, { user, projectCount: 1, hasResume: false });
    assert.equal(r.percentage, 80);
    assert.deepEqual(r.missing, ['resume']);
  });
  it('required sections are configurable and optional ones never block completion', () => {
    const r = computeCompletion({ ...full, skills: [] }, { user, projectCount: 0, hasResume: false, requiredSections: ['personal', 'academic'] });
    assert.equal(r.percentage, 100);
  });
  it('academic section needs CGPA and backlog data', () => {
    const r = computeCompletion({ ...full, academicSummary: { entered: { cgpa: 8 } } }, { user, projectCount: 1, hasResume: true });
    assert.deepEqual(r.missing, ['academic']);
  });
});

describe('helpers', () => {
  it('csvEscape quotes special characters and neutralises formula injection', () => {
    assert.equal(csvEscape('a,b'), '"a,b"');
    assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
    assert.equal(csvEscape('=SUM(A1:A9)'), "'=SUM(A1:A9)");
    assert.equal(csvEscape('+1 555'), "'+1 555");
    assert.equal(csvEscape(null), '');
    assert.equal(csvEscape(12), '12');
  });
  it('toCsv builds header + rows', () => {
    const csv = toCsv([{ a: 1, b: 'x' }], [{ header: 'A', key: 'a' }, { header: 'B', key: 'b' }]);
    assert.equal(csv, 'A,B\r\n1,x');
  });
  it('median handles odd / even / empty', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.equal(median([]), null);
  });
  it('redact hides secrets in nested metadata', () => {
    const r = redact({ user: 'a', password: 'x', nested: { token: 't', ok: 1 }, list: [{ passwordHash: 'h' }] });
    assert.equal(r.password, '[REDACTED]');
    assert.equal(r.nested.token, '[REDACTED]');
    assert.equal(r.nested.ok, 1);
    assert.equal(r.list[0].passwordHash, '[REDACTED]');
  });
  it('parsePagination clamps values', () => {
    assert.deepEqual(parsePagination({ page: '0', limit: '9999' }), { page: 1, limit: 100, skip: 0 });
    assert.deepEqual(parsePagination({ page: '3', limit: '10' }), { page: 3, limit: 10, skip: 20 });
  });
  it('normalizeEmail and round2', () => {
    assert.equal(normalizeEmail('  A@B.COM '), 'a@b.com');
    assert.equal(round2(7.005), 7.01);
  });
});

describe('NoSQL-injection sanitiser', () => {
  it('drops $-operators, dotted keys and prototype keys at any depth', () => {
    const dirty = JSON.parse('{"email":{"$ne":null},"ok":1,"a.b":2,"n":{"deep":{"$gt":"","x":1}},"__proto__":{"admin":true},"arr":[{"$where":"1"}]}');
    const c = _clean(dirty);
    assert.deepEqual(c.email, {});
    assert.equal(c.ok, 1);
    assert.equal('a.b' in c, false);
    assert.deepEqual(c.n.deep, { x: 1 });
    assert.deepEqual(c.arr, [{}]);
    assert.equal(({}).admin, undefined);
  });
});

describe('upload content sniffing', () => {
  it('detects PDF, DOCX(zip), PNG, JPEG by magic bytes and rejects others', () => {
    assert.equal(sniffType(Buffer.from('%PDF-1.7 ...')), 'application/pdf');
    assert.equal(sniffType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.equal(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
    assert.equal(sniffType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
    assert.equal(sniffType(Buffer.from('MZ\x90\x00 this is an exe')), null);
    assert.equal(sniffType(Buffer.from('<script>alert(1)</script>')), null);
  });
});

describe('policy validation', () => {
  it('accepts valid values and rejects invalid ones', () => {
    assert.doesNotThrow(() => validatePolicyValue('offerPolicy', 'single_offer'));
    assert.throws(() => validatePolicyValue('offerPolicy', 'whatever'), /Invalid value/);
    assert.throws(() => validatePolicyValue('nope', 1), /Unknown policy/);
    assert.throws(() => validatePolicyValue('allowWithdrawal', 'yes'), /true or false/);
    assert.doesNotThrow(() => validatePolicyValue('maxActiveBacklogsGlobal', null));
    assert.throws(() => validatePolicyValue('maxActiveBacklogsGlobal', -1), /Invalid value/);
  });
});
