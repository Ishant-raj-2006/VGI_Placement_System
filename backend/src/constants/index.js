// Central place for every enum / status / transition map used by the system.
export const MAX_GRADUATION_YEAR = new Date().getFullYear() + 4;

export const ROLES = Object.freeze({
  STUDENT: 'student',
  RECRUITER: 'recruiter',
  TPO: 'tpo',
  SUPER_ADMIN: 'super_admin',
});
export const ROLE_LIST = Object.values(ROLES);
export const ADMIN_ROLES = [ROLES.TPO, ROLES.SUPER_ADMIN];

export const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'active',
  PENDING_VERIFICATION: 'pending_verification', // e-mail not verified yet
  PENDING_ACTIVATION: 'pending_activation', // imported by TPO, password not set yet
  DEACTIVATED: 'deactivated',
});

// Academic verification of a student profile (separate from account verification)
export const PROFILE_VERIFICATION = Object.freeze({
  PENDING: 'pending_verification',
  VERIFIED: 'verified',
  CORRECTION_REQUIRED: 'correction_required',
});

export const RECORD_TYPES = ['class_10', 'class_12', 'diploma', 'semester', 'degree_completion'];
export const SCORE_SCALES = ['cgpa_10', 'cgpa_4', 'percentage'];

export const COMPANY_STATUS = Object.freeze({
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
});
export const COMPANY_ROLES = ['owner', 'hr_manager', 'recruiter'];
// Company roles allowed to do sensitive things (issue offers, manage team, edit company)
export const COMPANY_MANAGER_ROLES = ['owner', 'hr_manager'];

export const APPROVAL = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  CHANGES_REQUESTED: 'changes_requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});
export const PUBLICATION = Object.freeze({
  UNPUBLISHED: 'unpublished',
  PUBLISHED: 'published',
  PAUSED: 'paused',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
});

export const EMPLOYMENT_TYPES = ['full_time', 'internship', 'internship_with_ppo', 'graduate_trainee'];
export const WORK_MODES = ['onsite', 'remote', 'hybrid'];
export const COMPENSATION_KINDS = ['annual_ctc', 'monthly_stipend'];
export const COMPENSATION_UNIT_BY_KIND = { annual_ctc: 'annual', monthly_stipend: 'monthly' };

export const APP_STATUS = Object.freeze({
  APPLIED: 'applied',
  UNDER_REVIEW: 'under_review',
  SHORTLISTED: 'shortlisted',
  ASSESSMENT: 'assessment',
  INTERVIEW: 'interview',
  SELECTED: 'selected',
  OFFERED: 'offered',
  OFFER_ACCEPTED: 'offer_accepted',
  OFFER_DECLINED: 'offer_declined',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
});
export const APP_STATUS_LIST = Object.values(APP_STATUS);

// Allowed transitions (BR-07). Anything not listed here is rejected server-side.
export const APP_TRANSITIONS = Object.freeze({
  applied: ['under_review', 'shortlisted', 'rejected', 'withdrawn'],
  under_review: ['shortlisted', 'rejected', 'withdrawn'],
  shortlisted: ['assessment', 'interview', 'selected', 'rejected', 'withdrawn'],
  assessment: ['interview', 'selected', 'rejected', 'withdrawn'],
  interview: ['assessment', 'selected', 'rejected', 'withdrawn'],
  selected: ['offered', 'rejected', 'withdrawn'],
  offered: ['offer_accepted', 'offer_declined', 'selected', 'withdrawn'],
  offer_accepted: ['selected'], // only when an accepted offer is withdrawn where policy permits
  offer_declined: [],
  rejected: [],
  withdrawn: ['applied'], // re-apply, only if the policy allows it
});

// Which actor may set which target status (server-side enforcement; students can never set "selected")
export const STATUS_SETTERS = Object.freeze({
  under_review: ['recruiter', 'tpo', 'super_admin'],
  shortlisted: ['recruiter'],
  assessment: ['recruiter', 'system'],
  interview: ['recruiter', 'system'],
  selected: ['recruiter', 'system'], // system: an offer expired / was withdrawn, application returns to "selected"
  offered: ['system'], // only via the offer service
  offer_accepted: ['system'], // only via student offer response
  offer_declined: ['system'],
  rejected: ['recruiter', 'tpo', 'super_admin'],
  withdrawn: ['student', 'tpo', 'super_admin'],
  applied: ['system'],
});

export const ELIGIBILITY = Object.freeze({
  ELIGIBLE: 'eligible',
  INELIGIBLE: 'ineligible',
  PENDING: 'pending_verification',
});

export const ROUND_TYPES = ['aptitude', 'coding', 'technical_interview', 'hr_interview', 'group_discussion', 'other'];
export const INTERVIEW_ROUND_TYPES = ['technical_interview', 'hr_interview', 'group_discussion'];
export const ASSESSMENT_ROUND_TYPES = ['aptitude', 'coding'];
export const ROUND_STATUS = ['planned', 'scheduled', 'in_progress', 'completed', 'cancelled'];
export const PARTICIPANT_RESULT = ['pending', 'passed', 'failed', 'on_hold', 'absent'];
export const INTERVIEW_MODES = ['online', 'offline', 'hybrid'];
export const INTERVIEW_STATUS = ['scheduled', 'rescheduled', 'completed', 'cancelled', 'no_show'];

export const SELECTION_OUTCOMES = ['selected', 'not_selected', 'on_hold', 'further_evaluation'];

export const OFFER_STATUS = Object.freeze({
  DRAFT: 'draft',
  ISSUED: 'issued',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  EXPIRED: 'expired',
  WITHDRAWN: 'withdrawn',
});

export const NOTIFICATION_TYPES = [
  'drive_published',
  'application_submitted',
  'application_received',
  'application_shortlisted',
  'application_status',
  'assessment_scheduled',
  'interview_scheduled',
  'interview_rescheduled',
  'result_updated',
  'offer_issued',
  'offer_deadline',
  'offer_response',
  'offer_withdrawn',
  'company_verification',
  'drive_review',
  'drive_changed',
  'recruitment_change',
  'profile_verification',
  'ticket_update',
  'system',
];

export const TICKET_TYPES = ['complaint', 'correction_request', 'support', 'contact'];
export const TICKET_STATUS = ['open', 'in_progress', 'resolved', 'rejected'];

// Policy keys and defaults. Every value is editable by TPO / Super Admin with effective dates + history.
export const POLICY_DEFAULTS = Object.freeze({
  // placement policies (TPO)
  offerPolicy: 'multiple_offers_one_accept', // single_offer | multiple_offers_one_accept | multiple_accept
  blockApplicationsAfterAccept: false,
  allowWithdrawal: true,
  withdrawalDeadlineHoursBeforeApplicationClose: 0, // 0 = until the application deadline passes; also blocked once shortlisted
  allowReapplyAfterWithdraw: false,
  requireDriveApproval: true,
  autoPublishOnApproval: true,
  requireReapprovalOnPublishedEdit: false,
  allowApplyWhenPendingVerification: false,
  requireResumeForApplication: true,
  requireAcademicVerification: true,
  maxActiveBacklogsGlobal: null, // college-wide cap; null = none
  suspendedCompanyDrivePolicy: 'pause', // pause | review
  profileRequiredSections: ['personal', 'academic', 'skills', 'projects', 'resume'],
  departments: [], // empty = free text (normalised to upper case)
  offerExpiryReminderHours: 24,
  // system / authentication settings (Super Admin)
  requireEmailVerification: false,
  allowedStudentEmailDomains: [],
  sessionTtlHours: null, // null -> SESSION_TTL_HOURS env
  maxLoginAttempts: null,
  lockoutMinutes: null,
  maintenanceMode: false,
});

export const POLICY_CATEGORY = Object.freeze({
  offerPolicy: 'placement',
  blockApplicationsAfterAccept: 'placement',
  allowWithdrawal: 'placement',
  withdrawalDeadlineHoursBeforeApplicationClose: 'placement',
  allowReapplyAfterWithdraw: 'placement',
  requireDriveApproval: 'placement',
  autoPublishOnApproval: 'placement',
  requireReapprovalOnPublishedEdit: 'placement',
  allowApplyWhenPendingVerification: 'placement',
  requireResumeForApplication: 'placement',
  requireAcademicVerification: 'placement',
  maxActiveBacklogsGlobal: 'placement',
  suspendedCompanyDrivePolicy: 'placement',
  profileRequiredSections: 'placement',
  departments: 'placement',
  offerExpiryReminderHours: 'placement',
  requireEmailVerification: 'system',
  allowedStudentEmailDomains: 'system',
  sessionTtlHours: 'system',
  maxLoginAttempts: 'system',
  lockoutMinutes: 'system',
  maintenanceMode: 'system',
});

export const OFFER_POLICY_VALUES = ['single_offer', 'multiple_offers_one_accept', 'multiple_accept'];

// Statuses at/after which a candidate has "reached" a funnel stage
export const FUNNEL_STAGES = ['applied', 'shortlisted', 'assessment', 'interview', 'selected', 'offered', 'offer_accepted'];
