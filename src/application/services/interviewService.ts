import type {
  IOffboardingProcessRepository,
  IInterviewSessionStore,
  IInterviewRepository,
  IInterviewAgent,
  InterviewAgentTurnResult,
  IUserInfoProvider,
  IMessagingPort,
} from '../ports';
import type { IDomainEventBus } from '../events';
import type { IInterviewService } from '../serviceInterfaces';
import type { InterviewTopic, InterviewTurn, OffboardingProcess } from '../../domain';
import {
  INTERVIEW_TOPICS,
  InterviewCompletedEvent,
  InterviewStartedEvent,
  InterviewTurnRecordedEvent,
  TasksExtractedEvent,
  AuthenticationRequiredError,
  Task,
} from '../../domain';

const FALLBACK_REPLY = 'Tuve un problema para procesar tu respuesta, ¿podrías contármelo de nuevo?';

/**
 * BE-7: the backend's REST surface is read-only, so this service keeps the live conversation in
 * the in-memory `IInterviewSessionStore` rather than a write-through repository. Durability
 * (SA-16) comes from Kafka, not HTTP: every appended turn is also published as
 * `interview.turn_recorded` so the backend persists it incrementally into its own
 * `interview_turns` table, and `interview.completed` still carries the full turn list as a
 * reconciliation backstop. On a restart, `#interviewSessionStore.find` comes back empty, so
 * this service falls back to `IInterviewRepository.findByProcessId` (the backend read model) to
 * resume the session instead of silently starting a duplicate interview.
 */
export class InterviewService implements IInterviewService {
  readonly #offboardingProcessRepository: IOffboardingProcessRepository;
  readonly #interviewSessionStore: IInterviewSessionStore;
  readonly #interviewRepository: IInterviewRepository;
  readonly #interviewAgent: IInterviewAgent;
  readonly #userInfoProvider: IUserInfoProvider;
  readonly #messagingPort: IMessagingPort;
  readonly #eventBus: IDomainEventBus;

  constructor(
    offboardingProcessRepository: IOffboardingProcessRepository,
    interviewSessionStore: IInterviewSessionStore,
    interviewRepository: IInterviewRepository,
    interviewAgent: IInterviewAgent,
    userInfoProvider: IUserInfoProvider,
    messagingPort: IMessagingPort,
    eventBus: IDomainEventBus,
  ) {
    this.#offboardingProcessRepository = offboardingProcessRepository;
    this.#interviewSessionStore = interviewSessionStore;
    this.#interviewRepository = interviewRepository;
    this.#interviewAgent = interviewAgent;
    this.#userInfoProvider = userInfoProvider;
    this.#messagingPort = messagingPort;
    this.#eventBus = eventBus;
  }

  async handleIncomingDirectMessage(userId: string, text: string): Promise<void> {
    const process = await this.#findActiveProcess(userId);
    if (!process) return;

    const session = await this.#resolveSession(process);

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
        await this.#eventBus.publish(new InterviewTurnRecordedEvent(process.id, [intervieweeTurn]));
        throw error;
      }
      console.error('Interview agent failed to produce the next turn:', error);
      this.#interviewSessionStore.appendTurns(process.id, [intervieweeTurn]);
      await this.#eventBus.publish(new InterviewTurnRecordedEvent(process.id, [intervieweeTurn]));
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

    const newTurns = [classifiedIntervieweeTurn, interviewerTurn];
    const updatedSession = this.#interviewSessionStore.appendTurns(process.id, newTurns);
    await this.#messagingPort.sendDirectMessage(userId, result.replyText);

    if (result.tasks && result.tasks.length > 0) {
      const tasks = result.tasks.map(
        (t) => new Task(t.id, t.title, t.source, t.status, t.url, t.description),
      );
      process.assignTasks(tasks);
      await this.#eventBus.publish(new TasksExtractedEvent(process.id, tasks));
    }

    if (isComplete) {
      // interview.completed carries every turn, so it already reconciles anything the
      // per-turn event below would have recorded — no need to publish both.
      await this.#eventBus.publish(
        new InterviewCompletedEvent(process.id, updatedSession.id, updatedSession.turns),
      );
      this.#interviewSessionStore.end(process.id);
    } else {
      await this.#eventBus.publish(new InterviewTurnRecordedEvent(process.id, newTurns));
    }
  }

  /**
   * Returns the in-flight session for the process, starting a fresh one and announcing
   * `interview.started` if this is the first message, or — after a restart wiped the in-memory
   * store — resuming from whatever the backend already persisted via `interview.turn_recorded`
   * events, without re-announcing `interview.started`.
   */
  async #resolveSession(process: OffboardingProcess) {
    const inMemory = this.#interviewSessionStore.find(process.id);
    if (inMemory) return inMemory;

    const persisted = await this.#interviewRepository.findByProcessId(process.id);
    if (persisted && persisted.turns.length > 0) {
      return this.#interviewSessionStore.restore(process.id, persisted.id, persisted.turns);
    }

    const session = this.#interviewSessionStore.start(process.id);
    await this.#eventBus.publish(new InterviewStartedEvent(process.id, process.departingUserId));
    return session;
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
