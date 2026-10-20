import mongoose from 'mongoose';
import { RECORD_TYPES, SCORE_SCALES, PROFILE_VERIFICATION } from '../constants/index.js';

const { Schema } = mongoose;

// ---------- academicRecords ----------
const academicRecordSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    recordType: { type: String, enum: RECORD_TYPES, required: true },
    semester: { type: Number, min: 1, max: 12 },
    score: { type: Number, required: true, min: 0 },
    // A bare number is ambiguous (8.2 CGPA vs 82%), so the scale is always stored with the score.
    scoreScale: { type: String, enum: SCORE_SCALES, required: true },
    institution: { type: String, trim: true, maxlength: 200 },
    board: { type: String, trim: true, maxlength: 120 },
    yearOfPassing: { type: Number, min: 1990, max: 2100 },
    verificationStatus: { type: String, enum: Object.values(PROFILE_VERIFICATION), default: PROFILE_VERIFICATION.PENDING },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
    note: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);
academicRecordSchema.index({ studentId: 1, recordType: 1, semester: 1 });

// ---------- studentProjects ----------
const studentProjectSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 3000 },
    technologies: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
    projectUrl: { type: String, trim: true, maxlength: 500 },
    repositoryUrl: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);
studentProjectSchema.index({ studentId: 1, createdAt: -1 });

// ---------- resumes (metadata only; file bytes live in private storage) ----------
const resumeSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    storageKey: { type: String, required: true, select: false },
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
resumeSchema.index({ studentId: 1, isActive: 1, uploadedAt: -1 });
resumeSchema.set('toJSON', {
  transform(_d, ret) {
    delete ret.storageKey;
    delete ret.__v;
    return ret;
  },
});

export const AcademicRecord = mongoose.model('AcademicRecord', academicRecordSchema, 'academicRecords');
export const StudentProject = mongoose.model('StudentProject', studentProjectSchema, 'studentProjects');
export const Resume = mongoose.model('Resume', resumeSchema, 'resumes');
