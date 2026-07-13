import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DossierService } from '../dossierService.js';
import type { IOffboardingProcessRepository, IDossierRepository, IUserInfoProvider, IMessagingPort } from '../../ports/index.js';
import type { IDomainEventBus } from '../../events/index.js';
import { OffboardingProcess, ProcessId, UserId, InterviewId, DossierId, DossierGenerationRequestedEvent } from '../../../domain/index.js';
import type { Dossier } from '../../../domain/index.js';

function makeRepositoryMock(): IOffboardingProcessRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
  };
}

function makeDossierRepositoryMock(): IDossierRepository {
  return { findByProcessId: vi.fn() };
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

const DOSSIER: Dossier = {
  id: new DossierId('dos-1'),
  processId: new ProcessId('proc-1'),
  interviewId: new InterviewId('int-1'),
  state: 'draft',
  createdAt: new Date(),
  summary: 'Alice led the CRM migration.',
  sections: [
    { title: 'Ongoing Projects', sectionType: 'responsibilities', responsibilities: ['CRM migration, completed.'], contacts: null, tasks: null, areas: null },
  ],
};

describe('DossierService', () => {
  let repository: IOffboardingProcessRepository;
  let dossierRepository: IDossierRepository;
  let userInfoProvider: IUserInfoProvider;
  let messaging: IMessagingPort;
  let eventBus: IDomainEventBus;
  let service: DossierService;

  beforeEach(() => {
    repository = makeRepositoryMock();
    dossierRepository = makeDossierRepositoryMock();
    userInfoProvider = makeUserInfoProviderMock();
    messaging = makeMessagingMock();
    eventBus = makeEventBusMock();
    vi.mocked(repository.findById).mockResolvedValue(makeProcess());
    vi.mocked(dossierRepository.findByProcessId).mockResolvedValue(DOSSIER);
    service = new DossierService(repository, dossierRepository, userInfoProvider, messaging, eventBus, 'C-managers');
  });

  describe('handleInterviewCompleted', () => {
    it('publishes DossierGenerationRequestedEvent for the backend to generate the dossier', async () => {
      await service.handleInterviewCompleted('proc-1');

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: DossierGenerationRequestedEvent.EVENT_NAME,
          processId: expect.objectContaining({ value: 'proc-1' }),
        }),
      );
    });
  });

  describe('publishDossier', () => {
    it('posts a channel message and creates a Canvas from the fetched dossier', async () => {
      await service.publishDossier('proc-1');

      expect(messaging.sendChannelMessage).toHaveBeenCalledWith('C-managers', expect.stringContaining('Alice'));
      expect(messaging.createChannelCanvas).toHaveBeenCalledWith(
        'C-managers',
        expect.stringContaining('Alice'),
        expect.stringContaining('CRM migration, completed.'),
      );
    });

    it('does nothing when the offboarding process cannot be found', async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);

      await service.publishDossier('proc-unknown');

      expect(messaging.sendChannelMessage).not.toHaveBeenCalled();
      expect(messaging.createChannelCanvas).not.toHaveBeenCalled();
    });

    it('does nothing when the dossier cannot be found', async () => {
      vi.mocked(dossierRepository.findByProcessId).mockResolvedValue(null);

      await service.publishDossier('proc-1');

      expect(messaging.sendChannelMessage).not.toHaveBeenCalled();
      expect(messaging.createChannelCanvas).not.toHaveBeenCalled();
    });

    it('skips publishing when no managers channel is configured', async () => {
      service = new DossierService(repository, dossierRepository, userInfoProvider, messaging, eventBus, '');
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await service.publishDossier('proc-1');

      expect(messaging.sendChannelMessage).not.toHaveBeenCalled();
      expect(messaging.createChannelCanvas).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it('does not throw when the Slack channel post fails', async () => {
      vi.mocked(messaging.sendChannelMessage).mockRejectedValueOnce(new Error('slack rate limited'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.publishDossier('proc-1')).resolves.not.toThrow();
      expect(messaging.createChannelCanvas).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
