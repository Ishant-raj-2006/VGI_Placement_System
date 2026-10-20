import mongoose from 'mongoose';
import { APP_STATUS_LIST, SELECTION_OUTCOMES } from '../constants/index.js';

const { Schema } = mongoose;

const applicationSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // denormalised for notifications
    driveId: { type: Schema.Types.ObjectId, ref: 'PlacementDrive', required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true }, // denormalised for tenant scoping
    resumeId: { type: Schema.Types.ObjectId, ref: 'Resume' },
    status: { type: String, enum: APP_STATUS_LIST, default: 'applied' },
    // "On hold" / "further evaluation" are selection outcomes that do not move the application out of its stage
    selectionOutcome: { type: String, enum: [...SELECTION_OUTCOMES, null], default: null },
    // Evaluation result + rule version preserved at the time of applying
    eligibilitySnapshot: { type: Schema.Types.Mixed },
    appliedAt: { type: Date, default: Date.now },
    statusUpdatedAt: { type: Date, default: Date.now },
    statusReason: { type: String, maxlength: 1000 },
  },
  { timestamps: true }
);

// BR-05: one application per student per drive. This is the real guard against duplicates and concurrent submits.
applicationSchema.index({ studentId: 1, driveId: 1 }, { unique: true });
applicationSchema.index({ driveId: 1, status: 1 });
applicationSchema.index({ studentId: 1, appliedAt: -1 });
applicationSchema.index({ companyId: 1, status: 1 });
applicationSchema.set('toJSON', {
  transform(_d, ret) {
    delete ret.__v;
    return ret;
  },
});

const applicationEventSchema = new Schema(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    driveId: { type: Schema.Types.ObjectId, ref: 'PlacementDrive', required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' }, // null = system
    actorRole: { type: String },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, required: true },
    reason: { type: String, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
applicationEventSchema.index({ applicationId: 1, createdAt: 1 });
applicationEventSchema.index({ driveId: 1, toStatus: 1 });

export const Application = mongoose.model('Application', applicationSchema, 'applications');
export const ApplicationEvent = mongoose.model('ApplicationEvent', applicationEventSchema, 'applicationEvents');
