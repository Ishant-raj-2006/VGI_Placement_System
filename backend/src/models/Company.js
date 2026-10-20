import mongoose from 'mongoose';
import { COMPANY_STATUS, COMPANY_ROLES } from '../constants/index.js';

const { Schema } = mongoose;

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    // Case-insensitive uniqueness for company names
    nameKey: { type: String, required: true, select: false },
    website: { type: String, trim: true, maxlength: 300 },
    industry: { type: String, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 3000 },
    headquarters: { type: String, trim: true, maxlength: 200 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    contactPhone: { type: String, trim: true, maxlength: 20 },
    registrationNumber: { type: String, trim: true, maxlength: 60 }, // CIN / GST etc. supplied for verification
    verificationStatus: { type: String, enum: Object.values(COMPANY_STATUS), default: COMPANY_STATUS.PENDING },
    statusReason: { type: String, maxlength: 1000 }, // rejection / suspension reason
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
    submittedForVerificationAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
companySchema.index({ nameKey: 1 }, { unique: true });
companySchema.index({ verificationStatus: 1, createdAt: -1 });
companySchema.set('toJSON', {
  transform(_d, ret) {
    delete ret.nameKey;
    delete ret.__v;
    return ret;
  },
});

const companyUserSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    companyRole: { type: String, enum: COMPANY_ROLES, default: 'recruiter' },
    status: { type: String, enum: ['pending', 'active', 'removed'], default: 'active' },
  },
  { timestamps: true }
);
companyUserSchema.index({ companyId: 1, userId: 1 }, { unique: true });
// A recruiter account belongs to exactly one company
companyUserSchema.index({ userId: 1 }, { unique: true });
companyUserSchema.index({ companyId: 1, status: 1 });

export const Company = mongoose.model('Company', companySchema, 'companies');
export const CompanyUser = mongoose.model('CompanyUser', companyUserSchema, 'companyUsers');
