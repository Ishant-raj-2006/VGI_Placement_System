import mongoose from 'mongoose';
import { ROUND_TYPES, ROUND_STATUS, PARTICIPANT_RESULT, INTERVIEW_MODES, INTERVIEW_STATUS, OFFER_STATUS, COMPENSATION_KINDS } from '../constants/index.js';

const { Schema } = mongoose;

// ---------- recruitmentRounds ----------
const roundSchema = new Schema(
  {
    driveId: { type: Schema.Types.ObjectId, ref: 'PlacementDrive', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: ROUND_TYPES, default: 'other' },
    sequence: { type: Number, required: true, min: 1 },
    isOptional: { type: Boolean, default: false },
    schedule: {
      startsAt: Date,
      endsAt: Date,
      timezone: { type: String, default: 'Asia/Kolkata' },
      mode: { type: String, enum: INTERVIEW_MODES },
      locationOrLink: { type: String, maxlength: 500 },
    },
    instructions: { type: String, maxlength: 3000 },
    status: { type: String, enum: ROUND_STATUS, default: 'planned' },
  },
  { timestamps: true }
);
roundSchema.index({ driveId: 1, sequence: 1 });

// ---------- roundParticipants ----------
const participantSchema = new Schema(
  {
    roundId: { type: Schema.Types.ObjectId, ref: 'RecruitmentRound', required: true },
    driveId: { type: Schema.Types.ObjectId, ref: 'PlacementDrive', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    result: { type: String, enum: PARTICIPANT_RESULT, default: 'pending' },
    score: { type: Number },
    remarks: { type: String, maxlength: 2000 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
participantSchema.index({ roundId: 1, applicationId: 1 }, { unique: true });
participantSchema.index({ applicationId: 1 });
participantSchema.index({ driveId: 1, result: 1 });

// ---------- interviews ----------
const interviewSchema = new Schema(
  {
    roundId: { type: Schema.Types.ObjectId, ref: 'RecruitmentRound', required: true },
    driveId: { type: Schema.Types.ObjectId, ref: 'PlacementDrive', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    startsAt: { type: Date, required: true },
    endsAt: Date,
    timezone: { type: String, default: 'Asia/Kolkata' },
    mode: { type: String, enum: INTERVIEW_MODES, required: true },
    locationOrLink: { type: String, maxlength: 500 },
    instructions: { type: String, maxlength: 3000 },
    status: { type: String, enum: INTERVIEW_STATUS, default: 'scheduled' },
    // Reschedule history (bounded: each interview is rescheduled only a handful of times)
    history: {
      type: [
        new Schema(
          {
            startsAt: Date,
            endsAt: Date,
            mode: String,
            locationOrLink: String,
            changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
            changedAt: { type: Date, default: Date.now },
            reason: String,
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);
interviewSchema.index({ roundId: 1, applicationId: 1 }, { unique: true });
interviewSchema.index({ applicationId: 1, startsAt: 1 });
interviewSchema.index({ driveId: 1, startsAt: 1 });

// ---------- offers ----------
const offerSchema = new Schema(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    driveId: { type: Schema.Types.ObjectId, ref: 'PlacementDrive', required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    version: { type: Number, default: 1, min: 1 },
    isCurrent: { type: Boolean, default: true }, // false once superseded by a revised offer
    jobTitle: { type: String, required: true, maxlength: 160 },
    compensation: {
      kind: { type: String, enum: COMPENSATION_KINDS, required: true },
      amount: { type: Number, required: true, min: 0 },
      currency: { type: String, default: 'INR', uppercase: true, maxlength: 3 },
      unit: { type: String, enum: ['annual', 'monthly'], required: true },
      notes: { type: String, maxlength: 500 },
    },
    issuedAt: Date,
    responseDeadline: { type: Date, required: true },
    joiningDate: Date,
    documentStorageKey: { type: String }, // stripped by toJSON; never returned to clients
    documentOriginalName: String,
    status: { type: String, enum: Object.values(OFFER_STATUS), default: OFFER_STATUS.DRAFT },
    respondedAt: Date,
    statusReason: { type: String, maxlength: 1000 },
    reminderSentAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
offerSchema.index({ applicationId: 1, version: 1 }, { unique: true });
offerSchema.index({ studentId: 1, status: 1 });
offerSchema.index({ companyId: 1, status: 1 });
offerSchema.index({ driveId: 1, status: 1 });
offerSchema.index({ status: 1, responseDeadline: 1 });
offerSchema.set('toJSON', {
  transform(_d, ret) {
    delete ret.documentStorageKey;
    delete ret.__v;
    return ret;
  },
});

export const RecruitmentRound = mongoose.model('RecruitmentRound', roundSchema, 'recruitmentRounds');
export const RoundParticipant = mongoose.model('RoundParticipant', participantSchema, 'roundParticipants');
export const Interview = mongoose.model('Interview', interviewSchema, 'interviews');
export const Offer = mongoose.model('Offer', offerSchema, 'offers');
