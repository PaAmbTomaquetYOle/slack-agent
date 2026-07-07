import { describe, it, expect, vi } from 'vitest';
import { createDossierGenerationTriggerHandler } from '../dossierGenerationTriggerHandler';
import type { IDossierService } from '../../serviceInterfaces';
import { InterviewCompletedEvent, ProcessId, InterviewId } from '../../../domain';
import type { InterviewTurn } from '../../../domain';

function makeDossierServiceMock(): IDossierService {
  return { handleInterviewCompleted: vi.fn().mockResolvedValue(undefined), publishDossier: vi.fn().mockResolvedValue(undefined) };
}

const TURNS: InterviewTurn[] = [
  {
    turnType: 'note', speakerRole: 'interviewee', timestamp: new Date('2026-07-06T09:00:00.000Z'),
    content: 'We migrated the CRM last month.', order: 0,
    topic: 'current_projects', sentiment: 'neutral', answerText: 'Migrated the CRM',
  },
];

describe('createDossierGenerationTriggerHandler', () => {
  it('forwards InterviewCompletedEvent fields to DossierService.handleInterviewCompleted', async () => {
    const dossierService = makeDossierServiceMock();
    const handle = createDossierGenerationTriggerHandler(dossierService);
    const event = new InterviewCompletedEvent(new ProcessId('proc-1'), new InterviewId('int-1'), TURNS);

    await handle(event);

    expect(dossierService.handleInterviewCompleted).toHaveBeenCalledWith('proc-1', 'int-1', TURNS);
  });

  it('throws on an unexpected event type', async () => {
    const handle = createDossierGenerationTriggerHandler(makeDossierServiceMock());
    await expect(handle({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
