import { parse } from 'csv-parse/sync';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import crypto from 'node:crypto';
import { User, StudentProfile } from '../models/index.js';
import { ROLES, ACCOUNT_STATUS, PROFILE_VERIFICATION } from '../constants/index.js';
import { badRequest } from '../utils/AppError.js';
import { normalizeEmail, normalizeDept } from '../utils/helpers.js';

export const IMPORT_COLUMNS = [
  'studentId', 'rollNumber', 'name', 'email', 'department', 'degree', 'graduationYear', 'currentSemester',
  'cgpa', 'activeBacklogs', 'totalBacklogs', 'tenthPercentage', 'twelfthPercentage', 'diplomaPercentage', 'contactNumber',
];
const REQUIRED = ['studentId', 'rollNumber', 'name', 'email', 'department', 'graduationYear', 'cgpa', 'activeBacklogs'];
const MAX_ROWS = 5000;

const optNum = (min, max) =>
  z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.number().finite().min(min).max(max).optional());

const rowSchema = z.object({
  studentId: z.string().trim().min(1).max(40),
  rollNumber: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  department: z.string().trim().min(1).max(40),
  degree: z.string().trim().max(60).optional(),
  graduationYear: z.coerce.number().int().min(2000).max(2100),
  currentSemester: optNum(1, 12),
  cgpa: z.coerce.number().finite().min(0).max(10),
  activeBacklogs: z.coerce.number().int().min(0).max(100),
  totalBacklogs: optNum(0, 100),
  tenthPercentage: optNum(0, 100),
  twelfthPercentage: optNum(0, 100),
  diplomaPercentage: optNum(0, 100),
  contactNumber: z.string().trim().max(20).optional(),
});

/** CSV header aliases so exports from college ERPs work (case/space/underscore-insensitive). */
const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES = Object.fromEntries(IMPORT_COLUMNS.map((c) => [norm(c), c]));
Object.assign(ALIASES, {
  enrollmentno: 'studentId', enrolmentnumber: 'studentId', rollno: 'rollNumber', studentname: 'name', fullname: 'name',
  emailid: 'email', collegeemail: 'email', branch: 'department', dept: 'department', passoutyear: 'graduationYear',
  batch: 'graduationYear', sgpa: 'cgpa', backlogs: 'activeBacklogs', currentbacklogs: 'activeBacklogs',
  tenth: 'tenthPercentage', twelfth: 'twelfthPercentage', mobile: 'contactNumber', phone: 'contactNumber', semester: 'currentSemester',
});

/**
 * Bulk student import (spec 11.2): validate columns -> validate formats -> detect duplicates (in file and in DB)
 * -> import valid rows -> report invalid rows. `dryRun` performs every check but writes nothing (preview).
 * Imported academic values are institution data, so profiles are created/updated as VERIFIED (source: 'import').
 */
export async function importStudents({ buffer, dryRun = true, createMissing = true, actor }) {
  let records;
  try {
    records = parse(buffer, { columns: (hdr) => hdr.map((h) => ALIASES[norm(h)] || h), skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
  } catch (e) {
    throw badRequest(`Could not read the CSV file: ${e.message}`, 'CSV_PARSE_ERROR');
  }
  if (!records.length) throw badRequest('The CSV file has no data rows', 'CSV_EMPTY');
  if (records.length > MAX_ROWS) throw badRequest(`Too many rows (max ${MAX_ROWS} per import)`, 'CSV_TOO_LARGE');
  const present = new Set(Object.keys(records[0]));
  const missingCols = REQUIRED.filter((c) => !present.has(c));
  if (missingCols.length) {
    throw badRequest(`Missing required column(s): ${missingCols.join(', ')}`, 'CSV_MISSING_COLUMNS', { required: REQUIRED, optional: IMPORT_COLUMNS.filter((c) => !REQUIRED.includes(c)) });
  }

  const valid = [];
  const invalid = [];
  const seen = { email: new Map(), studentId: new Map(), rollNumber: new Map() };

  records.forEach((rec, idx) => {
    const rowNo = idx + 2; // +1 header, +1 human numbering
    const parsed = rowSchema.safeParse(rec);
    if (!parsed.success) {
      invalid.push({ row: rowNo, data: rec, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      return;
    }
    const d = parsed.data;
    d.department = normalizeDept(d.department);
    d.email = normalizeEmail(d.email);
    const errs = [];
    for (const key of ['email', 'studentId', 'rollNumber']) {
      const v = d[key].toLowerCase();
      if (seen[key].has(v)) errs.push(`Duplicate ${key} in file (also on row ${seen[key].get(v)})`);
      else seen[key].set(v, rowNo);
    }
    if (d.totalBacklogs !== undefined && d.totalBacklogs < d.activeBacklogs) errs.push('totalBacklogs cannot be less than activeBacklogs');
    if (errs.length) invalid.push({ row: rowNo, data: rec, errors: errs });
    else valid.push({ row: rowNo, d });
  });

  // DB duplicate / identity checks (batched)
  const emails = valid.map((v) => v.d.email);
  const [users, profilesByStudent, profilesByRoll] = await Promise.all([
    User.find({ email: { $in: emails } }).select('email role').lean(),
    StudentProfile.find({ studentId: { $in: valid.map((v) => v.d.studentId) } }).select('studentId rollNumber userId').lean(),
    StudentProfile.find({ rollNumber: { $in: valid.map((v) => v.d.rollNumber) } }).select('studentId rollNumber userId').lean(),
  ]);
  const userByEmail = new Map(users.map((u) => [u.email, u]));
  const profByUser = new Map((await StudentProfile.find({ userId: { $in: users.map((u) => u._id) } }).select('studentId rollNumber userId').lean()).map((p) => [String(p.userId), p]));
  const profByStudentId = new Map(profilesByStudent.map((p) => [p.studentId.toLowerCase(), p]));
  const profByRoll = new Map(profilesByRoll.map((p) => [p.rollNumber.toLowerCase(), p]));

  const plan = [];
  for (const { row, d } of valid) {
    const existingUser = userByEmail.get(d.email);
    const errs = [];
    let action;
    if (existingUser) {
      if (existingUser.role !== ROLES.STUDENT) errs.push('This e-mail belongs to a non-student account');
      const prof = profByUser.get(String(existingUser._id));
      if (!prof && !errs.length) errs.push('E-mail exists without a student profile');
      if (prof) {
        if (prof.studentId.toLowerCase() !== d.studentId.toLowerCase() || prof.rollNumber.toLowerCase() !== d.rollNumber.toLowerCase()) {
          errs.push('studentId / rollNumber differ from the existing profile for this e-mail (identity mismatch)');
        }
        action = 'update';
        d._profileId = prof._id;
        d._userId = existingUser._id;
      }
    } else {
      const clash = profByStudentId.get(d.studentId.toLowerCase()) || profByRoll.get(d.rollNumber.toLowerCase());
      if (clash) errs.push('studentId or rollNumber already belongs to a different account');
      else if (!createMissing) errs.push('Student is not registered (createMissing is off)');
      action = 'create';
    }
    if (errs.length) invalid.push({ row, data: d, errors: errs });
    else plan.push({ row, d, action });
  }

  const summary = {
    dryRun,
    totalRows: records.length,
    validRows: plan.length,
    invalidRows: invalid.length,
    toCreate: plan.filter((p) => p.action === 'create').length,
    toUpdate: plan.filter((p) => p.action === 'update').length,
    created: 0,
    updated: 0,
  };

  if (!dryRun) {
    for (const { d, action } of plan) {
      const entered = {
        cgpa: d.cgpa, activeBacklogs: d.activeBacklogs, totalBacklogs: d.totalBacklogs ?? d.activeBacklogs,
        tenthPercentage: d.tenthPercentage ?? null, twelfthPercentage: d.twelfthPercentage ?? null, diplomaPercentage: d.diplomaPercentage ?? null,
      };
      const verified = { ...entered, verifiedAt: new Date(), verifiedBy: actor._id, source: 'import' };
      try {
        if (action === 'update') {
          await StudentProfile.updateOne({ _id: d._profileId }, {
            $set: {
              department: d.department, graduationYear: d.graduationYear, ...(d.degree ? { degree: d.degree } : {}),
              ...(d.currentSemester ? { currentSemester: d.currentSemester } : {}),
              'academicSummary.entered': entered, 'academicSummary.verified': verified,
              verificationStatus: PROFILE_VERIFICATION.VERIFIED, verificationUpdatedAt: new Date(), verificationNote: 'Verified via institutional data import',
            },
          });
          summary.updated += 1;
        } else {
          const randomHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 4); // unusable until the student sets a password
          const user = await User.create({
            name: d.name, email: d.email, passwordHash: randomHash, role: ROLES.STUDENT,
            accountStatus: ACCOUNT_STATUS.PENDING_ACTIVATION,
          });
          try {
            await StudentProfile.create({
              userId: user._id, studentId: d.studentId, rollNumber: d.rollNumber, department: d.department,
              degree: d.degree || 'B.Tech', graduationYear: d.graduationYear, currentSemester: d.currentSemester,
              personal: { contactNumber: d.contactNumber },
              academicSummary: { entered, verified }, verificationStatus: PROFILE_VERIFICATION.VERIFIED,
              verificationUpdatedAt: new Date(), verificationNote: 'Verified via institutional data import',
            });
          } catch (e) {
            await User.deleteOne({ _id: user._id });
            throw e;
          }
          summary.created += 1;
        }
      } catch (e) {
        invalid.push({ row: d && plan.find((p) => p.d === d)?.row, data: d, errors: [`Write failed: ${e.message}`] });
        summary.invalidRows += 1;
      }
    }
  }
  invalid.sort((a, b) => a.row - b.row);
  return { summary, invalid: invalid.slice(0, 500), preview: plan.slice(0, 20).map((p) => ({ row: p.row, action: p.action, studentId: p.d.studentId, name: p.d.name, email: p.d.email, department: p.d.department, cgpa: p.d.cgpa })) };
}
