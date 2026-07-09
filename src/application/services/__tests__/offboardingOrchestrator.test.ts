import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IOffboardingProcessRepository, IInterviewRepository, IMessagingPort, IScheduler, ILogger } from '../../ports';
import type { IInterviewService } from '../../serviceInterfaces';
import { DomainEventBus } from '../../events';
import { OffboardingOrchestrator } from '../offboardingOrchestrator';
import {
  OffboardingProcess,
  OffboardingStartedEvent,
  InterviewStartedEvent,
  InterviewCompletedEvent,
  ProcessId,
  UserId,
  InterviewId,
} from '../../../domain';
import type { Interview } from '../../../domain';

const NUDGE_TIMEOUT_MS = 1000;
const ABANDON_TIMEOUT_MS = 5000;

interface ScheduledTask {
  fireAt: Date;
  task: () => Promise<void>;
}

function makeFakeScheduler(): IScheduler & { tasks: Map<string, ScheduledTask>; fire(key: string): Promise<void> } {
  const tasks = new Map<string, ScheduledTask>();
  return {
    tasks,
    schedule(key: string, fireAt: Date, task: () => Promise<void>): void {
      tasks.set(key, { fireAt, task });
    },
    cancel(key: string): void {
      tasks.delete(key);
    },
    async fire(key: string): Promise<void> {
      const scheduled = tasks.get(key);
      if (!scheduled) throw new Error(`No task scheduled for key '${key}'`);
      tasks.delete(key);
      await scheduled.task();
    },
  };
}

function makeLoggerMock(): ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeRepositoryMock(): IOffboardingProcessRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn().mockResolvedValue({ items: [], count: 0 }),
    delete: vi.fn(),
    start: vi.fn(),
    submitForReview: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
  };
}

function makeInterviewRepositoryMock(): IInterviewRepository {
  return {
    upsert: vi.fn(),
    findByProcessId: vi.fn().mockResolvedValue(null),
    start: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
    addTurns: vi.fn(),
  };
}

function makeMessagingMock(): IMessagingPort {
  return {
    sendDirectMessage: vi.fn().mockResolvedValue(undefined),
    sendEphemeralActionPrompt: vi.fn().mockResolvedValue(undefined),
    sendEphemeralMessage: vi.fn().mockResolvedValue(undefined),
    sendChannelMessage: vi.fn().mockResolvedValue(undefined),
    createChannelCanvas: vi.fn().mockResolvedValue(undefined),
  };
}

function makeInterviewServiceMock(): IInterviewService {
  return { handleIncomingDirectMessage: vi.fn().mockResolvedValue(undefined) };
}

function makeProcess(overrides: { state?: string } = {}): OffboardingProcess {
  return OffboardingProcess.fromBackend({
    id: new ProcessId('proc-1'),
    departingUserId: new UserId('U-DEPARTING'),
    initiatorId: new UserId('U-INITIATOR'),
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    state: overrides.state ?? 'in_progress',
    interviewId: null,
    dossierId: null,
  });
}

describe('OffboardingOrchestrator', () => {
  let eventBus: DomainEventBus;
  let repository: IOffboardingProcessRepository;
  let interviewRepository: IInterviewRepository;
  let interviewService: IInterviewService;
  let messagingPort: IMessagingPort;
  let scheduler: ReturnType<typeof makeFakeScheduler>;
  let logger: ILogger;
  let orchestrator: OffboardingOrchestrator;

  beforeEach(() => {
    eventBus = new DomainEventBus();
    repository = makeRepositoryMock();
    interviewRepository = makeInterviewRepositoryMock();
    interviewService = makeInterviewServiceMock();
    messagingPort = makeMessagingMock();
    scheduler = makeFakeScheduler();
    logger = makeLoggerMock();
    orchestrator = new OffboardingOrchestrator(
      eventBus,
      repository,
      interviewRepository,
      interviewService,
      messagingPort,
      scheduler,
      logger,
      NUDGE_TIMEOUT_MS,
      ABANDON_TIMEOUT_MS,
    );
  });

  it('arms a pre-interview nudge timer when offboarding starts', async () => {
    await eventBus.publish(new OffboardingStartedEvent(new UserId('U-DEPARTING'), new UserId('U-INITIATOR')));

    expect(scheduler.tasks.has('pre-interview:U-DEPARTING:nudge')).toBe(true);
  });

  it('nudges the departing user, then abandons and notifies the initiator if still silent', async () => {
    await eventBus.publish(new OffboardingStartedEvent(new UserId('U-DEPARTING'), new UserId('U-INITIATOR')));

    await scheduler.fire('pre-interview:U-DEPARTING:nudge');
    expect(messagingPort.sendDirectMessage).toHaveBeenCalledWith('U-DEPARTING', expect.stringContaining('check'));
    expect(scheduler.tasks.has('pre-interview:U-DEPARTING:abandon')).toBe(true);

    await scheduler.fire('pre-interview:U-DEPARTING:abandon');
    expect(messagingPort.sendDirectMessage).toHaveBeenCalledWith('U-INITIATOR', expect.stringContaining('U-DEPARTING'));
  });

  it('cancels the pre-interview timers and arms the interview stall timer once the interview starts', async () => {
    const process = makeProcess();
    vi.mocked(repository.findById).mockResolvedValue(process);

    await eventBus.publish(new OffboardingStartedEvent(new UserId('U-DEPARTING'), new UserId('U-INITIATOR')));
    await eventBus.publish(new InterviewStartedEvent(process.id, process.departingUserId));

    expect(scheduler.tasks.has('pre-interview:U-DEPARTING:nudge')).toBe(false);
    expect(scheduler.tasks.has('interview-stall:proc-1:nudge')).toBe(true);
  });

  it('cancels the stall timer once the interview completes and advances the in-memory state', async () => {
    const process = makeProcess();
    vi.mocked(repository.findById).mockResolvedValue(process);

    await eventBus.publish(new OffboardingStartedEvent(new UserId('U-DEPARTING'), new UserId('U-INITIATOR')));
    await eventBus.publish(new InterviewStartedEvent(process.id, process.departingUserId));
    await eventBus.publish(new InterviewCompletedEvent(process.id, new InterviewId('int-1'), []));

    expect(scheduler.tasks.has('interview-stall:proc-1:nudge')).toBe(false);
    expect(process.stateName).toBe('pending_revision');
  });

  it('re-arms the stall timer on every incoming interview message', async () => {
    const process = makeProcess();
    vi.mocked(repository.findById).mockResolvedValue(process);
    await eventBus.publish(new OffboardingStartedEvent(new UserId('U-DEPARTING'), new UserId('U-INITIATOR')));
    await eventBus.publish(new InterviewStartedEvent(process.id, process.departingUserId));

    await orchestrator.handleInterviewMessage('U-DEPARTING', 'still here');

    expect(interviewService.handleIncomingDirectMessage).toHaveBeenCalledWith('U-DEPARTING', 'still here');
    expect(scheduler.tasks.has('interview-stall:proc-1:nudge')).toBe(true);
  });

  it('marks the process finished when the orchestrator is notified dossier generation completed', async () => {
    const process = makeProcess({ state: 'pending_revision' });
    vi.mocked(repository.findById).mockResolvedValue(process);
    await eventBus.publish(new OffboardingStartedEvent(new UserId('U-DEPARTING'), new UserId('U-INITIATOR')));
    await eventBus.publish(new InterviewStartedEvent(process.id, process.departingUserId));

    orchestrator.onDossierGenerated('proc-1');

    expect(process.stateName).toBe('finished');
  });

  it('stops tracking the process when notified the offboarding completed', async () => {
    const process = makeProcess();
    vi.mocked(repository.findById).mockResolvedValue(process);
    await eventBus.publish(new OffboardingStartedEvent(new UserId('U-DEPARTING'), new UserId('U-INITIATOR')));
    await eventBus.publish(new InterviewStartedEvent(process.id, process.departingUserId));

    orchestrator.onOffboardingCompleted('proc-1');

    expect(scheduler.tasks.has('interview-stall:proc-1:nudge')).toBe(false);
    // A subsequent message from the same user no longer finds an active process to re-arm.
    await orchestrator.handleInterviewMessage('U-DEPARTING', 'hello again');
    expect(scheduler.tasks.has('interview-stall:proc-1:nudge')).toBe(false);
  });

  describe('recover', () => {
    it('does nothing when there are no in-progress processes', async () => {
      vi.mocked(repository.findAll).mockResolvedValue({ items: [], count: 0 });

      await orchestrator.recover();

      expect(interviewRepository.findByProcessId).not.toHaveBeenCalled();
    });

    it('re-arms the pre-interview abandon timer for a process that never started its interview', async () => {
      const process = makeProcess();
      vi.mocked(repository.findAll).mockResolvedValue({ items: [process], count: 1 });
      vi.mocked(interviewRepository.findByProcessId).mockResolvedValue(null);
      vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-01T00:00:00.500Z').getTime());

      await orchestrator.recover();

      expect(scheduler.tasks.has('pre-interview:U-DEPARTING:nudge')).toBe(true);
      vi.spyOn(Date, 'now').mockRestore();
    });

    it('abandons immediately on recovery when already past the abandon deadline', async () => {
      const process = makeProcess();
      vi.mocked(repository.findAll).mockResolvedValue({ items: [process], count: 1 });
      const interview: Interview = {
        id: new InterviewId('int-1'),
        processId: process.id,
        state: 'in_progress',
        scheduledAt: new Date('2026-07-01T00:00:00.000Z'),
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        turns: [{
          turnType: 'note',
          speakerRole: 'interviewee',
          timestamp: new Date('2026-07-01T00:00:00.000Z'),
          content: 'hi',
          order: 0,
          topic: null,
          sentiment: null,
          answerText: null,
        }],
      };
      vi.mocked(interviewRepository.findByProcessId).mockResolvedValue(interview);
      vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-01T00:00:10.000Z').getTime());

      await orchestrator.recover();

      expect(messagingPort.sendDirectMessage).toHaveBeenCalledWith('U-INITIATOR', expect.stringContaining('U-DEPARTING'));
      expect(process.stateName).toBe('cancelled');
      vi.spyOn(Date, 'now').mockRestore();
    });
  });
});
