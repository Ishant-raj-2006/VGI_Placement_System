import mongoose from 'mongoose';
import { PROFILE_VERIFICATION } from '../constants/index.js';

const academicValues = {
  cgpa: { type: Number, min: 0, max: 10, default: null },
  activeBacklogs: { type: Number, min: 0, max: 100, default: null },
  totalBacklogs: { type: Number, min: 0, max: 100, default: null },
  tenthPercentage: { type: Number, min: 0, max: 100, default: null },
  twelfthPercentage: { type: Number, min: 0, max: 100, default: null },
  diplomaPercentage: { type: Number, min: 0, max: 100, default: null },
};

const experienceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['internship', 'certification', 'achievement', 'experience'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    organization: { type: String, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000 },
    startDate: Date,
    endDate: Date,
    url: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

const studentProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentId: { type: String, required: true, trim: true, maxlength: 40 },
    rollNumber: { type: String, required: true, trim: true, maxlength: 40 },
    collegeName: { type: String, trim: true, maxlength: 200 },
    degree: { type: String, trim: true, maxlength: 60 },
    department: { type: String, trim: true, uppercase: true, maxlength: 40 },
    currentSemester: { type: Number, min: 1, max: 12 },
    graduationYear: { type: Number, min: 2000, max: 2100 },
    personal: {
      contactNumber: { type: String, trim: true, maxlength: 20 },
      dateOfBirth: Date,
      address: { type: String, trim: true, maxlength: 500 },
      photoStorageKey: { type: String, select: false },
      photoMimeType: String,
    },
    // Student-entered values are NEVER treated as verified (BR-06). The institution-verified copy lives in `verified`.
    academicSummary: {
      entered: academicValues,
      verified: {
        ...academicValues,
        verifiedAt: Date,
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        source: { type: String, enum: ['tpo', 'import'] },
      },
    },
    skills: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
    interests: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
    experiences: { type: [experienceSchema], default: [] },
    verificationStatus: {
      type: String,
      enum: Object.values(PROFILE_VERIFICATION),
      default: PROFILE_VERIFICATION.PENDING,
    },
    verificationNote: { type: String, maxlength: 1000 },
    verificationUpdatedAt: Date,
  },
  { timestamps: true }
);

studentProfileSchema.index({ userId: 1 }, { unique: true });
studentProfileSchema.index({ studentId: 1 }, { unique: true });
studentProfileSchema.index({ rollNumber: 1 }, { unique: true });
studentProfileSchema.index({ department: 1, graduationYear: 1 });
studentProfileSchema.index({ verificationStatus: 1 });

studentProfileSchema.set('toJSON', {
  transform(_doc, ret) {
    if (ret.personal) delete ret.personal.photoStorageKey;
    delete ret.__v;
    return ret;
  },
});

export const StudentProfile = mongoose.model('StudentProfile', studentProfileSchema, 'studentProfiles');
