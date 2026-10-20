/**
 * Seed script: creates a realistic demo dataset using the SAME services the API uses, so the data respects every
 * business rule (eligibility, status transitions, offer policy...).
 *
 *   npm run seed          -> adds demo data (skips users that already exist)
 *   npm run seed:reset    -> DROPS the database first, then seeds
 *
 * Demo logins (all passwords are for LOCAL DEMO ONLY - change/remove before any real deployment):
 *   Super Admin  admin@college.edu          Admin@12345   (override with SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
 *   TPO          tpo@college.edu            Tpo@12345
 *   Students     student1@college.edu ...   Student@123   (student1 .. student10)
 *   Recruiters   hr@abc-tech.com            Recruiter@123 (owner of ABC Technologies, verified)
 *                recruiter2@abc-tech.com    Recruiter@123 (recruiter role at ABC Technologies)
 *                hr@delta-analytics.com     Recruiter@123 (verified)
 *                hr@zeta-systems.com        Recruiter@123 (company pending verification)
 */
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import * as M from '../src/models/index.js';
import { hashPassword } from '../src/services/auth.service.js';
import * as driveSvc from '../src/services/drive.service.js';
import * as recruitSvc from '../src/services/recruitment.service.js';
import * as offerSvc from '../src/services/offer.service.js';
import { submitApplication, transitionApplication } from '../src/services/application.service.js';
import { saveFile } from '../src/services/storage.service.js';
import { setPolicy } from '../src/services/policy.service.js';

if (config.isProd && !process.argv.includes('--force-production')) {
  console.error('Refusing to seed a production database. Pass --force-production if you really mean it.');
  process.exit(1);
}

const reset = process.argv.includes('--reset');
const DAY = 86400000;
const inDays = (n) => new Date(Date.now() + n * DAY);

// Smallest valid-looking PDF so the demo resumes pass the %PDF- signature check
const demoPdf = (title) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]>>endobj\ntrailer<</Root 1 0 R>>\n% Demo resume: ${title}\n%%EOF\n`);

async function mkUser({ name, email, password, role, status = 'active' }) {
  let u = await M.User.findOne({ email });
  if (u) {
    if (role === 'student' && !u.facultyProvisioned) {
      u.facultyProvisioned = true;
      await u.save();
    }
    return u;
  }
  u = await M.User.create({ name, email, passwordHash: await hashPassword(password), role, accountStatus: status, emailVerifiedAt: new Date(), ...(role === 'student' ? { facultyProvisioned: true } : {}) });
  return u;
}

async function main() {
  await connectDb();
  if (reset) {
    console.log('Dropping database...');
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  } else {
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  }

  console.log('Creating staff...');
  const admin = await mkUser({ name: 'System Administrator', email: process.env.SEED_ADMIN_EMAIL || 'admin@college.edu', password: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345', role: 'super_admin' });
  const tpo = await mkUser({ name: 'Dr. Meenakshi Rao (TPO)', email: 'tpo@college.edu', password: 'Tpo@12345', role: 'tpo' });

  console.log('Creating students...');
  const rows = [
    ['Aarav Sharma', 'CSE', 8.4, 0, 2028, true], ['Diya Patel', 'IT', 7.2, 0, 2028, true], ['Rohan Gupta', 'ECE', 8.6, 0, 2028, true],
    ['Sneha Reddy', 'MECH', 8.9, 0, 2028, true], ['Karan Singh', 'CSE', 6.5, 1, 2028, true], ['Meera Iyer', 'CSE', 7.9, 0, 2028, false],
    ['Vikram Das', 'IT', 7.0, 0, 2028, true], ['Anjali Nair', 'CSE', 9.1, 0, 2028, true], ['Rahul Verma', 'CIVIL', 7.5, 2, 2027, true],
    ['Priya Joshi', 'ECE', 8.0, 0, 2028, true],
  ];
  const students = [];
  for (let i = 0; i < rows.length; i++) {
    const [name, department, cgpa, activeBacklogs, graduationYear, verified] = rows[i];
    const n = i + 1;
    const user = await mkUser({ name, email: `student${n}@college.edu`, password: 'Student@123', role: 'student' });
    let profile = await M.StudentProfile.findOne({ userId: user._id });
    if (!profile) {
      const entered = { cgpa, activeBacklogs, totalBacklogs: activeBacklogs, tenthPercentage: 90 - i, twelfthPercentage: 85 - i };
      profile = await M.StudentProfile.create({
        userId: user._id, studentId: `CS2024${String(n).padStart(3, '0')}`, rollNumber: `22${department}${String(n).padStart(3, '0')}`,
        department, degree: 'B.Tech', graduationYear, collegeName: 'Demo Institute of Technology', currentSemester: 5,
        personal: { contactNumber: `98765432${String(10 + n)}` },
        skills: [['Java', 'SQL', 'React'], ['Python', 'SQL'], ['C++', 'Embedded C'], ['AutoCAD'], ['JavaScript', 'Node.js'], ['Java', 'Spring'], ['Python', 'Django'], ['Java', 'Python', 'MongoDB', 'React'], ['STAAD Pro'], ['VHDL', 'Python']][i],
        academicSummary: { entered, ...(verified ? { verified: { ...entered, verifiedAt: new Date(), verifiedBy: tpo._id, source: 'tpo' } } : {}) },
        verificationStatus: verified ? 'verified' : 'pending_verification',
      });
      await M.StudentProject.create({ studentId: profile._id, title: `${department} Capstone Project`, description: 'Demo project', technologies: ['Git'] });
      const key = await saveFile('resumes', demoPdf(name), '.pdf');
      await M.Resume.create({ studentId: profile._id, storageKey: key, originalName: `${name.replace(/ /g, '_')}_Resume.pdf`, mimeType: 'application/pdf', sizeBytes: 300 });
    }
    students.push({ user, profile });
  }

  console.log('Creating companies & recruiters...');
  const mkCompany = async ({ name, industry, website, status, ownerEmail, ownerName }) => {
    const owner = await mkUser({ name: ownerName, email: ownerEmail, password: 'Recruiter@123', role: 'recruiter' });
    let c = await M.Company.findOne({ nameKey: name.toLowerCase() }).select('+nameKey');
    if (!c) {
      c = await M.Company.create({
        name, nameKey: name.toLowerCase(), industry, website, description: `${name} - demo company`, contactEmail: ownerEmail, headquarters: 'Bengaluru',
        verificationStatus: status, verifiedBy: status === 'verified' ? tpo._id : undefined, verifiedAt: status === 'verified' ? new Date() : undefined, createdBy: owner._id, submittedForVerificationAt: new Date(),
      });
      await M.CompanyUser.create({ companyId: c._id, userId: owner._id, companyRole: 'owner', status: 'active' });
    }
    return { company: c, owner };
  };
  const abc = await mkCompany({ name: 'ABC Technologies', industry: 'Software', website: 'https://abc-tech.example.com', status: 'verified', ownerEmail: 'hr@abc-tech.com', ownerName: 'Neha Kapoor (ABC HR)' });
  const delta = await mkCompany({ name: 'Delta Analytics', industry: 'Data & AI', website: 'https://delta-analytics.example.com', status: 'verified', ownerEmail: 'hr@delta-analytics.com', ownerName: 'Arjun Mehta (Delta HR)' });
  const zeta = await mkCompany({ name: 'Zeta Systems', industry: 'Embedded Systems', website: 'https://zeta-systems.example.com', status: 'pending', ownerEmail: 'hr@zeta-systems.com', ownerName: 'Isha Rao (Zeta HR)' });
  const abcRec2 = await mkUser({ name: 'Rajesh Kumar (ABC Recruiter)', email: 'recruiter2@abc-tech.com', password: 'Recruiter@123', role: 'recruiter' });
  await M.CompanyUser.updateOne({ userId: abcRec2._id }, { $setOnInsert: { companyId: abc.company._id, userId: abcRec2._id, companyRole: 'recruiter', status: 'active' } }, { upsert: true });

  if (await M.PlacementDrive.exists({ companyId: abc.company._id })) {
    console.log('Drives already exist - skipping drive/application seeding (use npm run seed:reset for a clean demo).');
    await disconnectDb();
    return;
  }

  console.log('Creating placement drives...');
  const baseDrive = {
    employmentType: 'full_time', workMode: 'hybrid', applicationOpensAt: inDays(-3), applicationDeadline: inDays(20),
    requiredSkills: ['Java', 'SQL'], locations: ['Bengaluru'],
  };
  const abcDrive = await driveSvc.createDrive({
    company: abc.company, user: abc.owner,
    data: {
      ...baseDrive, jobTitle: 'Software Engineer', description: 'Build and ship backend services for our cloud platform.',
      responsibilities: 'Design APIs, write tests, participate in code reviews.', qualifications: 'B.Tech CSE/IT, strong DSA fundamentals.',
      compensation: { kind: 'annual_ctc', ctc: 800000, min: 700000, max: 900000, currency: 'INR' }, vacancies: 10,
      eligibilityRules: { minimumCgpa: 7.0, maximumActiveBacklogs: 0 }, allowedDepartments: ['CSE', 'IT'], graduationYears: [2028],
      selectionProcess: [{ name: 'Aptitude Test', type: 'aptitude' }, { name: 'Coding Assessment', type: 'coding' }, { name: 'Technical Interview', type: 'technical_interview' }, { name: 'HR Interview', type: 'hr_interview' }],
    },
  });
  const deltaDrive = await driveSvc.createDrive({
    company: delta.company, user: delta.owner,
    data: {
      ...baseDrive, jobTitle: 'Data Analyst', description: 'Turn data into decisions for enterprise customers.', requiredSkills: ['Python', 'SQL'],
      compensation: { kind: 'annual_ctc', ctc: 650000, min: 600000, max: 700000, currency: 'INR' },
      eligibilityRules: { minimumCgpa: 8.0, maximumActiveBacklogs: 0 }, allowedDepartments: ['CSE', 'IT', 'ECE'], graduationYears: [2028], locations: ['Hyderabad'],
      selectionProcess: [{ name: 'Online Test', type: 'aptitude' }, { name: 'Technical Interview', type: 'technical_interview' }],
    },
  });
  const internDrive = await driveSvc.createDrive({
    company: abc.company, user: abc.owner,
    data: {
      ...baseDrive, jobTitle: 'Graduate Trainee (Support Engineering)', employmentType: 'graduate_trainee', description: 'Two-year trainee programme with rotation across teams.',
      compensation: { kind: 'monthly_stipend', stipend: 25000, min: 20000, max: 30000, currency: 'INR' },
      eligibilityRules: { minimumCgpa: 6.5, maximumActiveBacklogs: 2 }, allowedDepartments: [], graduationYears: [2027, 2028],
    },
  });
  const zetaDraft = await driveSvc.createDrive({
    company: zeta.company, user: zeta.owner,
    data: { ...baseDrive, jobTitle: 'Embedded Firmware Engineer', description: 'Firmware for IoT devices.', compensation: { kind: 'annual_ctc', ctc: 700000, currency: 'INR' }, eligibilityRules: { minimumCgpa: 7.5 }, allowedDepartments: ['ECE'], graduationYears: [2028] },
  });

  // TPO approval workflow: ABC + Delta approved & published, trainee drive waiting for review, Zeta's stays draft (company unverified)
  await driveSvc.submitDrive({ drive: abcDrive, user: abc.owner });
  await driveSvc.reviewDrive({ drive: abcDrive, action: 'approve', actor: tpo });
  await driveSvc.submitDrive({ drive: deltaDrive, user: delta.owner });
  await driveSvc.reviewDrive({ drive: deltaDrive, action: 'approve', actor: tpo });
  await driveSvc.submitDrive({ drive: internDrive, user: abc.owner });

  console.log('Creating applications & recruitment progress...');
  const apply = async (idx, drive) => {
    try {
      const { application } = await submitApplication({ user: students[idx].user, driveId: drive._id });
      return application;
    } catch (e) {
      console.log(`  (expected) student${idx + 1} cannot apply to "${drive.jobTitle}": ${e.code}`);
      return null;
    }
  };
  const [a1, a2, , , a5, a6, a7, a8] = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map((i) => apply(i, abcDrive)));
  void a5; void a6; // ineligible (CGPA/backlog) / pending verification -> correctly rejected by the engine
  const d3 = await apply(2, deltaDrive);
  const d10 = await apply(9, deltaDrive);
  const d1 = await apply(0, deltaDrive);
  void d3; void d10; void d1;

  const act = abc.owner;
  const rounds = await M.RecruitmentRound.find({ driveId: abcDrive._id }).sort({ sequence: 1 });
  const [aptitude, coding, tech] = rounds;
  for (const a of [a1, a2, a8, a7]) await transitionApplication(a, 'under_review', { actor: act, actorRole: 'recruiter' });
  const fresh = async (a) => M.Application.findById(a._id);
  for (const a of [a1, a2, a8]) await transitionApplication(await fresh(a), 'shortlisted', { actor: act, actorRole: 'recruiter', reason: 'Strong profile' });
  await transitionApplication(await fresh(a7), 'rejected', { actor: act, actorRole: 'recruiter', reason: 'Did not meet role requirements' });
  await recruitSvc.addParticipants({ round: coding, drive: abcDrive, applicationIds: [a1._id, a2._id, a8._id], actor: act });
  for (const [a, result, score] of [[a1, 'passed', 82], [a2, 'failed', 41], [a8, 'passed', 91]]) {
    const p = await M.RoundParticipant.findOne({ roundId: coding._id, applicationId: a._id });
    await recruitSvc.updateParticipantResult({ participant: p, drive: abcDrive, actor: act, result, score });
  }
  await transitionApplication(await fresh(a2), 'rejected', { actor: act, actorRole: 'recruiter', reason: 'Did not clear the coding assessment' });
  await recruitSvc.addParticipants({ round: tech, drive: abcDrive, applicationIds: [a1._id, a8._id], actor: act });
  for (const a of [a1, a8]) {
    await recruitSvc.scheduleInterview({ round: tech, drive: abcDrive, applicationId: a._id, actor: act, data: { startsAt: inDays(a === a1 ? 3 : -1), mode: 'online', locationOrLink: 'https://meet.example.com/abc-tech-interview', instructions: 'Keep your ID card ready.' } });
  }
  // Student 8 is selected, receives an offer and accepts it (-> "placed")
  await recruitSvc.setSelectionOutcome({ application: await fresh(a8), outcome: 'selected', reason: 'Excellent technical round', actor: act });
  let offer8 = await offerSvc.createOffer({ application: await fresh(a8), user: act, data: { compensation: { kind: 'annual_ctc', amount: 850000, currency: 'INR' }, responseDeadline: inDays(7), joiningDate: inDays(240) } });
  offer8 = await offerSvc.issueOffer({ offer: offer8, user: act });
  await offerSvc.respondToOffer({ user: students[7].user, offerId: offer8._id, decision: 'accept' });
  // Student 1 is selected and holds an issued offer, still deciding
  await recruitSvc.setSelectionOutcome({ application: await fresh(a1), outcome: 'on_hold', reason: 'Waiting for final panel', actor: act });
  await recruitSvc.setSelectionOutcome({ application: await fresh(a1), outcome: 'selected', reason: 'Selected after final round', actor: act });
  let offer1 = await offerSvc.createOffer({ application: await fresh(a1), user: act, data: { compensation: { kind: 'annual_ctc', amount: 800000, currency: 'INR' }, responseDeadline: inDays(5) } });
  offer1 = await offerSvc.issueOffer({ offer: offer1, user: act });

  await M.Ticket.create({ createdBy: students[5].user._id, createdByRole: 'student', type: 'correction_request', subject: 'CGPA mismatch', message: 'My semester-5 CGPA is 7.9 as per the mark sheet. Please verify my record.', payload: { field: 'cgpa', requestedValue: 7.9 } });
  await setPolicy({ key: 'allowedStudentEmailDomains', value: [], note: 'Seeded default', actor: admin });

  console.log('\nSeed complete.');
  console.log('  Super Admin : ' + admin.email + ' / ' + (process.env.SEED_ADMIN_PASSWORD || 'Admin@12345'));
  console.log('  TPO         : tpo@college.edu / Tpo@12345');
  console.log('  Students    : student1@college.edu ... student10@college.edu / Student@123');
  console.log('  Recruiters  : hr@abc-tech.com, recruiter2@abc-tech.com, hr@delta-analytics.com, hr@zeta-systems.com / Recruiter@123');
  await new Promise((r) => setTimeout(r, 1500)); // let fire-and-forget notifications finish before closing the connection
  await disconnectDb();
}

main().catch(async (e) => {
  console.error('Seed failed:', e);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
