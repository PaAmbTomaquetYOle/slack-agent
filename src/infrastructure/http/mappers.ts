import { OffboardingProcess, ProcessId, UserId, InterviewId, DossierId, Task } from '../../domain';
import type { Interview, InterviewTurn, Dossier, DossierSection, Contact, PendingTask, KnowledgeArea, TaskSource } from '../../domain';
import type { PendingSopCandidate } from '../../application/ports';

// ─── Backend response shapes (snake_case) ────────────────────────────────────

export interface BackendOffboardingResponse {
  id: string;
  employee_id: string;
  manager_id: string;
  state: string;
  interview_id: string | null;
  dossier_id: string | null;
  created_at: string;
}

export interface BackendOffboardingListResponse {
  items: BackendOffboardingResponse[];
  count: number;
}

export interface BackendInterviewTurnResponse {
  turn_type: 'question' | 'note';
  speaker_role: 'interviewer' | 'interviewee';
  timestamp: string;
  content: string;
  order: number;
  topic: string | null;
  sentiment: string | null;
  answer_text: string | null;
}

export interface BackendInterviewResponse {
  id: string;
  process_id: string;
  state: string;
  scheduled_at: string;
  created_at: string;
  turns: BackendInterviewTurnResponse[];
}

export interface BackendDossierSectionResponse {
  title: string;
  section_type: 'responsibilities' | 'contacts' | 'pending_tasks' | 'knowledge_areas';
  responsibilities: string[] | null;
  contacts: Array<{ name: string; role: string; email: string; relationship: string }> | null;
  tasks: Array<{ description: string; priority: string; deadline: string | null }> | null;
  areas: Array<{ topic: string; description: string; expertise_level: string }> | null;
}

export interface BackendDossierResponse {
  id: string;
  process_id: string;
  interview_id: string;
  state: string;
  created_at: string;
  summary: string | null;
  sections: BackendDossierSectionResponse[];
}

export interface BackendSopCandidateResponse {
  id: string;
  channel_id: string;
  author_id: string;
  message_ts: string;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface BackendSopCandidateListResponse {
  items: BackendSopCandidateResponse[];
}

export interface BackendTaskResponse {
  id: string;
  title: string;
  source: TaskSource;
  status: string;
  url: string | null;
  description: string | null;
}

export interface BackendTaskListResponse {
  items: BackendTaskResponse[];
}

// ─── Response mappers ─────────────────────────────────────────────────────────

export function mapOffboardingResponse(data: BackendOffboardingResponse): OffboardingProcess {
  return OffboardingProcess.fromBackend({
    id: new ProcessId(data.id),
    departingUserId: new UserId(data.employee_id),
    initiatorId: new UserId(data.manager_id),
    createdAt: new Date(data.created_at),
    state: data.state,
    interviewId: data.interview_id ? new InterviewId(data.interview_id) : null,
    dossierId: data.dossier_id ? new DossierId(data.dossier_id) : null,
  });
}

function mapInterviewTurnResponse(data: BackendInterviewTurnResponse): InterviewTurn {
  return {
    turnType: data.turn_type,
    speakerRole: data.speaker_role,
    timestamp: new Date(data.timestamp),
    content: data.content,
    order: data.order,
    topic: data.topic,
    sentiment: data.sentiment,
    answerText: data.answer_text,
  };
}

export function mapInterviewResponse(data: BackendInterviewResponse): Interview {
  return {
    id: new InterviewId(data.id),
    processId: new ProcessId(data.process_id),
    state: data.state,
    scheduledAt: new Date(data.scheduled_at),
    createdAt: new Date(data.created_at),
    turns: data.turns.map(mapInterviewTurnResponse),
  };
}

function mapDossierSectionResponse(data: BackendDossierSectionResponse): DossierSection {
  const contacts: readonly Contact[] | null = data.contacts
    ? data.contacts.map(c => ({ name: c.name, role: c.role, email: c.email, relationship: c.relationship }))
    : null;
  const tasks: readonly PendingTask[] | null = data.tasks
    ? data.tasks.map(t => ({ description: t.description, priority: t.priority, deadline: t.deadline }))
    : null;
  const areas: readonly KnowledgeArea[] | null = data.areas
    ? data.areas.map(a => ({ topic: a.topic, description: a.description, expertiseLevel: a.expertise_level }))
    : null;
  return {
    title: data.title,
    sectionType: data.section_type,
    responsibilities: data.responsibilities,
    contacts,
    tasks,
    areas,
  };
}

export function mapSopCandidateResponse(data: BackendSopCandidateResponse): PendingSopCandidate {
  return {
    channelId: data.channel_id,
    authorId: data.author_id,
    content: data.content,
    messageTs: data.message_ts,
  };
}

export function mapTaskResponse(data: BackendTaskResponse): Task {
  return new Task(data.id, data.title, data.source, data.status, data.url, data.description);
}

export function mapDossierResponse(data: BackendDossierResponse): Dossier {
  return {
    id: new DossierId(data.id),
    processId: new ProcessId(data.process_id),
    interviewId: new InterviewId(data.interview_id),
    state: data.state,
    createdAt: new Date(data.created_at),
    summary: data.summary,
    sections: data.sections.map(mapDossierSectionResponse),
  };
}
