import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  IOffboardingProcessRepository,
  IInterviewRepository,
  IInterviewAgent,
  IUserInfoProvider,
  IMessagingPort,
} from '../../ports';
import type { IDomainEventBus } from '../../events';
import { InterviewService } from '../interviewService';
import {
  OffboardingProcess,
  ProcessId,
  UserId,
  InterviewId,
  InterviewCompletedEvent,
  INTERVIEW_TOPICS,
} from '../../../domain';
import type { Interview, InterviewTurn } from '../../../domain';

function makeOffboardingRepositoryMock(): IOffboardingProcessRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    delete: vi.fn(),
    start: vi.fn(),
    submitForReview: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
  } as unknown as IOffboardingProcessRepository;
}

function makeInterviewRepositoryMock(): IInterviewRepository {
  return {
    upsert: vi.fn(),
    findByProcessId: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
    addTurns: vi.fn(),
  };
}

function makeInterviewAgentMock(): IInterviewAgent {
  return { nextTurn: vi.fn() };
}

function makeUserInfoProviderMock(): IUserInfoProvider {
  return { getDisplayName: vi.fn().mockResolvedValue('Alice') };
}

function makeMessagingPortMock(): IMessagingPort {
  return { sendDirectMessage: vi.fn().mockResolvedValue(undefined) };
}

function makeEventBusMock(): IDomainEventBus {
  return { subscribe: vi.fn(), publish: vi.fn().mockResolvedValue(undefined) };
}

function makeInterview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: new InterviewId('int-1'),
    processId: new ProcessId('proc-1'),
    state: 'in_progress',
    scheduledAt: new Date('2026-07-06T09:00:00.000Z'),
    createdAt: new Date('2026-07-06T09:00:00.000Z'),
    turns: [],
    ...overrides,
  };
}

function makeTurn(overrides: Partial<InterviewTurn> = {}): InterviewTurn {
  return {
    turnType: 'note',
    speakerRole: 'interviewee',
    timestamp: new Date('2026-07-06T09:05:00.000Z'),
    content: 'previous answer',
    order: 0,
    topic: 'current_projects',
    sentiment: 'neutral',
    answerText: 'previous answer summary',
    ...overrides,
  };
}

describe('InterviewService', () => {
  let offboardingProcessRepository: IOffboardingProcessRepository;
  let interviewRepository: IInterviewRepository;
  let interviewAgent: IInterviewAgent;
  let userInfoProvider: IUserInfoProvider;
  let messagingPort: IMessagingPort;
  let eventBus: IDomainEventBus;
  let service: InterviewService;

  beforeEach(() => {
    offboardingProcessRepository = makeOffboardingRepositoryMock();
    interviewRepository = makeInterviewRepositoryMock();
    interviewAgent = makeInterviewAgentMock();
    userInfoProvider = makeUserInfoProviderMock();
    messagingPort = makeMessagingPortMock();
    eventBus = makeEventBusMock();
    service = new InterviewService(
      offboardingProcessRepository,
      interviewRepository,
      interviewAgent,
      userInfoProvider,
      messagingPort,
      eventBus,
    );
  });

  it('does nothing when there is no active offboarding process for the user', async () => {
    vi.mocked(offboardingProcessRepository.findAll).mockResolvedValue({ items: [], count: 0 });

    await service.handleIncomingDirectMessage('U-DEPARTING', 'hello');

    expect(offboardingProcessRepository.findAll).toHaveBeenCalledWith({
      employeeId: 'U-DEPARTING',
      state: 'in_progress',
    });
    expect(interviewRepository.start).not.toHaveBeenCalled();
    expect(interviewRepository.findByProcessId).not.toHaveBeenCalled();
    expect(interviewAgent.nextTurn).not.toHaveBeenCalled();
    expect(messagingPort.sendDirectMessage).not.toHaveBeenCalled();
  });

  it("starts the interview on the employee's first reply and relays the agent's first question", async () => {
    const process = OffboardingProcess.create(ProcessId.generate(), new UserId('U-DEPARTING'), new UserId('U-INITIATOR'));
    vi.mocked(offboardingProcessRepository.findAll).mockResolvedValue({ items: [process], count: 1 });
    vi.mocked(interviewRepository.findByProcessId).mockResolvedValue(null);
    vi.mocked(interviewRepository.start).mockResolvedValue(makeInterview({ processId: process.id, turns: [] }));
    vi.mocked(interviewAgent.nextTurn).mockResolvedValue({
      replyText: 'What projects are you working on?',
      topic: 'current_projects',
      sentiment: 'neutral',
      answerText: 'Greeted the bot',
      isComplete: false,
    });
    vi.mocked(interviewRepository.addTurns).mockResolvedValue(makeInterview({ processId: process.id }));

    await service.handleIncomingDirectMessage('U-DEPARTING', 'Hi there');

    expect(interviewRepository.start).toHaveBeenCalledWith(process.id);
    expect(interviewAgent.nextTurn).toHaveBeenCalledWith({
      employeeName: 'Alice',
      pendingTopics: [...INTERVIEW_TOPICS],
      turns: [],
      incomingMessage: 'Hi there',
    });
    expect(interviewRepository.addTurns).toHaveBeenCalledWith(process.id, [
      expect.objectContaining({
        turnType: 'note',
        speakerRole: 'interviewee',
        content: 'Hi there',
        order: 0,
        topic: 'current_projects',
        sentiment: 'neutral',
        answerText: 'Greeted the bot',
      }),
      expect.objectContaining({
        turnType: 'question',
        speakerRole: 'interviewer',
        content: 'What projects are you working on?',
        order: 1,
        topic: null,
        sentiment: null,
        answerText: null,
      }),
    ]);
    expect(messagingPort.sendDirectMessage).toHaveBeenCalledWith('U-DEPARTING', 'What projects are you working on?');
    expect(interviewRepository.complete).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('continues an existing interview, excluding already-covered topics from pendingTopics', async () => {
    const process = OffboardingProcess.create(ProcessId.generate(), new UserId('U-DEPARTING'), new UserId('U-INITIATOR'));
    const existingTurn = makeTurn({ topic: 'current_projects', order: 0 });
    vi.mocked(offboardingProcessRepository.findAll).mockResolvedValue({ items: [process], count: 1 });
    vi.mocked(interviewRepository.findByProcessId).mockResolvedValue(
      makeInterview({ processId: process.id, turns: [existingTurn] }),
    );
    vi.mocked(interviewAgent.nextTurn).mockResolvedValue({
      replyText: 'Who are your key external contacts?',
      topic: 'key_contacts',
      sentiment: 'neutral',
      answerText: 'Talked about current projects',
      isComplete: false,
    });
    vi.mocked(interviewRepository.addTurns).mockResolvedValue(
      makeInterview({ processId: process.id, turns: [existingTurn] }),
    );

    await service.handleIncomingDirectMessage('U-DEPARTING', 'We migrated the CRM last month.');

    expect(interviewRepository.start).not.toHaveBeenCalled();
    expect(interviewAgent.nextTurn).toHaveBeenCalledWith({
      employeeName: 'Alice',
      pendingTopics: INTERVIEW_TOPICS.filter((t) => t !== 'current_projects'),
      turns: [existingTurn],
      incomingMessage: 'We migrated the CRM last month.',
    });
  });

  it('completes the interview and publishes InterviewCompletedEvent when all 5 topics end up covered', async () => {
    const process = OffboardingProcess.create(ProcessId.generate(), new UserId('U-DEPARTING'), new UserId('U-INITIATOR'));
    const priorTurns = [
      makeTurn({ order: 0, topic: 'current_projects' }),
      makeTurn({ order: 1, topic: 'key_contacts' }),
      makeTurn({ order: 2, topic: 'undocumented_processes' }),
      makeTurn({ order: 3, topic: 'access_credentials' }),
    ];
    vi.mocked(offboardingProcessRepository.findAll).mockResolvedValue({ items: [process], count: 1 });
    vi.mocked(interviewRepository.findByProcessId).mockResolvedValue(
      makeInterview({ processId: process.id, turns: priorTurns }),
    );
    vi.mocked(interviewAgent.nextTurn).mockResolvedValue({
      replyText: 'Thanks, that covers everything!',
      topic: 'successor_recommendations',
      sentiment: 'positive',
      answerText: 'Recommended Bob as successor',
      isComplete: true,
    });
    const completedInterview = makeInterview({
      processId: process.id,
      id: new InterviewId('int-1'),
      turns: [...priorTurns, makeTurn({ order: 4, topic: 'successor_recommendations' })],
    });
    vi.mocked(interviewRepository.addTurns).mockResolvedValue(completedInterview);

    await service.handleIncomingDirectMessage('U-DEPARTING', 'I recommend Bob for my role.');

    expect(interviewRepository.complete).toHaveBeenCalledWith(process.id);
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(InterviewCompletedEvent));
    const publishedEvent = vi.mocked(eventBus.publish).mock.calls[0]?.[0] as InterviewCompletedEvent;
    expect(publishedEvent.processId).toBe(process.id);
    expect(publishedEvent.interviewId).toBe(completedInterview.id);
    expect(publishedEvent.turns).toBe(completedInterview.turns);
  });

  it('does not complete the interview when the agent claims completion but topics remain uncovered', async () => {
    const process = OffboardingProcess.create(ProcessId.generate(), new UserId('U-DEPARTING'), new UserId('U-INITIATOR'));
    vi.mocked(offboardingProcessRepository.findAll).mockResolvedValue({ items: [process], count: 1 });
    vi.mocked(interviewRepository.findByProcessId).mockResolvedValue(makeInterview({ processId: process.id, turns: [] }));
    vi.mocked(interviewAgent.nextTurn).mockResolvedValue({
      replyText: 'Great, all done!',
      topic: 'current_projects',
      sentiment: 'positive',
      answerText: 'Talked about current projects',
      isComplete: true, // hallucinated: 4 other topics were never covered
    });
    vi.mocked(interviewRepository.addTurns).mockResolvedValue(
      makeInterview({ processId: process.id, turns: [makeTurn({ order: 0, topic: 'current_projects' })] }),
    );

    await service.handleIncomingDirectMessage('U-DEPARTING', 'We migrated the CRM.');

    expect(interviewRepository.complete).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(messagingPort.sendDirectMessage).toHaveBeenCalledWith('U-DEPARTING', 'Great, all done!');
  });

  it('propagates errors that happen after a successful agent call instead of duplicating the interviewee turn', async () => {
    const process = OffboardingProcess.create(ProcessId.generate(), new UserId('U-DEPARTING'), new UserId('U-INITIATOR'));
    vi.mocked(offboardingProcessRepository.findAll).mockResolvedValue({ items: [process], count: 1 });
    vi.mocked(interviewRepository.findByProcessId).mockResolvedValue(makeInterview({ processId: process.id, turns: [] }));
    vi.mocked(interviewAgent.nextTurn).mockResolvedValue({
      replyText: 'What projects are you working on?',
      topic: 'current_projects',
      sentiment: 'neutral',
      answerText: 'Greeted the bot',
      isComplete: false,
    });
    vi.mocked(interviewRepository.addTurns).mockRejectedValue(new Error('backend unavailable'));

    await expect(service.handleIncomingDirectMessage('U-DEPARTING', 'Hi there')).rejects.toThrow('backend unavailable');

    expect(interviewRepository.addTurns).toHaveBeenCalledTimes(1);
    expect(messagingPort.sendDirectMessage).not.toHaveBeenCalled();
    expect(interviewRepository.complete).not.toHaveBeenCalled();
  });

  it('persists the interviewee turn but sends a fallback reply when the agent call fails', async () => {
    const process = OffboardingProcess.create(ProcessId.generate(), new UserId('U-DEPARTING'), new UserId('U-INITIATOR'));
    vi.mocked(offboardingProcessRepository.findAll).mockResolvedValue({ items: [process], count: 1 });
    vi.mocked(interviewRepository.findByProcessId).mockResolvedValue(makeInterview({ processId: process.id, turns: [] }));
    vi.mocked(interviewAgent.nextTurn).mockRejectedValue(new Error('Gemini unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await service.handleIncomingDirectMessage('U-DEPARTING', 'Hi there');

    expect(interviewRepository.addTurns).toHaveBeenCalledWith(process.id, [
      expect.objectContaining({
        turnType: 'note',
        speakerRole: 'interviewee',
        content: 'Hi there',
        order: 0,
        topic: null,
        sentiment: null,
        answerText: null,
      }),
    ]);
    expect(messagingPort.sendDirectMessage).toHaveBeenCalledWith(
      'U-DEPARTING',
      expect.stringContaining('problema'),
    );
    expect(interviewRepository.complete).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('uses the most recently created active process and warns when several are active for the same user', async () => {
    const older = OffboardingProcess.fromBackend({
      id: new ProcessId('proc-old'),
      departingUserId: new UserId('U-DEPARTING'),
      initiatorId: new UserId('U-INITIATOR'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      state: 'in_progress',
      interviewId: null,
      dossierId: null,
    });
    const newer = OffboardingProcess.fromBackend({
      id: new ProcessId('proc-new'),
      departingUserId: new UserId('U-DEPARTING'),
      initiatorId: new UserId('U-INITIATOR'),
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      state: 'in_progress',
      interviewId: null,
      dossierId: null,
    });
    vi.mocked(offboardingProcessRepository.findAll).mockResolvedValue({ items: [older, newer], count: 2 });
    vi.mocked(interviewRepository.findByProcessId).mockResolvedValue(makeInterview({ processId: newer.id, turns: [] }));
    vi.mocked(interviewAgent.nextTurn).mockResolvedValue({
      replyText: 'Ok!',
      topic: null,
      sentiment: null,
      answerText: null,
      isComplete: false,
    });
    vi.mocked(interviewRepository.addTurns).mockResolvedValue(makeInterview({ processId: newer.id }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await service.handleIncomingDirectMessage('U-DEPARTING', 'hi');

    expect(interviewRepository.findByProcessId).toHaveBeenCalledWith(newer.id);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
