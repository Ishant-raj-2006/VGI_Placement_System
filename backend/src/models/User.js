import mongoose from 'mongoose';
import { ROLE_LIST, ACCOUNT_STATUS } from '../constants/index.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLE_LIST, required: true },
    accountStatus: { type: String, enum: Object.values(ACCOUNT_STATUS), default: ACCOUNT_STATUS.ACTIVE },
    emailVerifiedAt: { type: Date, default: null },
    mustChangePassword: { type: Boolean, default: false },
    mustCompleteProfile: { type: Boolean, default: false },
    facultyProvisioned: { type: Boolean, default: false },
    failedLoginCount: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    notificationPrefs: {
      email: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

// BR-01: e-mail unique after normalisation (lower-cased + trimmed by the setters above)
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, accountStatus: 1 });

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.failedLoginCount;
    delete ret.lockedUntil;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema, 'users');
