import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5055';
const browser = await chromium.launch({ args: ['--no-sandbox'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const problems = [];
const step = async (name, fn) => { try { await fn(); console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '-', e.message.split('\n')[0]); problems.push(name); } };

const newPage = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${tag}] pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) problems.push(`[${tag}] console ${m.text().slice(0, 200)}`); });
  page.setDefaultTimeout(8000);
  return page;
};
const login = async (page, email, pw) => {
  await page.goto(BASE + '/login'); await page.getByLabel('E-mail').fill(email); await page.getByLabel('Password').fill(pw);
  await page.getByRole('button', { name: 'Log in' }).click(); await page.waitForURL((u) => !u.pathname.startsWith('/login'));
};
const dialog = (page) => page.getByRole('dialog');
const toastText = (page) => page.locator('.toast').last();
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const email = `flow${Date.now() % 100000}@college.edu`;
const future = (d) => new Date(Date.now() + d * 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

const student = await newPage('student'), hr = await newPage('recruiter'), tpo = await newPage('tpo');

console.log('1. Student registration & profile');
await step('register student via UI', async () => {
  await student.goto(BASE + '/register?role=student');
  await student.getByLabel('Full name').fill('Flow Tester'); await student.getByLabel('E-mail').fill(email);
  await student.getByLabel(/^Password/).fill('Flow@12345'); await student.getByLabel('Confirm password').fill('Flow@12345');
  await student.getByLabel('Student ID').fill('FT' + Date.now() % 100000); await student.getByLabel('Roll number').fill('RFT' + Date.now() % 100000);
  await student.getByLabel('Department').selectOption('CSE'); await student.getByLabel('Graduation year').fill('2028');
  await student.getByRole('button', { name: 'Create account' }).click();
  await student.waitForURL(/\/login/);
});
await step('login as new student', async () => { await login(student, email, 'Flow@12345'); await student.waitForURL(/\/student/); });
await step('enter academic summary', async () => {
  await student.goto(BASE + '/student/academic');
  await student.getByLabel('Current CGPA').fill('8.4'); await student.getByLabel('Active backlogs').fill('0'); await student.getByLabel('Total backlogs').fill('0');
  await student.getByLabel('10th percentage').fill('91'); await student.getByLabel('12th percentage').fill('88');
  await student.getByRole('button', { name: 'Save academic summary' }).click(); await toastText(student).waitFor();
});
await step('add detailed academic record via modal', async () => {
  await student.getByRole('button', { name: 'Add record' }).click();
  await dialog(student).getByLabel('Semester').fill('5'); await dialog(student).getByLabel('Score').fill('8.2');
  await dialog(student).getByRole('button', { name: 'Save' }).click(); await dialog(student).waitFor({ state: 'detached' });
  await student.getByRole('cell', { name: 'Semester 5' }).waitFor();
});
await step('personal details, skills, project, experience', async () => {
  await student.goto(BASE + '/student/profile'); await student.getByLabel('Contact number').fill('9876500000');
  await student.getByRole('button', { name: 'Save changes' }).click(); await toastText(student).waitFor();
  await student.goto(BASE + '/student/skills'); await student.getByLabel('Add Skills').fill('Java, React'); await student.getByRole('button', { name: 'Add', exact: true }).first().click();
  await student.getByRole('button', { name: 'Save', exact: true }).click(); await toastText(student).waitFor();
  await student.goto(BASE + '/student/projects'); await student.getByRole('button', { name: 'Add project' }).first().click();
  await dialog(student).getByLabel('Title').fill('CPMS clone'); await dialog(student).getByRole('button', { name: 'Save' }).click(); await student.getByText('CPMS clone').waitFor();
  await student.goto(BASE + '/student/experience'); await student.getByRole('button', { name: 'Add entry' }).first().click();
  await dialog(student).getByLabel('Title').fill('Summer intern'); await dialog(student).getByRole('button', { name: 'Save' }).click(); await student.getByText('Summer intern').waitFor();
});
await step('upload resume (and reject a fake one)', async () => {
  await student.goto(BASE + '/student/resumes');
  await student.setInputFiles('input[aria-label="Choose resume file"]', { name: 'evil.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ not a pdf') });
  await student.locator('.toast-error').waitFor();
  await student.setInputFiles('input[aria-label="Choose resume file"]', { name: 'resume.pdf', mimeType: 'application/pdf', buffer: pdf });
  await student.getByText('resume.pdf').waitFor();
});
await step('verification page shows pending', async () => { await student.goto(BASE + '/student/verification'); await student.getByText(/Pending verification/i).first().waitFor(); });

console.log('2. TPO verifies the student');
await login(tpo, 'tpo@college.edu', 'Tpo@12345');
await step('verify student from admin UI', async () => {
  await tpo.goto(BASE + '/admin/students'); await tpo.getByRole('searchbox').fill(email); await tpo.getByRole('link', { name: 'Flow Tester' }).click();
  await tpo.getByRole('button', { name: 'Verify…' }).click(); await dialog(tpo).getByRole('button', { name: 'Save' }).click(); await dialog(tpo).waitFor({ state: 'detached' });
  await tpo.getByText('Verified', { exact: true }).first().waitFor();
});

console.log('3. Recruiter creates and submits a drive');
await login(hr, 'hr@abc-tech.com', 'Recruiter@123');
const jobTitle = 'Flow QA Engineer ' + Date.now() % 10000;
let driveUrl;
await step('create drive via form', async () => {
  await hr.goto(BASE + '/recruiter/drives/new');
  await hr.getByLabel('Job title').fill(jobTitle); await hr.getByLabel('Description').first().fill('Test and automate quality checks for a fast moving product team.');
  await hr.getByLabel('CTC per year').fill('900000'); await hr.getByLabel('Minimum CGPA').fill('7'); await hr.getByLabel('Maximum active backlogs').fill('0');
  await hr.getByLabel('Allowed departments').fill('CSE, IT'); await hr.getByLabel('Graduation years').fill('2028');
  await hr.getByLabel('Applications open').fill(future(-1)); await hr.getByLabel('Application deadline').fill(future(7));
  await hr.getByRole('button', { name: 'Save draft' }).click(); await hr.waitForURL(/\/recruiter\/drives\/[a-f0-9]{24}$/); driveUrl = hr.url();
});
await step('submit for approval', async () => {
  await hr.getByRole('button', { name: 'Submit for approval' }).click(); await dialog(hr).getByRole('button', { name: 'Submit' }).click(); await dialog(hr).waitFor({ state: 'detached' });
  await hr.getByText('Waiting for placement cell approval').waitFor();
});
await step('student cannot see the unapproved drive', async () => {
  await student.goto(BASE + '/student/drives'); await student.waitForLoadState('networkidle');
  if (await student.getByText(jobTitle).count()) throw new Error('draft drive leaked to students');
});

console.log('4. TPO approves');
await step('approve from pending list', async () => {
  await tpo.goto(BASE + '/admin/drives/pending'); await tpo.getByRole('link', { name: jobTitle }).click();
  await tpo.getByRole('button', { name: 'Approve' }).click(); await dialog(tpo).getByRole('button', { name: 'Approve' }).click(); await dialog(tpo).waitFor({ state: 'detached' });
  await tpo.getByText('Published', { exact: true }).first().waitFor();
});

console.log('5. Student applies');
await step('student sees drive + eligibility, applies', async () => {
  await student.goto(BASE + '/student/drives'); await student.getByRole('link', { name: jobTitle }).click();
  await student.getByText('Your eligibility').first().waitFor(); await student.getByText('Eligible', { exact: true }).first().waitFor();
  await student.getByRole('button', { name: 'Apply now' }).click(); await dialog(student).getByRole('button', { name: 'Submit application' }).click();
  await student.waitForURL(/\/student\/applications\/[a-f0-9]{24}/); await student.getByText('Applied', { exact: true }).first().waitFor();
});
await step('duplicate application impossible from UI (button gone)', async () => {
  await student.goBack(); await student.waitForLoadState('networkidle');
  if (await student.getByRole('button', { name: 'Apply now' }).count()) throw new Error('apply button still shown');
});

console.log('6. Recruitment workflow');
await step('applicants: bulk shortlist needs confirmation', async () => {
  await hr.goto(driveUrl + '/applicants'); await hr.getByRole('row').filter({ hasText: 'Flow Tester' }).getByRole('checkbox').check();
  await hr.getByRole('button', { name: 'Shortlist', exact: true }).first().click();
  const confirmBtn = dialog(hr).getByRole('button', { name: /Confirm shortlist/ }); if (!(await confirmBtn.isDisabled())) throw new Error('confirm should be disabled until ticked');
  await dialog(hr).getByLabel('I confirm this bulk action.').check(); await confirmBtn.click(); await dialog(hr).getByText('1 succeeded').waitFor(); await dialog(hr).getByRole('button', { name: 'Done' }).click();
  await hr.getByRole('row').filter({ hasText: 'Flow Tester' }).getByText('Shortlisted').waitFor();
});
let roundUrl;
await step('create round, add candidate', async () => {
  await hr.goto(driveUrl + '/rounds'); await hr.getByRole('button', { name: 'Add round' }).click();
  await dialog(hr).getByLabel('Round name').fill('Technical interview'); await dialog(hr).getByRole('button', { name: 'Save' }).click(); await dialog(hr).waitFor({ state: 'detached' });
  await hr.getByRole('button', { name: 'Candidates & results' }).first().click(); await hr.waitForURL(/\/recruiter\/rounds\//); roundUrl = hr.url();
  await hr.getByRole('button', { name: 'Add candidates' }).click(); await dialog(hr).getByRole('row').filter({ hasText: 'Flow Tester' }).getByRole('checkbox').check();
  await dialog(hr).getByRole('button', { name: /Add 1 selected/ }).click(); await dialog(hr).waitFor({ state: 'detached' }); await hr.getByRole('row').filter({ hasText: 'Flow Tester' }).waitFor();
});
await step('schedule interview', async () => {
  await hr.getByRole('row').filter({ hasText: 'Flow Tester' }).getByRole('checkbox').check(); await hr.getByRole('button', { name: /Schedule interview/ }).click();
  await dialog(hr).getByLabel('Starts').fill(future(2)); await dialog(hr).getByLabel('Location / meeting link').fill('https://meet.example.com/x');
  await dialog(hr).getByRole('button', { name: 'Save' }).click(); await dialog(hr).waitFor({ state: 'detached' }); await hr.getByText('Scheduled').first().waitFor();
});
await step('student sees interview', async () => { await student.goto(BASE + '/student/interviews'); await student.getByText('Technical interview').waitFor(); });
await step('set result passed', async () => {
  await hr.getByRole('button', { name: 'Set result' }).click(); await dialog(hr).getByLabel('Result').selectOption('passed'); await dialog(hr).getByRole('button', { name: 'Save' }).click(); await dialog(hr).waitFor({ state: 'detached' });
  await hr.getByRole('row').filter({ hasText: 'Flow Tester' }).getByText('Passed').waitFor();
});
await step('mark selected from applicant page', async () => {
  await hr.getByRole('row').filter({ hasText: 'Flow Tester' }).getByRole('link', { name: 'Flow Tester' }).click();
  await hr.getByRole('button', { name: 'Selected', exact: true }).click(); await dialog(hr).getByRole('button', { name: 'Confirm' }).click(); await dialog(hr).waitFor({ state: 'detached' });
  await hr.getByRole('button', { name: 'Create offer' }).waitFor();
});
await step('create + issue offer', async () => {
  await hr.getByRole('button', { name: 'Create offer' }).click(); await dialog(hr).getByLabel('CTC per year').fill('950000'); await dialog(hr).getByLabel('Respond by').fill(future(5));
  await dialog(hr).getByLabel(/Issue immediately/).check(); await dialog(hr).getByRole('button', { name: 'Save' }).click(); await dialog(hr).waitFor({ state: 'detached' });
  await hr.getByText(/v1:/).waitFor();
});

console.log('7. Student responds to the offer');
await step('student accepts offer', async () => {
  await student.goto(BASE + '/student/offers'); await student.getByRole('link', { name: jobTitle }).click();
  await student.getByRole('button', { name: 'Accept offer' }).click(); await dialog(student).getByRole('button', { name: 'Accept offer' }).click(); await dialog(student).waitFor({ state: 'detached' });
  await student.getByText('Accepted', { exact: true }).first().waitFor();
});
await step('admin dashboard + department report reflect placement', async () => {
  await tpo.goto(BASE + '/admin'); await tpo.getByText('Students placed').first().waitFor();
  await tpo.goto(BASE + '/admin/reports'); await tpo.getByRole('tab', { name: 'Departments' }).click(); await tpo.getByRole('cell', { name: 'CSE' }).first().waitFor();
});
await step('audit log has drive approval entry', async () => { await tpo.goto(BASE + '/admin/audit-logs?'); await tpo.getByText('drive.approve').first().waitFor(); });
await step('policy change via UI', async () => {
  await tpo.goto(BASE + '/admin/policies'); await tpo.getByRole('row').filter({ hasText: 'Allow withdrawal' }).getByRole('button', { name: 'Change' }).click();
  await dialog(tpo).getByLabel('Value').selectOption('false'); await dialog(tpo).getByRole('button', { name: 'Save' }).click(); await dialog(tpo).waitFor({ state: 'detached' });
  await tpo.getByRole('row').filter({ hasText: 'Allow withdrawal' }).getByText('No').waitFor();
});
await step('logout works and protected route redirects', async () => {
  await student.getByRole('button', { name: 'Log out' }).click(); await student.waitForURL(/\/login/); await student.goto(BASE + '/student'); await student.waitForURL(/\/login/);
});
await browser.close();
console.log(problems.length ? '\nPROBLEMS:\n' + [...new Set(problems)].join('\n') : '\nALL FLOWS PASSED');
