/**
 * Events slack-agent publishes to Kafka for the backend to consume.
 * Topics are named `slack-agent.{event_type}` (see infrastructure settings).
 *
 * Payload shapes are converged with the AsyncAPI contract vendored at
 * `docs/asyncapi/asyncapi.yml` (canonical source: `backend/docs/asyncapi/asyncapi.yml`,
 * BE-9/BE-11). See README.md "Kafka event contract" for the sync policy.
 */

export const OFFBOARDING_TRIGGERED = 'offboarding.triggered' as const;
export const INTERVIEW_STARTED = 'interview.started' as const;
export const OUTBOUND_INTERVIEW_COMPLETED = 'interview.completed' as const;
export const DOSSIER_GENERATION_REQUESTED = 'dossier.generation_requested' as const;
export const SOP_CREATION_REQUESTED = 'sop.creation_requested' as const;

export interface OffboardingTriggeredPayload {
  employee_id: string;
  manager_id: string;
  employee_name?: string;
  manager_name?: string;
}

export interface InterviewStartedPayload {
  process_id: string;
}

export interface OutboundInterviewTurnPayload {
  turn_type: string;
  speaker_role: string;
  timestamp: string;
  content: string;
  order: number;
  topic?: string;
  sentiment?: string;
  answer_text?: string;
}

export interface InterviewCompletedOutboundPayload {
  process_id: string;
  turns?: OutboundInterviewTurnPayload[];
}

export interface DossierGenerationRequestedPayload {
  process_id: string;
}

export interface SopCreationRequestedPayload {
  content: string;
  author: string;
  origin_channel: string;
  tags?: string[];
}

export type OutboundEvent =
  | { eventType: typeof OFFBOARDING_TRIGGERED; payload: OffboardingTriggeredPayload }
  | { eventType: typeof INTERVIEW_STARTED; payload: InterviewStartedPayload }
  | { eventType: typeof OUTBOUND_INTERVIEW_COMPLETED; payload: InterviewCompletedOutboundPayload }
  | { eventType: typeof DOSSIER_GENERATION_REQUESTED; payload: DossierGenerationRequestedPayload }
  | { eventType: typeof SOP_CREATION_REQUESTED; payload: SopCreationRequestedPayload };
