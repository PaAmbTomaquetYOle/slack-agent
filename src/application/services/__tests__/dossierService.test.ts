import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DossierService } from '../dossierService';
import type { IOffboardingProcessRepository, IUserInfoProvider, IMessagingPort, IDossierGenerationAgent } from '../../ports';
import type { IDomainEventBus } from '../../events';
import { OffboardingProcess, ProcessId, UserId, DossierGenerationRequestedEvent } from '../../../domain';
import type { InterviewTurn, DossierDraft } from '../../../domain';

function makeRepositoryMock(): IOffboardingProcessRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    delete: vi.fn(),
    start: vi.fn(),
    submitForReview: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
  };
}

function makeUserInfoProviderMock(): IUserInfoProvider {
  return { getDisplayName: vi.fn().mockResolvedValue('Alice') };
}

function makeMessagingMock(): IMessagingPort {
  return {
    sendDirectMessage: vi.fn().mockResolvedValue(undefined),
    sendEphemeralActionPrompt: vi.fn().mockResolvedValue(undefined),
    sendChannelMessage: vi.fn().mockResolvedValue(undefined),
    createChannelCanvas: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDossierAgentMock(): IDossierGenerationAgent {
  return { generate: vi.fn() };
}

function makeEventBusMock(): IDomainEventBus {
  return { subscribe: vi.fn(), publish: vi.fn().mockResolvedValue(undefined) };
}

function makeProcess(): OffboardingProcess {
  return OffboardingProcess.fromBackend({
    id: new ProcessId('proc-1'),
    departingUserId: new UserId('emp-1'),
    initiatorId: new UserId('mgr-1'),
    createdAt: new Date(),
    state: 'in_progress',
    interviewId: null,
    dossierId: null,
  });
}

const TURNS: InterviewTurn[] = [
  {
    turnType: 'note', speakerRole: 'interviewee', timestamp: new Date('2026-07-06T09:00:00.000Z'),
    content: 'We migrated the CRM last month.', order: 0,
    topic: 'current_projects', sentiment: 'neutral', answerText: 'Migrated the CRM',
  },
];

const DRAFT: DossierDraft = {
  summary: 'Alice led the CRM migration.',
  sections: [{ title: 'Ongoing Projects', content: 'CRM migration, completed.' }],
};

describe('DossierService', () => {
  let repository: IOffboardingProcessRepository;
  let userInfoProvider: IUserInfoProvider;
  let messaging: IMessagingPort;
  let dossierAgent: IDossierGenerationAgent;
  let eventBus: IDomainEventBus;
  let service: DossierService;

  beforeEach(() => {
    repository = makeRepositoryMock();
    userInfoProvider = makeUserInfoProviderMock();
    messaging = makeMessagingMock();
    dossierAgent = makeDossierAgentMock();
    eventBus = makeEventBusMock();
    vi.mocked(repository.findById).mockResolvedValue(makeProcess());
    vi.mocked(dossierAgent.generate).mockResolvedValue(DRAFT);
    service = new DossierService(dossierAgent, repository, userInfoProvider, messaging, eventBus, 'C-managers');
  });

  describe('handleInterviewCompleted', () => {
    it('generates a draft and publishes DossierGenerationRequestedEvent', async () => {
      await service.handleInterviewCompleted('proc-1', 'int-1', TURNS);

      expect(dossierAgent.generate).toHaveBeenCalledWith({ employeeName: 'Alice', turns: TURNS });
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: DossierGenerationRequestedEvent.EVENT_NAME,
          processId: expect.objectContaining({ value: 'proc-1' }),
          interviewId: expect.objectContaining({ value: 'int-1' }),
          draft: DRAFT,
        }),
      );
    });

    it('does nothing when the offboarding process cannot be found', async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);

      await service.handleInterviewCompleted('proc-missing', 'int-1', TURNS);

      expect(dossierAgent.generate).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('does not throw and does not publish when the agent fails', async () => {
      vi.mocked(dossierAgent.generate).mockRejectedValue(new Error('gemini down'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.handleInterviewCompleted('proc-1', 'int-1', TURNS)).resolves.not.toThrow();

      expect(eventBus.publish).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('publishDossier', () => {
    it('posts a channel message and creates a Canvas for a generated draft', async () => {
      await service.handleInterviewCompleted('proc-1', 'int-1', TURNS);

      await service.publishDossier('proc-1');

      expect(messaging.sendChannelMessage).toHaveBeenCalledWith('C-managers', expect.stringContaining('Alice'));
      expect(messaging.createChannelCanvas).toHaveBeenCalledWith(
        'C-managers',
        expect.stringContaining('Alice'),
        expect.stringContaining('CRM migration, completed.'),
      );
    });

    it('does nothing for an unknown processId', async () => {
      await service.publishDossier('proc-unknown');

      expect(messaging.sendChannelMessage).not.toHaveBeenCalled();
      expect(messaging.createChannelCanvas).not.toHaveBeenCalled();
    });

    it('does not publish twice for the same process', async () => {
      await service.handleInterviewCompleted('proc-1', 'int-1', TURNS);

      await service.publishDossier('proc-1');
      await service.publishDossier('proc-1');

      expect(messaging.sendChannelMessage).toHaveBeenCalledTimes(1);
    });

    it('skips publishing when no managers channel is configured', async () => {
      service = new DossierService(dossierAgent, repository, userInfoProvider, messaging, eventBus, '');
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await service.handleInterviewCompleted('proc-1', 'int-1', TURNS);

      await service.publishDossier('proc-1');

      expect(messaging.sendChannelMessage).not.toHaveBeenCalled();
      expect(messaging.createChannelCanvas).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });
});
