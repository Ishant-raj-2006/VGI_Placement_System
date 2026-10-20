import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5055';
const shots = process.env.SHOTS || './e2e-shots';
import fs from 'node:fs'; fs.mkdirSync(shots, { recursive: true });
const launchOpts = { args: ['--no-sandbox'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) };
const browser = await chromium.launch(launchOpts);
const problems = [];
const summary = [];

async function session(name, email, password, buildRoutes, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  let current = 'login';
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${name}] ${current} console: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] ${current} PAGEERROR: ${e.message.slice(0, 300)}`));
  page.on('response', (r) => { const u = r.url(); if (u.includes('/api/') && r.status() >= 400) problems.push(`[${name}] ${current} HTTP ${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`); });
  await page.goto(`${BASE}/login`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  const token = await page.evaluate(() => localStorage.getItem('cpms.token'));
  const api = (p) => page.evaluate(async ([p, t]) => (await (await fetch('/api/v1' + p, { headers: { Authorization: 'Bearer ' + t } })).json()).data, [p, token]);
  const routes = await buildRoutes(api);
  for (const r of routes) {
    current = r;
    await page.goto(`${BASE}${r}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(250);
    const text = await page.locator('main').innerText().catch(() => '');
    const bad = [];
    if (/Page not found|Access denied/i.test(await page.locator('body').innerText())) bad.push('NOT_FOUND/DENIED');
    if (await page.locator('main .alert-error').count()) bad.push('ERRORBOX: ' + (await page.locator('main .alert-error').first().innerText()).slice(0, 120));
    if (await page.locator('main .spinner').count()) bad.push('STILL_LOADING');
    if (!text.trim()) bad.push('EMPTY');
    if (bad.length) problems.push(`[${name}] ${r}: ${bad.join(' | ')}`);
    summary.push(`${name} ${r} ${bad.length ? 'FAIL' : 'ok'}`);
    if (process.env.ALLSHOTS || /^\/(student|recruiter|admin)$/.test(r)) await page.screenshot({ path: `${shots}/${name}${r.replace(/\//g, '_')}.png`, fullPage: false });
  }
  await ctx.close();
}

const first = (x) => (Array.isArray(x) ? x[0] : x);

await session('student', 'student1@college.edu', 'Student@123', async (api) => {
  const drives = await api('/drives?limit=50'); const apps = await api('/student/applications'); const offers = await api('/student/offers');
  return ['/student', '/student/profile', '/student/academic', '/student/verification', '/student/skills', '/student/experience', '/student/projects', '/student/resumes', '/student/drives',
    ...drives.slice(0, 2).map((d) => `/student/drives/${d._id}`), '/student/applications', ...apps.slice(0, 2).map((a) => `/student/applications/${a._id}`), '/student/interviews', '/student/offers',
    ...offers.slice(0, 1).map((o) => `/student/offers/${o._id}`), '/student/notifications', '/student/support', '/student/settings'];
});

await session('recruiter', 'hr@abc-tech.com', 'Recruiter@123', async (api) => {
  const drives = await api('/recruiter/drives?limit=50'); const d = drives.find((x) => x.applicantCount) || first(drives);
  const apps = await api(`/recruiter/drives/${d._id}/applications`); const rounds = await api(`/recruiter/drives/${d._id}/rounds`);
  return ['/recruiter', '/recruiter/company', '/recruiter/verification', '/recruiter/team', '/recruiter/drives', '/recruiter/drives/new', `/recruiter/drives/${d._id}`, `/recruiter/drives/${d._id}/edit`,
    `/recruiter/drives/${d._id}/applicants`, `/recruiter/drives/${d._id}/rounds`, `/recruiter/drives/${d._id}/interviews`, ...rounds.slice(0, 1).map((r) => `/recruiter/rounds/${r._id}`),
    ...apps.slice(0, 2).map((a) => `/recruiter/applications/${a.applicationId}`), '/recruiter/offers', '/recruiter/notifications', '/recruiter/support', '/recruiter/settings'];
});

await session('admin', 'admin@college.edu', 'Admin@12345', async (api) => {
  const students = await api('/admin/students?limit=5'); const companies = await api('/admin/companies?limit=5'); const drives = await api('/admin/drives?limit=5');
  return ['/admin', '/admin/recruitment', '/admin/reports', '/admin/students', `/admin/students/${students[0]._id}`, '/admin/students/import', '/admin/students/duplicates', '/admin/companies', `/admin/companies/${companies[0]._id}`,
    '/admin/drives', '/admin/drives/pending', `/admin/drives/${drives[0]._id}`, '/admin/applications', '/admin/offers', '/admin/policies', '/admin/tickets', '/admin/audit-logs', '/admin/users', '/admin/system', '/admin/notifications', '/admin/settings'];
});

await session('tpo', 'tpo@college.edu', 'Tpo@12345', async () => ['/admin', '/admin/users', '/admin/policies']);

// public pages + mobile viewport
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage(); let current = '';
  page.on('pageerror', (e) => problems.push(`[public] ${current} PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[public] ${current} console: ${m.text().slice(0, 200)}`); });
  for (const r of ['/', '/login', '/register?role=student', '/register?role=recruiter', '/forgot-password', '/reset-password', '/verify-email', '/contact', '/nonexistent']) {
    current = r; await page.goto(BASE + r); await page.waitForLoadState('networkidle'); await page.screenshot({ path: `${shots}/public${r.replace(/[\/?=]/g, '_')}.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    if (overflow) problems.push(`[public-mobile] ${r}: horizontal overflow`);
    summary.push(`public ${r} ok`);
  }
  await ctx.close();
}
await browser.close();
console.log(summary.filter((s) => s.endsWith('FAIL')).join('\n') || 'all routes rendered');
console.log(`checked ${summary.length} pages`);
console.log(problems.length ? 'PROBLEMS:\n' + [...new Set(problems)].join('\n') : 'NO PROBLEMS');
