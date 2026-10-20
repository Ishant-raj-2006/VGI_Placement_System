import mongoose from 'mongoose';
import {
  APPROVAL,
  PUBLICATION,
  EMPLOYMENT_TYPES,
  WORK_MODES,
  COMPENSATION_KINDS,
  ROUND_TYPES,
} from '../constants/index.js';

const { Schema } = mongoose;

const compensationSchema = new Schema(
  {
    // kind makes the unit explicit: "₹6 LPA" (annual_ctc) and "₹50,000 / month" (monthly_stipend) are never mixed.
    kind: { type: String, enum: COMPENSATION_KINDS, required: true },
    currency: { type: String, default: 'INR', uppercase: true, maxlength: 3 },
    unit: { type: String, enum: ['annual', 'monthly'], required: true },
    min: { type: Number, min: 0 },
    max: { type: Number, min: 0 },
    ctc: { type: Number, min: 0 }, // for annual_ctc: advertised CTC
    stipend: { type: Number, min: 0 }, // for monthly_stipend (or internship stipend in a PPO drive)
    notes: { type: String, maxlength: 500 },
  },
  { _id: false }
);

// Numeric / structured rules live in a bounded embedded object (small, read together with the drive).
const eligibilityRulesSchema = new Schema(
  {
    degrees: { type: [String], default: [] },
    minimumCgpa: { type: Number, min: 0, max: 10 },
    minimumTenthPercentage: { type: Number, min: 0, max: 100 },
    minimumTwelfthPercentage: { type: Number, min: 0, max: 100 }, // applies to 12th OR diploma percentage
    maximumActiveBacklogs: { type: Number, min: 0 },
    maximumTotalBacklogs: { type: Number, min: 0 },
    additionalRequirements: { type: String, maxlength: 2000 }, // informational, human-checked
  },
  { _id: false }
);

const plannedRoundSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: ROUND_TYPES, default: 'other' },
    isOptional: { type: Boolean, default: false },
  },
  { _id: false }
);

const driveSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    jobTitle: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 10000 },
    responsibilities: { type: String, trim: true, maxlength: 5000 },
    qualifications: { type: String, trim: true, maxlength: 5000 },
    requiredSkills: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: true },
    workMode: { type: String, enum: WORK_MODES, default: 'onsite' },
    locations: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
    vacancies: { type: Number, min: 1 },
    compensation: { type: compensationSchema, required: true },

    eligibilityRules: { type: eligibilityRulesSchema, default: () => ({}) },
    allowedDepartments: { type: [{ type: String, uppercase: true, trim: true }], default: [] }, // empty = all
    graduationYears: { type: [Number], default: [] }, // empty = all
    rulesVersion: { type: Number, default: 1 },

    applicationOpensAt: { type: Date, required: true },
    applicationDeadline: { type: Date, required: true },
    driveStartDate: Date,
    recruitmentSchedule: { type: [{ label: String, date: Date }], default: [] },
    selectionProcess: { type: [plannedRoundSchema], default: [] },

    approvalStatus: { type: String, enum: Object.values(APPROVAL), default: APPROVAL.DRAFT },
    publicationStatus: { type: String, enum: Object.values(PUBLICATION), default: PUBLICATION.UNPUBLISHED },
    statusReason: { type: String, maxlength: 1000 }, // rejection / change-request / pause / cancel reason
    submittedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    publishedAt: Date,
    announcedAt: Date, // when students were first notified (avoids re-announcing on pause/resume)
    closedAt: Date,
  },
  { timestamps: true }
);

driveSchema.index({ publicationStatus: 1, applicationDeadline: 1 });
driveSchema.index({ companyId: 1, createdAt: -1 });
driveSchema.index({ approvalStatus: 1, submittedAt: 1 });
driveSchema.index({ allowedDepartments: 1 });
driveSchema.index({ graduationYears: 1 });
driveSchema.set('toJSON', {
  transform(_d, ret) {
    delete ret.__v;
    return ret;
  },
});

// History of eligibility rules / dates (rules are never silently overwritten)
const driveRuleVersionSchema = new Schema(
  {
    driveId: { type: Schema.Types.ObjectId, ref: 'PlacementDrive', required: true },
    version: { type: Number, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changeSummary: { type: String, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
driveRuleVersionSchema.index({ driveId: 1, version: 1 }, { unique: true });

export const PlacementDrive = mongoose.model('PlacementDrive', driveSchema, 'placementDrives');
export const DriveRuleVersion = mongoose.model('DriveRuleVersion', driveRuleVersionSchema, 'driveRuleVersions');
