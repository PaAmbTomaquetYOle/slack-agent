import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OffboardingStateChangedHandler } from '../handlers/offboardingStateChangedHandler';
import { OffboardingCompletedHandler } from '../handlers/offboardingCompletedHandler';
import { InterviewCompletedHandler } from '../handlers/interviewCompletedHandler';
import { DossierGeneratedHandler } from '../handlers/dossierGeneratedHandler';
import { SopCreatedHandler } from '../handlers/sopCreatedHandler';
import type { IMessagingPort, IOffboardingProcessRepository } from '../../ports';
import type { IDossierService, IOffboardingOrchestrator } from '../../serviceInterfaces';
import { OffboardingProcess, ProcessId, UserId } from '../../../domain';
import type { KafkaEventEnvelope } from '../../../domain';

function envelope(eventType: string, payload: Record<string, unknown>): KafkaEventEnvelope {
  return { event_id: 'evt-1', event_type: eventType, occurred_at: '2024-01-01T00:00:00.000Z', payload };
}

function makeMessagingMock(): IMessagingPort {
  return { sendDirectMessage: vi.fn().mockResolvedValue(undefined) };
}

function makeOrchestratorMock(): IOffboardingOrchestrator {
  return {
    handleInterviewMessage: vi.fn().mockResolvedValue(undefined),
    recover: vi.fn().mockResolvedValue(undefined),
    onDossierGenerated: vi.fn(),
    onOffboardingCompleted: vi.fn(),
  };
}

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

describe('OffboardingStateChangedHandler', () => {
  it('DMs the manager from payload.manager_id', async () => {
    const messaging = makeMessagingMock();
    const handler = new OffboardingStateChangedHandler(messaging);
    await handler.handle(envelope('offboarding.state_changed', {
      process_id: 'proc-1', previous_state: 'in_progress', new_state: 'pending_revision',
      employee_id: 'emp-1', manager_id: 'mgr-1',
    }));
    expect(messaging.sendDirectMessage).toHaveBeenCalledWith('mgr-1', expect.stringContaining('proc-1'));
  });

  it('throws when the payload is missing required fields', async () => {
    const handler = new OffboardingStateChangedHandler(makeMessagingMock());
    await expect(handler.handle(envelope('offboarding.state_changed', { process_id: 'proc-1' }))).rejects.toThrow();
  });
});

describe('OffboardingCompletedHandler', () => {
  it('DMs the manager from payload.manager_id and notifies the orchestrator', async () => {
    const messaging = makeMessagingMock();
    const orchestrator = makeOrchestratorMock();
    const handler = new OffboardingCompletedHandler(messaging, orchestrator);
    await handler.handle(envelope('offboarding.completed', {
      process_id: 'proc-1', employee_id: 'emp-1', manager_id: 'mgr-1', dossier_id: 'dos-1',
    }));
    expect(messaging.sendDirectMessage).toHaveBeenCalledWith('mgr-1', expect.stringContaining('proc-1'));
    expect(orchestrator.onOffboardingCompleted).toHaveBeenCalledWith('proc-1');
  });

  it('throws when the payload is missing required fields', async () => {
    const handler = new OffboardingCompletedHandler(makeMessagingMock(), makeOrchestratorMock());
    await expect(handler.handle(envelope('offboarding.completed', {}))).rejects.toThrow();
  });
});

describe('InterviewCompletedHandler', () => {
  let messaging: IMessagingPort;
  let repository: IOffboardingProcessRepository;
  let handler: InterviewCompletedHandler;

  beforeEach(() => {
    messaging = makeMessagingMock();
    repository = makeRepositoryMock();
    handler = new InterviewCompletedHandler(messaging, repository);
  });

  it('resolves the manager via the repository and sends a DM', async () => {
    const process = OffboardingProcess.fromBackend({
      id: new ProcessId('proc-1'),
      departingUserId: new UserId('emp-1'),
      initiatorId: new UserId('mgr-1'),
      createdAt: new Date(),
      state: 'in_progress',
      interviewId: null,
      dossierId: null,
    });
    vi.mocked(repository.findById).mockResolvedValue(process);
    await handler.handle(envelope('interview.completed', {
      interview_id: 'int-1', process_id: 'proc-1', completed_at: '2024-01-01T00:00:00.000Z',
    }));
    expect(repository.findById).toHaveBeenCalledWith(expect.objectContaining({ value: 'proc-1' }));
    expect(messaging.sendDirectMessage).toHaveBeenCalledWith('mgr-1', expect.stringContaining('proc-1'));
  });

  it('throws when the process cannot be found', async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);
    await expect(handler.handle(envelope('interview.completed', {
      interview_id: 'int-1', process_id: 'missing', completed_at: '2024-01-01T00:00:00.000Z',
    }))).rejects.toThrow();
  });

  it('throws when the payload is missing required fields', async () => {
    await expect(handler.handle(envelope('interview.completed', {}))).rejects.toThrow();
  });
});

describe('DossierGeneratedHandler', () => {
  let messaging: IMessagingPort;
  let repository: IOffboardingProcessRepository;
  let dossierService: IDossierService;
  let orchestrator: IOffboardingOrchestrator;
  let handler: DossierGeneratedHandler;

  beforeEach(() => {
    messaging = makeMessagingMock();
    repository = makeRepositoryMock();
    dossierService = { handleInterviewCompleted: vi.fn().mockResolvedValue(undefined), publishDossier: vi.fn().mockResolvedValue(undefined) };
    orchestrator = makeOrchestratorMock();
    handler = new DossierGeneratedHandler(messaging, repository, dossierService, orchestrator);
  });

  it('resolves the manager via the repository and sends a DM', async () => {
    const process = OffboardingProcess.fromBackend({
      id: new ProcessId('proc-1'),
      departingUserId: new UserId('emp-1'),
      initiatorId: new UserId('mgr-1'),
      createdAt: new Date(),
      state: 'pending_revision',
      interviewId: null,
      dossierId: null,
    });
    vi.mocked(repository.findById).mockResolvedValue(process);
    await handler.handle(envelope('dossier.generated', {
      dossier_id: 'dos-1', process_id: 'proc-1', interview_id: 'int-1',
    }));
    expect(messaging.sendDirectMessage).toHaveBeenCalledWith('mgr-1', expect.stringContaining('proc-1'));
  });

  it('publishes the dossier to Slack (managers channel / Canvas) via DossierService', async () => {
    const process = OffboardingProcess.fromBackend({
      id: new ProcessId('proc-1'),
      departingUserId: new UserId('emp-1'),
      initiatorId: new UserId('mgr-1'),
      createdAt: new Date(),
      state: 'pending_revision',
      interviewId: null,
      dossierId: null,
    });
    vi.mocked(repository.findById).mockResolvedValue(process);
    await handler.handle(envelope('dossier.generated', {
      dossier_id: 'dos-1', process_id: 'proc-1', interview_id: 'int-1',
    }));
    expect(dossierService.publishDossier).toHaveBeenCalledWith('proc-1');
    expect(orchestrator.onDossierGenerated).toHaveBeenCalledWith('proc-1');
  });

  it('throws when the process cannot be found', async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);
    await expect(handler.handle(envelope('dossier.generated', {
      dossier_id: 'dos-1', process_id: 'missing', interview_id: 'int-1',
    }))).rejects.toThrow();
  });
});

describe('SopCreatedHandler', () => {
  it('DMs the author from payload.author', async () => {
    const messaging = makeMessagingMock();
    const handler = new SopCreatedHandler(messaging);
    await handler.handle(envelope('sop.created', {
      sop_id: 'sop-1', author: 'U456', origin_channel: 'C123', tags: [], version: 1, created_at: '2024-01-01T00:00:00.000Z',
    }));
    expect(messaging.sendDirectMessage).toHaveBeenCalledWith('U456', expect.stringContaining('sop-1'));
  });

  it('throws when the payload is missing required fields', async () => {
    const handler = new SopCreatedHandler(makeMessagingMock());
    await expect(handler.handle(envelope('sop.created', { sop_id: 'sop-1' }))).rejects.toThrow();
  });
});
