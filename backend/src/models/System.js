import mongoose from 'mongoose';
import { NOTIFICATION_TYPES, TICKET_TYPES, TICKET_STATUS, ROLE_LIST } from '../constants/index.js';

const { Schema } = mongoose;

// ---------- notifications ----------
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 2000 },
    relatedEntity: {
      kind: { type: String, enum: ['drive', 'application', 'offer', 'interview', 'company', 'ticket', 'profile'] },
      id: Schema.Types.ObjectId,
    },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });

// ---------- emailLogs (durable queue + delivery log; failures never roll back business transactions) ----------
const emailLogSchema = new Schema(
  {
    notificationId: { type: Schema.Types.ObjectId, ref: 'Notification' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    recipient: { type: String, required: true },
    subject: { type: String, required: true, maxlength: 300 },
    body: { type: String, required: true, select: false },
    providerStatus: { type: String, enum: ['queued', 'sent', 'failed', 'retrying'], default: 'queued' },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: Date,
    nextAttemptAt: { type: Date, default: Date.now },
    lastError: { type: String, maxlength: 500 },
    sensitive: { type: Boolean, default: false }, // password reset links etc.: body wiped after sending
  },
  { timestamps: true }
);
emailLogSchema.index({ providerStatus: 1, nextAttemptAt: 1 });
emailLogSchema.index({ notificationId: 1 });

// ---------- auditLogs (append-only) ----------
const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorRole: { type: String },
    action: { type: String, required: true, maxlength: 100 },
    entityType: { type: String, required: true, maxlength: 60 },
    entityId: { type: Schema.Types.ObjectId },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// ---------- sessions (server-side revocable login sessions) ----------
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    jti: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, maxlength: 300 },
    ip: { type: String, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
sessionSchema.index({ jti: 1 }, { unique: true });
sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ expiresAt: 1 });

// ---------- one-time tokens (e-mail verification, password reset) ----------
const tokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['email_verify', 'password_reset'], required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
tokenSchema.index({ tokenHash: 1 }, { unique: true });
tokenSchema.index({ userId: 1, type: 1 });
tokenSchema.index({ expiresAt: 1 });

// ---------- policies (versioned, effective-dated placement + system settings) ----------
const policySchema = new Schema(
  {
    key: { type: String, required: true },
    category: { type: String, enum: ['placement', 'system'], required: true },
    value: { type: Schema.Types.Mixed },
    effectiveFrom: { type: Date, default: Date.now },
    note: { type: String, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
policySchema.index({ key: 1, effectiveFrom: -1 });

// ---------- tickets (complaints, correction requests, support/contact) ----------
const ticketSchema = new Schema(
  {
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, // null for public contact form
    createdByRole: { type: String, enum: [...ROLE_LIST, 'public'] },
    contactName: String,
    contactEmail: String,
    type: { type: String, enum: TICKET_TYPES, required: true },
    subject: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 5000 },
    relatedEntity: { kind: String, id: Schema.Types.ObjectId },
    payload: { type: Schema.Types.Mixed }, // e.g. { field: 'cgpa', requestedValue: 8.1 }
    status: { type: String, enum: TICKET_STATUS, default: 'open' },
    responses: {
      type: [
        new Schema(
          {
            by: { type: Schema.Types.ObjectId, ref: 'User' },
            message: { type: String, maxlength: 3000 },
            at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
  },
  { timestamps: true }
);
ticketSchema.index({ status: 1, createdAt: -1 });
ticketSchema.index({ createdBy: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema, 'notifications');
export const EmailLog = mongoose.model('EmailLog', emailLogSchema, 'emailLogs');
export const AuditLog = mongoose.model('AuditLog', auditLogSchema, 'auditLogs');
export const Session = mongoose.model('Session', sessionSchema, 'sessions');
export const Token = mongoose.model('Token', tokenSchema, 'tokens');
export const Policy = mongoose.model('Policy', policySchema, 'policies');
export const Ticket = mongoose.model('Ticket', ticketSchema, 'tickets');
