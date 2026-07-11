/**
 * Events slack-agent consumes from Kafka, published by the backend.
 * Topics are named `offboarding.{event_type}` (see infrastructure settings).
 */

export const OFFBOARDING_STATE_CHANGED = 'offboarding.state_changed' as const;
export const INBOUND_INTERVIEW_COMPLETED = 'interview.completed' as const;
export const DOSSIER_GENERATED = 'dossier.generated' as const;
export const OFFBOARDING_COMPLETED = 'offboarding.completed' as const;
export const SOP_CREATED = 'sop.created' as const;
// SA-20: monthly/annual review lifecycle, own event types (see BE-23).
export const MONTHLY_REVIEW_STATE_CHANGED = 'monthly_review.state_changed' as const;
export const ANNUAL_REVIEW_STATE_CHANGED = 'annual_review.state_changed' as const;

export interface OffboardingStateChangedPayload {
  process_id: string;
  previous_state: string;
  new_state: string;
  employee_id: string;
  manager_id: string;
}

export interface ReviewStateChangedPayload {
  process_id: string;
  previous_state: string;
  new_state: string;
  employee_id: string;
  manager_id: string;
}

export interface InterviewCompletedInboundPayload {
  interview_id: string;
  process_id: string;
  completed_at: string;
}

export interface DossierGeneratedPayload {
  dossier_id: string;
  process_id: string;
  interview_id: string;
}

export interface OffboardingCompletedPayload {
  process_id: string;
  employee_id: string;
  manager_id: string;
  dossier_id: string;
}

export interface SopCreatedPayload {
  sop_id: string;
  author: string;
  origin_channel: string;
  tags: string[];
  version: number;
  created_at: string;
}

export const INBOUND_EVENT_TYPES = [
  OFFBOARDING_STATE_CHANGED,
  INBOUND_INTERVIEW_COMPLETED,
  DOSSIER_GENERATED,
  OFFBOARDING_COMPLETED,
  SOP_CREATED,
  MONTHLY_REVIEW_STATE_CHANGED,
  ANNUAL_REVIEW_STATE_CHANGED,
] as const;
