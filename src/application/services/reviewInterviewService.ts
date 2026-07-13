import type {
  IActiveReviewStore,
  IInterviewSessionStore,
  IReviewInterviewAgent,
  IUserInfoProvider,
  IMessagingPort,
  InterviewAgentTurnResult,
} from '../ports';
import type { IDomainEventBus } from '../events';
import type { IReviewInterviewService } from '../serviceInterfaces';
import type { InterviewTopic, InterviewTurn } from '../../domain';
import { ReviewInterviewCompletedEvent, UserId, reviewTopicsFor } from '../../domain';

const FALLBACK_REPLY = 'I had trouble processing your response — could you tell me again?';

/**
 * Guided monthly/annual review interview over Slack DM (SA-20). Mirrors InterviewService's
 * conversation loop, but simpler: no Jira/Trello task extraction, no per-turn Kafka forwarding
 * (BE-23 only defines a completion event for reviews, not an incremental one), and the active
 * process comes from the in-memory IActiveReviewStore instead of an HTTP repository (the backend
 * exposes no read model for review processes — they're Kafka-only, BE-23).
 */
export class ReviewInterviewService implements IReviewInterviewService {
  readonly #activeReviewStore: IActiveReviewStore;
  readonly #interviewSessionStore: IInterviewSessionStore;
  readonly #reviewInterviewAgent: IReviewInterviewAgent;
  readonly #userInfoProvider: IUserInfoProvider;
  readonly #messagingPort: IMessagingPort;
  readonly #eventBus: IDomainEventBus;

  constructor(
    activeReviewStore: IActiveReviewStore,
    interviewSessionStore: IInterviewSessionStore,
    reviewInterviewAgent: IReviewInterviewAgent,
    userInfoProvider: IUserInfoProvider,
    messagingPort: IMessagingPort,
    eventBus: IDomainEventBus,
  ) {
    this.#activeReviewStore = activeReviewStore;
    this.#interviewSessionStore = interviewSessionStore;
    this.#reviewInterviewAgent = reviewInterviewAgent;
    this.#userInfoProvider = userInfoProvider;
    this.#messagingPort = messagingPort;
    this.#eventBus = eventBus;
  }

  async handleIncomingDirectMessage(userId: string, text: string): Promise<void> {
    const active = this.#activeReviewStore.find(new UserId(userId));
    if (!active) return;

    const session =
      this.#interviewSessionStore.find(active.processId) ?? this.#interviewSessionStore.start(active.processId);
    const scopeTopics = reviewTopicsFor(active.reviewScope);
    const pendingTopics = this.#pendingTopics(scopeTopics, session.turns);
    const employeeName = (await this.#userInfoProvider.getDisplayName(userId)) ?? userId;

    const intervieweeTurn: InterviewTurn = {
      turnType: 'note',
      speakerRole: 'interviewee',
      timestamp: new Date(),
      content: text,
      order: session.turns.length,
      topic: null,
      sentiment: null,
      answerText: null,
    };

    let result: InterviewAgentTurnResult;
    try {
      result = await this.#reviewInterviewAgent.nextTurn({
        employeeName,
        slackUserId: userId,
        reviewScope: active.reviewScope,
        pendingTopics,
        turns: session.turns,
        incomingMessage: text,
      });
    } catch (error) {
      console.error('Review interview agent failed to produce the next turn:', error);
      this.#interviewSessionStore.appendTurns(active.processId, [intervieweeTurn]);
      await this.#messagingPort.sendDirectMessage(userId, FALLBACK_REPLY);
      return;
    }

    const classifiedIntervieweeTurn: InterviewTurn = {
      ...intervieweeTurn,
      topic: result.topic,
      sentiment: result.sentiment,
      answerText: result.answerText,
    };
    const interviewerTurn: InterviewTurn = {
      turnType: 'question',
      speakerRole: 'interviewer',
      timestamp: new Date(),
      content: result.replyText,
      order: intervieweeTurn.order + 1,
      topic: null,
      sentiment: null,
      answerText: null,
    };

    const stillPending = this.#pendingTopics(scopeTopics, [...session.turns, classifiedIntervieweeTurn]);
    const isComplete = result.isComplete && stillPending.length === 0;

    const updatedSession = this.#interviewSessionStore.appendTurns(active.processId, [
      classifiedIntervieweeTurn,
      interviewerTurn,
    ]);
    await this.#messagingPort.sendDirectMessage(userId, result.replyText);

    if (isComplete) {
      await this.#eventBus.publish(
        new ReviewInterviewCompletedEvent(
          active.processId,
          updatedSession.id,
          active.reviewScope,
          updatedSession.turns,
        ),
      );
      this.#interviewSessionStore.end(active.processId);
      this.#activeReviewStore.end(new UserId(userId));
    }
  }

  #pendingTopics(scopeTopics: readonly InterviewTopic[], turns: readonly InterviewTurn[]): InterviewTopic[] {
    const covered = new Set(turns.map((t) => t.topic).filter((t): t is InterviewTopic => t !== null));
    return scopeTopics.filter((topic) => !covered.has(topic));
  }
}
