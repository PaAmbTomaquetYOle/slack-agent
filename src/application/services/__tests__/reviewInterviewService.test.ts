import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  IActiveReviewStore,
  IInterviewSessionStore,
  IReviewInterviewAgent,
  IUserInfoProvider,
  IMessagingPort,
} from '../../ports';
import type { IDomainEventBus } from '../../events';
import { ReviewInterviewService } from '../reviewInterviewService';
import {
  ProcessId,
  UserId,
  InterviewId,
  ReviewInterviewCompletedEvent,
  INTERVIEW_TOPICS,
} from '../../../domain';
import type { ActiveReview, InterviewTurn } from '../../../domain';

function makeActiveReviewStoreMock(): IActiveReviewStore {
  return { find: vi.fn(), start: vi.fn(), end: vi.fn() };
}

function makeInterviewSessionStoreMock(): IInterviewSessionStore {
  return {
    find: vi.fn(),
    start: vi.fn(),
    appendTurns: vi.fn(),
    end: vi.fn(),
    restore: vi.fn(),
  };
}

function makeReviewInterviewAgentMock(): IReviewInterviewAgent {
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

function makeSession(processId: ProcessId, turns: InterviewTurn[] = [], id = new InterviewId('int-1')) {
  return { id, processId, startedAt: new Date('2026-07-06T09:00:00.000Z'), turns };
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

function makeActiveReview(overrides: Partial<ActiveReview> = {}): ActiveReview {
  return {
    processId: new ProcessId('proc-1'),
    employeeId: new UserId('U-EMPLOYEE'),
    reviewScope: 'monthly',
    ...overrides,
  };
}

describe('ReviewInterviewService', () => {
  let activeReviewStore: IActiveReviewStore;
  let interviewSessionStore: IInterviewSessionStore;
  let reviewInterviewAgent: IReviewInterviewAgent;
  let userInfoProvider: IUserInfoProvider;
  let messagingPort: IMessagingPort;
  let eventBus: IDomainEventBus;
  let service: ReviewInterviewService;

  beforeEach(() => {
    activeReviewStore = makeActiveReviewStoreMock();
    interviewSessionStore = makeInterviewSessionStoreMock();
    reviewInterviewAgent = makeReviewInterviewAgentMock();
    userInfoProvider = makeUserInfoProviderMock();
    messagingPort = makeMessagingPortMock();
    eventBus = makeEventBusMock();
    service = new ReviewInterviewService(
      activeReviewStore,
      interviewSessionStore,
      reviewInterviewAgent,
      userInfoProvider,
      messagingPort,
      eventBus,
    );
  });

  it('does nothing when the user has no active review', async () => {
    vi.mocked(activeReviewStore.find).mockReturnValue(null);

    await service.handleIncomingDirectMessage('U-EMPLOYEE', 'hello');

    expect(interviewSessionStore.start).not.toHaveBeenCalled();
    expect(reviewInterviewAgent.nextTurn).not.toHaveBeenCalled();
    expect(messagingPort.sendDirectMessage).not.toHaveBeenCalled();
  });

  it('starts the review interview on the first reply, using scope-appropriate pendingTopics', async () => {
    const active = makeActiveReview({ reviewScope: 'monthly' });
    vi.mocked(activeReviewStore.find).mockReturnValue(active);
    vi.mocked(interviewSessionStore.find).mockReturnValue(null);
    vi.mocked(interviewSessionStore.start).mockReturnValue(makeSession(active.processId, []));
    vi.mocked(reviewInterviewAgent.nextTurn).mockResolvedValue({
      replyText: 'What have you been working on recently?',
      topic: null,
      sentiment: null,
      answerText: null,
      isComplete: false,
    });
    vi.mocked(interviewSessionStore.appendTurns).mockReturnValue(makeSession(active.processId));

    await service.handleIncomingDirectMessage('U-EMPLOYEE', 'Hi there');

    expect(interviewSessionStore.start).toHaveBeenCalledWith(active.processId);
    expect(reviewInterviewAgent.nextTurn).toHaveBeenCalledWith({
      employeeName: 'Alice',
      slackUserId: 'U-EMPLOYEE',
      reviewScope: 'monthly',
      pendingTopics: ['current_projects'],
      turns: [],
      incomingMessage: 'Hi there',
    });
    expect(messagingPort.sendDirectMessage).toHaveBeenCalledWith(
      'U-EMPLOYEE',
      'What have you been working on recently?',
    );
  });

  it('continues an existing annual review, excluding already-covered topics from pendingTopics', async () => {
    const active = makeActiveReview({ reviewScope: 'annual' });
    const existingTurn = makeTurn({ topic: 'current_projects', order: 0 });
    vi.mocked(activeReviewStore.find).mockReturnValue(active);
    vi.mocked(interviewSessionStore.find).mockReturnValue(makeSession(active.processId, [existingTurn]));
    vi.mocked(reviewInterviewAgent.nextTurn).mockResolvedValue({
      replyText: 'Who are your key external contacts?',
      topic: 'key_contacts',
      sentiment: 'neutral',
      answerText: 'Talked about current projects',
      isComplete: false,
    });
    vi.mocked(interviewSessionStore.appendTurns).mockReturnValue(makeSession(active.processId, [existingTurn]));

    await service.handleIncomingDirectMessage('U-EMPLOYEE', 'We migrated the CRM last month.');

    expect(interviewSessionStore.start).not.toHaveBeenCalled();
    expect(reviewInterviewAgent.nextTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingTopics: INTERVIEW_TOPICS.filter((t) => t !== 'current_projects'),
      }),
    );
  });

  it('completes a monthly review (single-topic scope) and ends both stores', async () => {
    const active = makeActiveReview({ reviewScope: 'monthly' });
    vi.mocked(activeReviewStore.find).mockReturnValue(active);
    vi.mocked(interviewSessionStore.find).mockReturnValue(makeSession(active.processId, []));
    vi.mocked(reviewInterviewAgent.nextTurn).mockResolvedValue({
      replyText: 'Thanks, that covers it!',
      topic: 'current_projects',
      sentiment: 'positive',
      answerText: 'Working on the migration',
      isComplete: true,
    });
    const completedInterviewId = new InterviewId('int-done');
    const completedTurns = [makeTurn({ order: 0, topic: 'current_projects' })];
    vi.mocked(interviewSessionStore.appendTurns).mockReturnValue(
      makeSession(active.processId, completedTurns, completedInterviewId),
    );

    await service.handleIncomingDirectMessage('U-EMPLOYEE', 'Working on the migration.');

    expect(interviewSessionStore.end).toHaveBeenCalledWith(active.processId);
    expect(activeReviewStore.end).toHaveBeenCalledWith(expect.objectContaining({ value: 'U-EMPLOYEE' }));
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(ReviewInterviewCompletedEvent));
    const publishedEvent = vi.mocked(eventBus.publish).mock.calls[0]?.[0] as ReviewInterviewCompletedEvent;
    expect(publishedEvent.processId).toBe(active.processId);
    expect(publishedEvent.reviewScope).toBe('monthly');
    expect(publishedEvent.turns).toBe(completedTurns);
  });

  it('does not complete when the agent claims completion but topics remain uncovered', async () => {
    const active = makeActiveReview({ reviewScope: 'annual' });
    vi.mocked(activeReviewStore.find).mockReturnValue(active);
    vi.mocked(interviewSessionStore.find).mockReturnValue(makeSession(active.processId, []));
    vi.mocked(reviewInterviewAgent.nextTurn).mockResolvedValue({
      replyText: 'All done!',
      topic: 'current_projects',
      sentiment: 'positive',
      answerText: 'Talked about current projects',
      isComplete: true, // hallucinated: 4 other topics were never covered
    });
    vi.mocked(interviewSessionStore.appendTurns).mockReturnValue(
      makeSession(active.processId, [makeTurn({ order: 0, topic: 'current_projects' })]),
    );

    await service.handleIncomingDirectMessage('U-EMPLOYEE', 'We migrated the CRM.');

    expect(interviewSessionStore.end).not.toHaveBeenCalled();
    expect(activeReviewStore.end).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('persists the interviewee turn but sends a fallback reply when the agent call fails', async () => {
    const active = makeActiveReview();
    vi.mocked(activeReviewStore.find).mockReturnValue(active);
    vi.mocked(interviewSessionStore.find).mockReturnValue(makeSession(active.processId, []));
    vi.mocked(reviewInterviewAgent.nextTurn).mockRejectedValue(new Error('Gemini unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await service.handleIncomingDirectMessage('U-EMPLOYEE', 'Hi there');

    expect(interviewSessionStore.appendTurns).toHaveBeenCalledWith(active.processId, [
      expect.objectContaining({ turnType: 'note', speakerRole: 'interviewee', content: 'Hi there' }),
    ]);
    expect(messagingPort.sendDirectMessage).toHaveBeenCalledWith(
      'U-EMPLOYEE',
      expect.stringContaining('problema'),
    );
    expect(activeReviewStore.end).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
