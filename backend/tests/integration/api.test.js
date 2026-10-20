import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, PW } from './helpers.js';

let t, admin, tpo, s1, s2, hr, hr2, hrDelta, hrZeta;

before(async () => {
  t = await boot();
  admin = await t.actor('admin@college.edu', PW.admin);
  tpo = await t.actor('tpo@college.edu', PW.tpo);
  s1 = await t.actor('student1@college.edu', PW.student);
  s2 = await t.actor('student2@college.edu', PW.student);
  hr = await t.actor('hr@abc-tech.com', PW.recruiter);
  hr2 = await t.actor('recruiter2@abc-tech.com', PW.recruiter);
  hrDelta = await t.actor('hr@delta-analytics.com', PW.recruiter);
  hrZeta = await t.actor('hr@zeta-systems.com', PW.recruiter);
});
after(async () => { await t?.close(); });

describe('health & envelope', () => {
  it('GET /health works', async () => {
    const r = await t.api.get('/health');
    assert.equal(r.status, 200);
  });
  it('unknown route -> 404 JSON error envelope', async () => {
    const r = await t.api.get('/api/v1/nope');
    assert.equal(r.status, 404);
    assert.equal(r.body.success, false);
    assert.ok(r.body.error.code);
  });
  it('security headers present and no x-powered-by', async () => {
    const r = await t.api.get('/health');
    assert.equal(r.headers['x-powered-by'], undefined);
    assert.ok(r.headers['x-content-type-options']);
  });
});

describe('Authentication & registration', () => {
  it('student self-registration is disabled', async () => {
    const r = await t.api.post('/api/v1/auth/register').send({ role: 'student', name: 'New Student', email: 'new.student@college.edu', password: 'Str0ng@Pass1', studentId: 'N-1' });
    assert.equal(r.status, 400);
  });
  it('faculty creates a student who must change the DOB password and complete their profile', async () => {
    const studentId = 'ONBOARD-001';
    const dateOfBirth = '2005-09-10';
    const created = await tpo.post('/admin/students', { name: 'Onboard Student', studentId, dateOfBirth });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const login = await t.api.post('/api/v1/auth/login').send({ identifier: studentId, password: dateOfBirth });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(login.body.data.user.mustChangePassword, true);
    assert.equal(login.body.data.user.mustCompleteProfile, true);
    const student = t.as(login.body.data.token);
    assert.equal((await student.get('/student/drives')).status, 403);
    assert.equal((await student.get('/student/profile')).status, 403);
    const changed = await student.post('/auth/change-password', { currentPassword: dateOfBirth, newPassword: 'N3w@Passw0rd' });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal((await student.get('/student/drives')).status, 403);
    const profile = await student.put('/student/profile', { rollNumber: 'ONBOARD-ROLL-001', degree: 'B.Tech', department: 'CSE', graduationYear: new Date().getFullYear() + 1, currentSemester: 1 });
    assert.equal(profile.status, 200, JSON.stringify(profile.body));
    assert.equal(profile.body.data.user.mustCompleteProfile, false);
    assert.equal((await student.get('/student/profile')).status, 200);
  });
  it('legacy student accounts that were not faculty-provisioned cannot log in', async () => {
    const { User, StudentProfile } = await import('../../src/models/index.js');
    const { hashPassword } = await import('../../src/services/auth.service.js');
    const user = await User.create({
      name: 'Legacy Student',
      email: 'legacy.student@college.edu',
      passwordHash: await hashPassword('Old@Pass123'),
      role: 'student',
    });
    await StudentProfile.create({ userId: user._id, studentId: 'LEGACY-001', rollNumber: 'LEGACY-001' });
    const result = await t.api.post('/api/v1/auth/login').send({ identifier: 'LEGACY-001', password: 'Old@Pass123' });
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, 'STUDENT_ACCOUNT_DISABLED');
  });
  it('cannot self-register as tpo/super_admin (role escalation blocked)', async () => {
    for (const role of ['tpo', 'super_admin', 'admin']) {
      const r = await t.api.post('/api/v1/auth/register').send({ role, name: 'X', email: `${role}@evil.com`, password: 'Str0ng@Pass1' });
      assert.equal(r.status, 400, role);
    }
  });
  it('mass-assignment: extra fields such as accountStatus/role cannot be injected', async () => {
    const r = await t.api.post('/api/v1/auth/register').send({ role: 'student', name: 'M', email: 'mass@college.edu', password: 'Str0ng@Pass1', studentId: 'M1', rollNumber: 'RM1', department: 'CSE', graduationYear: 2028, accountStatus: 'active', emailVerified: true, isAdmin: true });
    assert.equal(r.status, 400);
  });
  it('recruiter registration creates a company awaiting verification', async () => {
    const r = await t.api.post('/api/v1/auth/register').send({ role: 'recruiter', name: 'Rec', email: 'rec@newco.com', password: 'Str0ng@Pass1', company: { name: 'NewCo' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });
  it('login: wrong password and unknown email give the same generic message', async () => {
    const a = await t.api.post('/api/v1/auth/login').send({ email: 'student1@college.edu', password: 'Wrong@1234' });
    const b = await t.api.post('/api/v1/auth/login').send({ email: 'ghost@college.edu', password: 'Wrong@1234' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error.message, b.body.error.message);
  });
  it('login does not leak password hash; /me returns current user', async () => {
    const me = await s1.get('/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.email, 'student1@college.edu');
    assert.equal(JSON.stringify(me.body).includes('passwordHash'), false);
  });
  it('NoSQL injection in login body does not authenticate', async () => {
    const r = await t.api.post('/api/v1/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    assert.ok([400, 401].includes(r.status));
  });
  it('protected routes require a valid token', async () => {
    assert.equal((await t.api.get('/api/v1/auth/me')).status, 401);
    assert.equal((await t.api.get('/api/v1/auth/me').set('Authorization', 'Bearer garbage')).status, 401);
  });
  it('logout revokes the session server-side', async () => {
    const tok = (await t.api.post('/api/v1/auth/login').send({ email: 'student3@college.edu', password: PW.student })).body.data.token;
    const A = t.as(tok);
    assert.equal((await A.get('/auth/me')).status, 200);
    assert.equal((await A.post('/auth/logout')).status, 200);
    assert.equal((await A.get('/auth/me')).status, 401);
  });
  it('account lockout after repeated failures, even with the right password afterwards', async () => {
    for (let i = 0; i < 6; i++) await t.api.post('/api/v1/auth/login').send({ email: 'student9@college.edu', password: 'Bad@pass123' });
    const r = await t.api.post('/api/v1/auth/login').send({ email: 'student9@college.edu', password: PW.student });
    assert.ok([401, 423, 429].includes(r.status));
    assert.notEqual(r.status, 200);
  });
  it('forgot-password gives an identical response for existing and unknown emails', async () => {
    const a = await t.api.post('/api/v1/auth/forgot-password').send({ email: 'student2@college.edu' });
    const b = await t.api.post('/api/v1/auth/forgot-password').send({ email: 'nobody@college.edu' });
    assert.equal(a.status, b.status);
    assert.equal(a.body.data?.message, b.body.data?.message);
  });
  it('password reset flow works once and the token cannot be reused; old sessions revoked', async () => {
    const tok = (await t.api.post('/api/v1/auth/login').send({ email: 'student4@college.edu', password: PW.student })).body.data.token;
    const f = await t.api.post('/api/v1/auth/forgot-password').send({ email: 'student4@college.edu' });
    const resetToken = f.body.data?.devResetToken;
    if (!resetToken) return; // dev tokens not exposed in this configuration
    const r1 = await t.api.post('/api/v1/auth/reset-password').send({ token: resetToken, password: 'N3w@Passw0rd' });
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    const r2 = await t.api.post('/api/v1/auth/reset-password').send({ token: resetToken, password: 'An0ther@Pass1' });
    assert.ok(r2.status >= 400);
    assert.equal((await t.as(tok).get('/auth/me')).status, 401);
    assert.equal((await t.api.post('/api/v1/auth/login').send({ email: 'student4@college.edu', password: 'N3w@Passw0rd' })).status, 200);
  });
});

describe('Role-based access control', () => {
  it('student cannot reach admin, recruiter endpoints', async () => {
    for (const u of ['/admin/dashboard', '/admin/students', '/admin/policies', '/admin/users', '/admin/audit-logs', '/recruiter/dashboard', '/recruiter/drives']) {
      const r = await s1.get(u);
      assert.equal(r.status, 403, u);
    }
  });
  it('recruiter cannot reach student or admin endpoints', async () => {
    for (const u of ['/student/profile', '/student/dashboard', '/admin/dashboard', '/admin/students']) assert.equal((await hr.get(u)).status, 403, u);
  });
  it('TPO can use admin area but not super-admin-only user management', async () => {
    assert.equal((await tpo.get('/admin/dashboard')).status, 200);
    assert.equal((await tpo.get('/admin/students')).status, 200);
    assert.equal((await tpo.get('/admin/users')).status, 403);
    assert.equal((await tpo.get('/admin/system/health')).status, 403);
  });
  it('super admin can list users and see system health', async () => {
    assert.equal((await admin.get('/admin/users')).status, 200);
    assert.equal((await admin.get('/admin/system/health')).status, 200);
  });
  it('TPO cannot create a super admin; super admin can create staff', async () => {
    const body = { name: 'Staff', email: 'staff1@college.edu', password: 'Str0ng@Pass1', role: 'tpo' };
    assert.equal((await tpo.post('/admin/users', body)).status, 403);
    const r = await admin.post('/admin/users', body);
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });
  it('a user cannot change their own role through profile update', async () => {
    await s1.put('/auth/me', { name: 'Student One', role: 'super_admin' });
    const me = await s1.get('/auth/me');
    assert.equal(me.body.data.user.role, 'student');
  });
});

let publishedDrive;
describe('Student: profile, drives, eligibility, applications', () => {
  it('profile loads with completion info', async () => {
    const r = await s1.get('/student/profile');
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });
  it('dashboard loads', async () => assert.equal((await s1.get('/student/dashboard')).status, 200));
  it('student lists published drives only', async () => {
    const r = await s1.get('/drives');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const items = r.body.data.items ?? r.body.data;
    assert.ok(items.length > 0);
    for (const d of items) { assert.ok(d.company?.name); assert.ok(d.eligibility?.result); }
    publishedDrive = items[0];
  });
  it('eligibility endpoint returns a decision with reasons structure', async () => {
    const items = (await s1.get('/drives')).body.data.items ?? (await s1.get('/drives')).body.data;
    for (const d of items) {
      const r = await s1.get(`/drives/${d._id}/eligibility`);
      assert.equal(r.status, 200);
      const e = r.body.data.eligibility ?? r.body.data;
      assert.ok(['eligible', 'ineligible', 'pending_verification'].includes(e.result), JSON.stringify(e));
    }
  });
  it('duplicate application is blocked (unique student+drive)', async () => {
    const apps = await s1.get('/student/applications');
    assert.equal(apps.status, 200);
    const list = apps.body.data.items ?? apps.body.data;
    assert.ok(list.length > 0);
    const driveId = list[0].drive?._id ?? list[0].driveId;
    const again = await s1.post(`/drives/${driveId}/applications`, {});
    assert.ok([409, 422, 400].includes(again.status), `${again.status} ${JSON.stringify(again.body)}`);
  });
  it('student cannot read another student application', async () => {
    const mine = (await s1.get('/student/applications')).body.data;
    const id = (mine.items ?? mine)[0]._id;
    assert.equal((await s1.get(`/student/applications/${id}`)).status, 200);
    assert.equal((await s2.get(`/student/applications/${id}`)).status, 404);
  });
  it('invalid ObjectId in path -> 400 not 500', async () => {
    const r = await s1.get('/student/applications/not-an-id');
    assert.equal(r.status, 400);
  });
});

describe('File access control', () => {
  it('only the owner (and authorised staff) can download a resume', async () => {
    const list = await s1.get('/student/resumes');
    assert.equal(list.status, 200);
    const resumes = list.body.data.items ?? list.body.data;
    if (!resumes.length) return;
    const id = resumes[0]._id;
    assert.equal((await s1.get(`/files/resumes/${id}`)).status, 200);
    assert.equal((await tpo.get(`/files/resumes/${id}`)).status, 200);
    assert.equal((await s2.get(`/files/resumes/${id}`)).status, 404);
    assert.equal((await hrZeta.get(`/files/resumes/${id}`)).status >= 403, true);
    assert.equal((await t.api.get(`/api/v1/files/resumes/${id}`)).status, 401);
  });
  it('upload with fake extension/content is rejected (magic bytes)', async () => {
    const r = await t.api.post('/api/v1/student/resumes').set('Authorization', `Bearer ${await t.login('student1@college.edu', PW.student)}`)
      .attach('file', Buffer.from('MZ this is not a pdf'), { filename: 'evil.pdf', contentType: 'application/pdf' });
    assert.ok(r.status >= 400 && r.status < 500, String(r.status));
  });
});

describe('Recruiter scoping (multi-tenant isolation)', () => {
  it('recruiter lists only their own company drives', async () => {
    const a = (await hr.get('/recruiter/drives')).body.data;
    const b = (await hrDelta.get('/recruiter/drives')).body.data;
    const ids = (x) => new Set((x.items ?? x).map((d) => String(d._id)));
    const A = ids(a), B = ids(b);
    assert.ok(A.size > 0 && B.size > 0);
    for (const id of A) assert.equal(B.has(id), false);
  });
  it('recruiter of company B cannot read/edit company A drive, applicants or rounds (404)', async () => {
    const aDrive = [...(await hr.get('/recruiter/drives')).body.data.items ?? (await hr.get('/recruiter/drives')).body.data][0]._id;
    assert.equal((await hrDelta.get(`/recruiter/drives/${aDrive}`)).status, 404);
    assert.equal((await hrDelta.put(`/recruiter/drives/${aDrive}`, { jobTitle: 'hijack' })).status, 404);
    assert.equal((await hrDelta.get(`/recruiter/drives/${aDrive}/rounds`)).status, 404);
    assert.equal((await hrDelta.get(`/recruiter/drives/${aDrive}/applications`)).status, 404);
  });
  it('colleagues in the same company share access', async () => {
    const a = (await hr.get('/recruiter/drives')).body.data;
    const id = (a.items ?? a)[0]._id;
    assert.equal((await hr2.get(`/recruiter/drives/${id}`)).status, 200);
  });
  it('unverified company cannot submit a drive for approval', async () => {
    const create = await hrZeta.post('/recruiter/drives', {
      jobTitle: 'Test role', description: 'A role description that is long enough.', employmentType: 'full_time',
      compensation: { kind: 'annual_ctc', ctc: 600000 },
      applicationOpensAt: new Date().toISOString(), applicationDeadline: new Date(Date.now() + 5 * 864e5).toISOString(),
    });
    if (create.status !== 201) return assert.ok(create.status >= 400, JSON.stringify(create.body));
    const submit = await hrZeta.post(`/recruiter/drives/${create.body.data._id}/submit`);
    assert.equal(submit.status >= 400, true, 'unverified company must not submit');
  });
  it('recruiter dashboard loads', async () => assert.equal((await hr.get('/recruiter/dashboard')).status, 200));
});

describe('Drive approval workflow end-to-end through the API', () => {
  let driveId;
  it('recruiter drafts, submits; student cannot see it; TPO approves; student sees it; eligibility enforced', async () => {
    const create = await hr.post('/recruiter/drives', {
      jobTitle: 'API Test Engineer', description: 'Build and test APIs for our platform team.', employmentType: 'full_time',
      compensation: { kind: 'annual_ctc', ctc: 800000 },
      eligibilityRules: { minimumCgpa: 7, maximumActiveBacklogs: 0 },
      allowedDepartments: ['CSE', 'IT'], graduationYears: [2026, 2027, 2028],
      applicationOpensAt: new Date(Date.now() - 864e5).toISOString(), applicationDeadline: new Date(Date.now() + 7 * 864e5).toISOString(),
    });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    driveId = create.body.data._id;

    let list = (await s1.get('/drives')).body.data;
    assert.equal((list.items ?? list).some((d) => d._id === driveId), false, 'draft must be invisible');
    assert.equal((await s1.get(`/drives/${driveId}`)).status, 404);

    const submit = await hr.post(`/recruiter/drives/${driveId}/submit`);
    assert.equal(submit.status, 200, JSON.stringify(submit.body));

    // student cannot approve; TPO can
    assert.equal((await s1.post(`/admin/drives/${driveId}/approve`)).status, 403);
    assert.equal((await hr.post(`/admin/drives/${driveId}/approve`)).status, 403);
    const approve = await tpo.post(`/admin/drives/${driveId}/approve`);
    assert.equal(approve.status, 200, JSON.stringify(approve.body));

    const pol = await tpo.get('/admin/policies');
    assert.equal(pol.status, 200);

    // published (autoPublishOnApproval) or publish explicitly
    let visible = (await s1.get(`/drives/${driveId}`)).status;
    if (visible !== 200) {
      assert.equal((await tpo.post(`/admin/drives/${driveId}/publish`)).status, 200);
      visible = (await s1.get(`/drives/${driveId}`)).status;
    }
    assert.equal(visible, 200);
  });
  it('eligible student applies once; concurrent duplicate submits yield exactly one application', async () => {
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => s2.post(`/drives/${driveId}/applications`, {})));
    const okCount = results.filter((r) => r.status === 201 || r.status === 200).length;
    assert.equal(okCount, 1, results.map((r) => r.status + ':' + (r.body?.error?.code || '') + ':' + JSON.stringify(r.body?.error?.details || r.body?.error?.message)).join(' | '));
    const list = (await s2.get('/student/applications')).body.data;
    assert.equal((list.items ?? list).filter((a) => String(a.drive?._id ?? a.driveId) === String(driveId)).length, 1);
  });
  it('recruiter sees the applicant; other-company recruiter does not', async () => {
    const r = await hr.get(`/recruiter/drives/${driveId}/applications`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const apps = r.body.data.items ?? r.body.data;
    assert.equal(apps.length, 1);
    assert.equal((await hrDelta.get(`/recruiter/drives/${driveId}/applications`)).status, 404);
  });
  it('invalid status transition is rejected (applied -> selected) and a valid one works', async () => {
    const apps = (await hr.get(`/recruiter/drives/${driveId}/applications`)).body.data;
    const appId = (apps.items ?? apps)[0].applicationId ?? (apps.items ?? apps)[0]._id;
    // applied -> selected skips stages: must be refused
    const bad = await hr.post(`/recruiter/applications/${appId}/selection`, { outcome: 'selected' });
    assert.ok([409, 422].includes(bad.status), JSON.stringify(bad.body));
    const review = await hr.post(`/recruiter/applications/${appId}/review`);
    assert.equal(review.status, 200, JSON.stringify(review.body));
    const short = await hr.post(`/recruiter/applications/${appId}/shortlist`);
    assert.equal(short.status, 200, JSON.stringify(short.body));
    // going backwards is refused
    assert.equal((await hr.post(`/recruiter/applications/${appId}/review`)).status, 409);
    // students and other-company recruiters can never set status
    assert.equal((await s2.post(`/recruiter/applications/${appId}/shortlist`)).status, 403);
    assert.equal((await hrDelta.post(`/recruiter/applications/${appId}/reject`)).status, 404);
  });
  it('student can withdraw their own application (policy default)', async () => {
    const list = (await s2.get('/student/applications')).body.data;
    const a = (list.items ?? list).find((x) => String(x.drive?._id ?? x.driveId) === String(driveId));
    const w = await s2.post(`/student/applications/${a._id}/withdraw`, {});
    assert.equal(w.status, 200, JSON.stringify(w.body));
    assert.equal((await s2.get(`/student/applications/${a._id}`)).body.data.application.status, 'withdrawn');
  });
});

describe('Ineligible student blocked server-side', () => {
  it('student with insufficient CGPA cannot apply even by calling the API directly', async () => {
    const create = await hr.post('/recruiter/drives', {
      jobTitle: 'Elite Role', description: 'Very demanding role requiring top grades.', employmentType: 'full_time',
      compensation: { kind: 'annual_ctc', ctc: 2000000 }, eligibilityRules: { minimumCgpa: 9.9 },
      applicationOpensAt: new Date(Date.now() - 864e5).toISOString(), applicationDeadline: new Date(Date.now() + 7 * 864e5).toISOString(),
    });
    const id = create.body.data._id;
    await hr.post(`/recruiter/drives/${id}/submit`);
    await tpo.post(`/admin/drives/${id}/approve`);
    await tpo.post(`/admin/drives/${id}/publish`);
    const r = await s1.post(`/drives/${id}/applications`, {});
    assert.ok([403, 422].includes(r.status), `${r.status} ${JSON.stringify(r.body)}`);
  });
});

describe('Policy management & audit', () => {
  it('only TPO/admin can change policy; invalid values rejected; change is audit-logged and versioned', async () => {
    assert.equal((await s1.put('/admin/policies/offerPolicy', { value: 'single_offer' })).status, 403);
    assert.equal((await hr.put('/admin/policies/offerPolicy', { value: 'single_offer' })).status, 403);
    const bad = await tpo.put('/admin/policies/offerPolicy', { value: 'banana' });
    assert.equal(bad.status, 400, JSON.stringify(bad.body));
    const good = await tpo.put('/admin/policies/offerPolicy', { value: 'multiple_offers_one_accept', reason: 'test' });
    assert.equal(good.status, 200, JSON.stringify(good.body));
    const hist = await tpo.get('/admin/policies/offerPolicy/history');
    assert.equal(hist.status, 200);
    const logs = await tpo.get('/admin/audit-logs');
    assert.equal(logs.status, 200);
    assert.equal(JSON.stringify(logs.body).includes('passwordHash'), false);
  });
  it('audit logs are not accessible to students/recruiters', async () => {
    assert.equal((await s1.get('/admin/audit-logs')).status, 403);
    assert.equal((await hr.get('/admin/audit-logs')).status, 403);
  });
});

describe('Offers', () => {
  it('student sees own offers only', async () => {
    const mine = await s1.get('/student/offers');
    assert.equal(mine.status, 200);
    const list = mine.body.data.items ?? mine.body.data;
    for (const o of list) {
      const r = await s2.get(`/student/offers/${o._id}`);
      assert.equal(r.status, 404);
    }
  });
  it('recruiter lists company offers; other company cannot fetch/modify them', async () => {
    const l = await hr.get('/recruiter/offers');
    assert.equal(l.status, 200);
    const offers = l.body.data.items ?? l.body.data;
    if (!offers.length) return;
    assert.equal((await hrDelta.post(`/recruiter/offers/${offers[0]._id}/withdraw`, { reason: 'x' })).status, 404);
  });
  it('student cannot create or issue offers', async () => {
    const apps = (await s1.get('/student/applications')).body.data;
    const id = (apps.items ?? apps)[0]._id;
    assert.equal((await s1.post(`/recruiter/applications/${id}/offers`, { ctc: 1 })).status, 403);
  });
});

describe('Reports & export', () => {
  const reports = ['/admin/analytics/placements', '/admin/analytics/departments', '/admin/analytics/companies', '/admin/analytics/salary', '/admin/analytics/funnel', '/admin/recruitment'];
  for (const u of reports) {
    it(`GET ${u} returns data for TPO`, async () => {
      const r = await tpo.get(u);
      assert.equal(r.status, 200, `${u}: ${JSON.stringify(r.body).slice(0, 300)}`);
    });
  }
  it('CSV export works and contains no formula-injection prefix', async () => {
    const r = await tpo.get('/admin/reports/departments?format=csv');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /csv/);
    for (const line of r.text.split(/\r?\n/)) for (const cell of line.split(',')) assert.equal(/^[=+@]/.test(cell), false, cell);
  });
  it('XLSX export returns a zip file', async () => {
    const r = await tpo.raw.get('/api/v1/admin/reports/departments?format=xlsx').set('Authorization', `Bearer ${await t.login('tpo@college.edu', PW.tpo)}`).buffer(true).parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    assert.equal(r.status, 200);
    assert.equal(r.body.slice(0, 2).toString(), 'PK');
  });
  it('students/recruiters cannot access reports', async () => {
    assert.equal((await s1.get('/admin/analytics/placements')).status, 403);
    assert.equal((await hr.get('/admin/analytics/placements')).status, 403);
  });
  it('placement totals reconcile with the dashboard', async () => {
    const dash = (await tpo.get('/admin/dashboard')).body.data;
    const rep = (await tpo.get('/admin/analytics/placements')).body.data;
    assert.equal(typeof dash.totals.studentsPlaced, 'number');
    assert.equal(dash.totals.studentsPlaced, rep.totals.studentsPlaced);
    // department report must add up to the same unique-student count (a student with 2 accepted offers counts once)
    const deptPlaced = rep.departments.rows.reduce((n, r) => n + (r.studentsPlaced || 0), 0);
    assert.equal(deptPlaced, dash.totals.studentsPlaced);
    assert.ok(dash.totals.offersAccepted >= dash.totals.studentsPlaced);
  });
});

describe('Notifications & support', () => {
  it('notifications list / unread count / mark all read', async () => {
    assert.equal((await s1.get('/notifications')).status, 200);
    assert.equal((await s1.get('/notifications/unread-count')).status, 200);
    assert.equal((await s1.post('/notifications/read-all')).status, 200);
    const c = await s1.get('/notifications/unread-count');
    assert.equal(c.body.data.unread, 0);
  });
  it('another user cannot mark my notification read (404)', async () => {
    const l = (await s1.get('/notifications')).body.data;
    const n = (l.items ?? l)[0];
    if (n) assert.equal((await s2.post(`/notifications/${n._id}/read`)).status, 404);
  });
  it('public contact form works and validates input', async () => {
    assert.equal((await t.api.post('/api/v1/support/contact').send({})).status, 400);
    const r = await t.api.post('/api/v1/support/contact').send({ name: 'Visitor', email: 'v@x.com', subject: 'Help', message: 'I need help logging in please.' });
    assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  });
  it('ticket lifecycle: student raises, only owner + staff can see', async () => {
    const r = await s1.post('/support/tickets', { type: 'support', subject: 'Cannot upload', message: 'The upload button does nothing.' });
    assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
    const mine = await s1.get('/support/tickets');
    assert.equal(mine.status, 200);
    const s2list = (await s2.get('/support/tickets')).body.data;
    assert.equal((s2list.items ?? s2list).length, 0);
    assert.equal((await tpo.get('/admin/tickets')).status, 200);
  });
});

describe('Student bulk import (TPO)', () => {
  it('dry-run validates without writing, flags bad rows', async () => {
    const csv = 'name,email,studentId,rollNumber,department,graduationYear,cgpa,activeBacklogs\nA One,imp1@college.edu,I1,RI1,CSE,2028,8.2,0\nBad Row,not-an-email,I2,RI2,CSE,2028,8.2,0\n';
    const tok = await t.login('tpo@college.edu', PW.tpo);
    const r = await t.api.post('/api/v1/admin/students/import?dryRun=true').set('Authorization', `Bearer ${tok}`).attach('file', Buffer.from(csv), { filename: 'students.csv', contentType: 'text/csv' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const d = r.body.data;
    assert.ok(JSON.stringify(d).match(/error|invalid/i), 'bad row should be reported');
    const after = await tpo.get('/admin/students?q=imp1@college.edu');
    const items = after.body.data.items ?? after.body.data;
    assert.equal(items.length, 0, 'dry-run must not create users');
  });
  it('students cannot import', async () => {
    const tok = await t.login('student1@college.edu', PW.student);
    const r = await t.api.post('/api/v1/admin/students/import').set('Authorization', `Bearer ${tok}`).attach('file', Buffer.from('a,b\n1,2'), { filename: 'x.csv', contentType: 'text/csv' });
    assert.equal(r.status, 403);
  });
});
