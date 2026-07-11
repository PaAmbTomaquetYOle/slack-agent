/**
 * Events slack-agent publishes to Kafka for the backend to consume.
 * Topics are named `slack-agent.{event_type}` (see infrastructure settings).
 *
 * Payload shapes are converged with the AsyncAPI contract vendored at
 * `docs/asyncapi/asyncapi.yml` (canonical source: `backend/docs/asyncapi/asyncapi.yml`,
 * BE-9/BE-11). See README.md "Kafka event contract" for the sync policy.
 */

export const OFFBOARDING_TRIGGERED = 'offboarding.triggered' as const;
export const OFFBOARDING_CANCELLATION_REQUESTED = 'offboarding.cancellation_requested' as const;
export const INTERVIEW_STARTED = 'interview.started' as const;
export const OUTBOUND_INTERVIEW_COMPLETED = 'interview.completed' as const;
export const INTERVIEW_TURN_RECORDED = 'interview.turn_recorded' as const;
export const TASKS_EXTRACTED = 'tasks.extracted' as const;
export const DOSSIER_GENERATION_REQUESTED = 'dossier.generation_requested' as const;
export const SOP_CREATION_REQUESTED = 'sop.creation_requested' as const;
export const SOP_CANDIDATE_OFFERED = 'sop.candidate_offered' as const;
export const SOP_CANDIDATE_DECIDED = 'sop.candidate_decided' as const;
export const KNOWLEDGE_GRAPH_INTERACTION_REGISTERED = 'knowledge_graph.interaction_registered' as const;
export const KNOWLEDGE_GRAPH_DOCUMENT_REGISTERED = 'knowledge_graph.document_registered' as const;
export const KNOWLEDGE_GRAPH_CHANNEL_ACTIVITY_REGISTERED = 'knowledge_graph.channel_activity_registered' as const;

export interface OffboardingTriggeredPayload {
  employee_id: string;
  manager_id: string;
  employee_name?: string;
  manager_name?: string;
}

export interface OffboardingCancellationRequestedPayload {
  process_id: string;
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

export interface InterviewTurnRecordedPayload {
  process_id: string;
  turns: OutboundInterviewTurnPayload[];
}

export interface OutboundTaskPayload {
  id: string;
  title: string;
  source: string;
  status: string;
  url?: string;
  description?: string;
}

export interface TasksExtractedPayload {
  process_id: string;
  tasks: OutboundTaskPayload[];
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

export interface SopCandidateOfferedPayload {
  channel_id: string;
  author_id: string;
  message_ts: string;
  content: string;
}

export interface SopCandidateDecidedPayload {
  channel_id: string;
  message_ts: string;
  accepted: boolean;
}

export interface KnowledgeGraphInteractionRegisteredPayload {
  person_id: string;
  person_name: string;
  topic_name: string;
  interaction_type: string;
  department?: string;
  topic_description?: string;
}

export interface KnowledgeGraphDocumentRegisteredPayload {
  document_id: string;
  title: string;
  author_id: string;
  author_name: string;
  topics: string[];
  url?: string;
  source?: string;
}

export interface KnowledgeGraphChannelActivityRegisteredPayload {
  person_id: string;
  person_name: string;
  channel_id: string;
  channel_name: string;
}

export type OutboundEvent =
  | { eventType: typeof OFFBOARDING_TRIGGERED; payload: OffboardingTriggeredPayload }
  | { eventType: typeof OFFBOARDING_CANCELLATION_REQUESTED; payload: OffboardingCancellationRequestedPayload }
  | { eventType: typeof INTERVIEW_STARTED; payload: InterviewStartedPayload }
  | { eventType: typeof OUTBOUND_INTERVIEW_COMPLETED; payload: InterviewCompletedOutboundPayload }
  | { eventType: typeof INTERVIEW_TURN_RECORDED; payload: InterviewTurnRecordedPayload }
  | { eventType: typeof TASKS_EXTRACTED; payload: TasksExtractedPayload }
  | { eventType: typeof DOSSIER_GENERATION_REQUESTED; payload: DossierGenerationRequestedPayload }
  | { eventType: typeof SOP_CREATION_REQUESTED; payload: SopCreationRequestedPayload }
  | { eventType: typeof SOP_CANDIDATE_OFFERED; payload: SopCandidateOfferedPayload }
  | { eventType: typeof SOP_CANDIDATE_DECIDED; payload: SopCandidateDecidedPayload }
  | {
      eventType: typeof KNOWLEDGE_GRAPH_INTERACTION_REGISTERED;
      payload: KnowledgeGraphInteractionRegisteredPayload;
    }
  | { eventType: typeof KNOWLEDGE_GRAPH_DOCUMENT_REGISTERED; payload: KnowledgeGraphDocumentRegisteredPayload }
  | {
      eventType: typeof KNOWLEDGE_GRAPH_CHANNEL_ACTIVITY_REGISTERED;
      payload: KnowledgeGraphChannelActivityRegisteredPayload;
    };
