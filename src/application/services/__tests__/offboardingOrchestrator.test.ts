import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IOffboardingProcessRepository, IInterviewRepository, ITaskRepository, IMessagingPort, IScheduler, ILogger } from '../../ports/index.js';
import type { IInterviewService, IAuthService } from '../../serviceInterfaces/index.js';
import { DomainEventBus } from '../../events/index.js';
import { OffboardingOrchestrator } from '../offboardingOrchestrator.js';
import {
  OffboardingProcess,
  OffboardingStartedEvent,
  OffboardingCancellationRequestedEvent,
  InterviewStartedEvent,
  InterviewCompletedEvent,
  TasksExtractedEvent,
  Task,
  ProcessId,
  UserId,
  InterviewId,
  AuthenticationRequiredError,
} from '../../../domain/index.js';
import type { Interview } from '../../../domain/index.js';

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
    findById: vi.fn(),
    findAll: vi.fn().mockResolvedValue({ items: [], count: 0 }),
  };
}

function makeInterviewRepositoryMock(): IInterviewRepository {
  return {
    findByProcessId: vi.fn().mockResolvedValue(null),
  };
}

function makeTaskRepositoryMock(): ITaskRepository {
  return {
    findByProcessId: vi.fn().mockResolvedValue([]),
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

function makeAuthServiceMock(): IAuthService {
  return {
    initiateAuth: vi.fn().mockResolvedValue(undefined),
    handleAuthCodeMessage: vi.fn().mockResolvedValue(undefined),
    hasPendingAuth: vi.fn().mockReturnValue(false),
    isAuthErrorMessage: vi.fn().mockReturnValue(false),
  };
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
  let taskRepository: ITaskRepository;
  let interviewService: IInterviewService;
  let messagingPort: IMessagingPort;
  let scheduler: ReturnType<typeof makeFakeScheduler>;
  let logger: ILogger;
  let authService: IAuthService;
  let orchestrator: OffboardingOrchestrator;

  beforeEach(() => {
    eventBus = new DomainEventBus();
    repository = makeRepositoryMock();
    interviewRepository = makeInterviewRepositoryMock();
    taskRepository = makeTaskRepositoryMock();
    interviewService = makeInterviewServiceMock();
    messagingPort = makeMessagingMock();
    scheduler = makeFakeScheduler();
    logger = makeLoggerMock();
    authService = makeAuthServiceMock();
    orchestrator = new OffboardingOrchestrator(
      eventBus,
      repository,
      interviewRepository,
      taskRepository,
      interviewService,
      messagingPort,
      scheduler,
      logger,
      authService,
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

    await orchestrator.handleInterviewMessage('U-DEPARTING', 'still here', 'D1');

    expect(interviewService.handleIncomingDirectMessage).toHaveBeenCalledWith('U-DEPARTING', 'still here');
    expect(scheduler.tasks.has('interview-stall:proc-1:nudge')).toBe(true);
  });

  it('hands off to AuthService when the interview needs Jira/Trello authentication', async () => {
    vi.mocked(interviewService.handleIncomingDirectMessage).mockRejectedValue(new AuthenticationRequiredError('jira'));

    await orchestrator.handleInterviewMessage('U-DEPARTING', 'hi', 'D1');

    expect(authService.initiateAuth).toHaveBeenCalledWith('jira', 'U-DEPARTING', 'D1');
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
    await orchestrator.handleInterviewMessage('U-DEPARTING', 'hello again', 'D1');
    expect(scheduler.tasks.has('interview-stall:proc-1:nudge')).toBe(false);
  });

  it('assigns extracted tasks to the tracked process on TasksExtractedEvent', async () => {
    const process = makeProcess();
    vi.mocked(repository.findById).mockResolvedValue(process);
    await eventBus.publish(new OffboardingStartedEvent(new UserId('U-DEPARTING'), new UserId('U-INITIATOR')));
    await eventBus.publish(new InterviewStartedEvent(process.id, process.departingUserId));

    const tasks = [new Task('PROJ-1', 'Fix bug', 'jira', 'in_progress')];
    await eventBus.publish(new TasksExtractedEvent(process.id, tasks));

    expect(process.tasks).toHaveLength(1);
    expect(process.tasks[0]?.id).toBe('PROJ-1');
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

    it('rehydrates extracted tasks onto the tracked process on recover', async () => {
      const process = makeProcess();
      vi.mocked(repository.findAll).mockResolvedValue({ items: [process], count: 1 });
      vi.mocked(interviewRepository.findByProcessId).mockResolvedValue(null);
      const tasks = [new Task('PROJ-1', 'Fix bug', 'jira', 'in_progress')];
      vi.mocked(taskRepository.findByProcessId).mockResolvedValue(tasks);
      vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-01T00:00:00.500Z').getTime());

      await orchestrator.recover();

      expect(process.tasks).toHaveLength(1);
      expect(process.tasks[0]?.id).toBe('PROJ-1');
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
      const publishSpy = vi.spyOn(eventBus, 'publish');

      await orchestrator.recover();

      expect(messagingPort.sendDirectMessage).toHaveBeenCalledWith('U-INITIATOR', expect.stringContaining('U-DEPARTING'));
      expect(process.stateName).toBe('cancelled');
      // BE-7: cancellation is a Kafka command now, not a REST PATCH — the orchestrator publishes
      // OffboardingCancellationRequestedEvent, forwarded to Kafka in appFactory.
      expect(publishSpy).toHaveBeenCalledWith(expect.any(OffboardingCancellationRequestedEvent));
      const cancellationEvent = publishSpy.mock.calls
        .map((call) => call[0])
        .find((event): event is OffboardingCancellationRequestedEvent =>
          event instanceof OffboardingCancellationRequestedEvent);
      expect(cancellationEvent?.processId.value).toBe('proc-1');
      vi.spyOn(Date, 'now').mockRestore();
    });
  });
});
