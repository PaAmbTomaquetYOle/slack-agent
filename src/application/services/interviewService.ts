import type {
  IOffboardingProcessRepository,
  IInterviewSessionStore,
  IInterviewAgent,
  InterviewAgentTurnResult,
  IUserInfoProvider,
  IMessagingPort,
} from '../ports';
import type { IDomainEventBus } from '../events';
import type { IInterviewService } from '../serviceInterfaces';
import type { InterviewTopic, InterviewTurn, OffboardingProcess } from '../../domain';
import { INTERVIEW_TOPICS, InterviewCompletedEvent, InterviewStartedEvent, AuthenticationRequiredError } from '../../domain';

const FALLBACK_REPLY = 'Tuve un problema para procesar tu respuesta, ¿podrías contármelo de nuevo?';

/**
 * BE-7: the backend's REST surface is read-only, so this service no longer persists interview
 * turns over HTTP. It keeps the conversation in the in-memory `IInterviewSessionStore` and only
 * signals the backend at the two points it cares about: `interview.started` (via the domain
 * event) and `interview.completed`, which carries every turn (via the domain event, forwarded to
 * Kafka in `appFactory`). A process restart mid-interview loses unsent turns — accepted trade-off.
 */
export class InterviewService implements IInterviewService {
  readonly #offboardingProcessRepository: IOffboardingProcessRepository;
  readonly #interviewSessionStore: IInterviewSessionStore;
  readonly #interviewAgent: IInterviewAgent;
  readonly #userInfoProvider: IUserInfoProvider;
  readonly #messagingPort: IMessagingPort;
  readonly #eventBus: IDomainEventBus;

  constructor(
    offboardingProcessRepository: IOffboardingProcessRepository,
    interviewSessionStore: IInterviewSessionStore,
    interviewAgent: IInterviewAgent,
    userInfoProvider: IUserInfoProvider,
    messagingPort: IMessagingPort,
    eventBus: IDomainEventBus,
  ) {
    this.#offboardingProcessRepository = offboardingProcessRepository;
    this.#interviewSessionStore = interviewSessionStore;
    this.#interviewAgent = interviewAgent;
    this.#userInfoProvider = userInfoProvider;
    this.#messagingPort = messagingPort;
    this.#eventBus = eventBus;
  }

  async handleIncomingDirectMessage(userId: string, text: string): Promise<void> {
    const process = await this.#findActiveProcess(userId);
    if (!process) return;

    let session = this.#interviewSessionStore.find(process.id);
    if (!session) {
      session = this.#interviewSessionStore.start(process.id);
      await this.#eventBus.publish(new InterviewStartedEvent(process.id, process.departingUserId));
    }

    const pendingTopics = this.#pendingTopics(session.turns);
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
      result = await this.#interviewAgent.nextTurn({
        employeeName,
        slackUserId: userId,
        pendingTopics,
        turns: session.turns,
        incomingMessage: text,
      });
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        // Persist what the employee said so it isn't lost, then let the orchestrator hand off
        // to the existing Jira/Trello auth flow instead of sending the generic fallback reply.
        this.#interviewSessionStore.appendTurns(process.id, [intervieweeTurn]);
        throw error;
      }
      console.error('Interview agent failed to produce the next turn:', error);
      this.#interviewSessionStore.appendTurns(process.id, [intervieweeTurn]);
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

    // Cross-check the agent's isComplete claim against topics we can independently
    // verify are covered — an LLM hallucinating completion must not end the interview.
    const stillPending = this.#pendingTopics([...session.turns, classifiedIntervieweeTurn]);
    const isComplete = result.isComplete && stillPending.length === 0;

    const updatedSession = this.#interviewSessionStore.appendTurns(process.id, [
      classifiedIntervieweeTurn,
      interviewerTurn,
    ]);
    await this.#messagingPort.sendDirectMessage(userId, result.replyText);

    if (isComplete) {
      await this.#eventBus.publish(
        new InterviewCompletedEvent(process.id, updatedSession.id, updatedSession.turns),
      );
      this.#interviewSessionStore.end(process.id);
    }
  }

  async #findActiveProcess(userId: string): Promise<OffboardingProcess | null> {
    const { items } = await this.#offboardingProcessRepository.findAll({
      employeeId: userId,
      state: 'in_progress',
    });
    if (items.length === 0) return null;
    if (items.length === 1) return items[0] as OffboardingProcess;

    console.warn(
      `Found ${items.length} active offboarding processes for user '${userId}'; using the most recently created one.`,
    );
    return items.reduce((latest, current) => (current.createdAt > latest.createdAt ? current : latest));
  }

  #pendingTopics(turns: readonly InterviewTurn[]): InterviewTopic[] {
    const covered = new Set(turns.map((t) => t.topic).filter((t): t is InterviewTopic => t !== null));
    return INTERVIEW_TOPICS.filter((topic) => !covered.has(topic));
  }
}
