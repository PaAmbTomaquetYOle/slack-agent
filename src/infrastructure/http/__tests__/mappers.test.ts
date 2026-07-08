import { describe, it, expect } from 'vitest';
import {
  mapOffboardingResponse,
  mapInterviewResponse,
  mapDossierResponse,
  mapInterviewTurnToRequest,
  mapDossierSectionToRequest,
} from '../mappers';
import type {
  BackendOffboardingResponse,
  BackendInterviewResponse,
  BackendDossierResponse,
} from '../mappers';

describe('mapOffboardingResponse', () => {
  it('maps all fields from backend response', () => {
    const data: BackendOffboardingResponse = {
      id: 'proc-1',
      employee_id: 'emp-1',
      manager_id: 'mgr-1',
      state: 'in_progress',
      interview_id: 'int-1',
      dossier_id: 'dos-1',
      created_at: '2024-01-01T00:00:00Z',
    };
    const process = mapOffboardingResponse(data);
    expect(process.id.value).toBe('proc-1');
    expect(process.departingUserId.value).toBe('emp-1');
    expect(process.initiatorId.value).toBe('mgr-1');
    expect(process.stateName).toBe('in_progress');
    expect(process.interviewId?.value).toBe('int-1');
    expect(process.dossierId?.value).toBe('dos-1');
  });

  it('handles null interview_id and dossier_id', () => {
    const data: BackendOffboardingResponse = {
      id: 'proc-2',
      employee_id: 'emp-2',
      manager_id: 'mgr-2',
      state: 'not_started',
      interview_id: null,
      dossier_id: null,
      created_at: '2024-01-01T00:00:00Z',
    };
    const process = mapOffboardingResponse(data);
    expect(process.interviewId).toBeNull();
    expect(process.dossierId).toBeNull();
  });

  it('maps all offboarding states', () => {
    const states = ['not_started', 'in_progress', 'pending_revision', 'finished', 'cancelled'];
    for (const state of states) {
      const data: BackendOffboardingResponse = {
        id: 'p', employee_id: 'e', manager_id: 'm',
        state, interview_id: null, dossier_id: null, created_at: '2024-01-01T00:00:00Z',
      };
      expect(mapOffboardingResponse(data).stateName).toBe(state);
    }
  });
});

describe('mapInterviewResponse', () => {
  it('maps interview with turns', () => {
    const data: BackendInterviewResponse = {
      id: 'int-1',
      process_id: 'proc-1',
      state: 'in_progress',
      scheduled_at: '2024-01-02T10:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
      turns: [
        {
          turn_type: 'question',
          speaker_role: 'interviewer',
          timestamp: '2024-01-02T10:05:00Z',
          content: 'What are your main responsibilities?',
          order: 0,
          topic: 'responsibilities',
          sentiment: null,
          answer_text: 'I manage the food bank schedule.',
        },
      ],
    };
    const interview = mapInterviewResponse(data);
    expect(interview.id.value).toBe('int-1');
    expect(interview.processId.value).toBe('proc-1');
    expect(interview.state).toBe('in_progress');
    expect(interview.turns).toHaveLength(1);
    expect(interview.turns[0]?.turnType).toBe('question');
    expect(interview.turns[0]?.answerText).toBe('I manage the food bank schedule.');
  });

  it('maps interview with empty turns array', () => {
    const data: BackendInterviewResponse = {
      id: 'int-2',
      process_id: 'proc-2',
      state: 'scheduled',
      scheduled_at: '2024-01-03T10:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
      turns: [],
    };
    const interview = mapInterviewResponse(data);
    expect(interview.turns).toHaveLength(0);
  });
});

describe('mapDossierResponse', () => {
  it('maps dossier with responsibilities section', () => {
    const data: BackendDossierResponse = {
      id: 'dos-1',
      process_id: 'proc-1',
      interview_id: 'int-1',
      state: 'draft',
      created_at: '2024-01-05T00:00:00Z',
      summary: 'A summary.',
      sections: [
        {
          title: 'Main Responsibilities',
          section_type: 'responsibilities',
          responsibilities: ['Manage schedule', 'Coordinate volunteers'],
          contacts: null,
          tasks: null,
          areas: null,
        },
      ],
    };
    const dossier = mapDossierResponse(data);
    expect(dossier.id.value).toBe('dos-1');
    expect(dossier.summary).toBe('A summary.');
    expect(dossier.sections).toHaveLength(1);
    expect(dossier.sections[0]?.sectionType).toBe('responsibilities');
    expect(dossier.sections[0]?.responsibilities).toEqual(['Manage schedule', 'Coordinate volunteers']);
  });

  it('maps dossier with contacts section', () => {
    const data: BackendDossierResponse = {
      id: 'dos-2',
      process_id: 'proc-1',
      interview_id: 'int-1',
      state: 'draft',
      created_at: '2024-01-05T00:00:00Z',
      summary: null,
      sections: [
        {
          title: 'Key Contacts',
          section_type: 'contacts',
          responsibilities: null,
          contacts: [{ name: 'Alice', role: 'Manager', email: 'alice@example.com', relationship: 'City hall' }],
          tasks: null,
          areas: null,
        },
      ],
    };
    const dossier = mapDossierResponse(data);
    expect(dossier.sections[0]?.contacts?.[0]?.name).toBe('Alice');
  });

  it('maps knowledge_areas section with expertiseLevel camelCase', () => {
    const data: BackendDossierResponse = {
      id: 'dos-3',
      process_id: 'proc-1',
      interview_id: 'int-1',
      state: 'draft',
      created_at: '2024-01-05T00:00:00Z',
      summary: null,
      sections: [
        {
          title: 'Knowledge',
          section_type: 'knowledge_areas',
          responsibilities: null,
          contacts: null,
          tasks: null,
          areas: [{ topic: 'Logistics', description: 'Handles logistics', expertise_level: 'expert' }],
        },
      ],
    };
    const dossier = mapDossierResponse(data);
    expect(dossier.sections[0]?.areas?.[0]?.expertiseLevel).toBe('expert');
  });
});

describe('mapInterviewTurnToRequest', () => {
  it('converts turn to snake_case request shape', () => {
    const turn = {
      turnType: 'question' as const,
      speakerRole: 'interviewer' as const,
      timestamp: new Date('2024-01-02T10:05:00Z'),
      content: 'Question?',
      order: 0,
      topic: 'topic',
      sentiment: null,
      answerText: 'Answer.',
    };
    const req = mapInterviewTurnToRequest(turn);
    expect(req.turn_type).toBe('question');
    expect(req.speaker_role).toBe('interviewer');
    expect(req.answer_text).toBe('Answer.');
    expect(req.timestamp).toBe('2024-01-02T10:05:00.000Z');
  });
});

describe('mapDossierSectionToRequest', () => {
  it('converts knowledge area expertiseLevel to expertise_level', () => {
    const section = {
      title: 'Knowledge',
      sectionType: 'knowledge_areas' as const,
      responsibilities: null,
      contacts: null,
      tasks: null,
      areas: [{ topic: 'T', description: 'D', expertiseLevel: 'expert' }],
    };
    const req = mapDossierSectionToRequest(section);
    expect(req.section_type).toBe('knowledge_areas');
    expect(req.areas?.[0]?.expertise_level).toBe('expert');
  });
});
