import type {
  IOffboardingProcessRepository,
  IInterviewRepository,
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

export class InterviewService implements IInterviewService {
  readonly #offboardingProcessRepository: IOffboardingProcessRepository;
  readonly #interviewRepository: IInterviewRepository;
  readonly #interviewAgent: IInterviewAgent;
  readonly #userInfoProvider: IUserInfoProvider;
  readonly #messagingPort: IMessagingPort;
  readonly #eventBus: IDomainEventBus;

  constructor(
    offboardingProcessRepository: IOffboardingProcessRepository,
    interviewRepository: IInterviewRepository,
    interviewAgent: IInterviewAgent,
    userInfoProvider: IUserInfoProvider,
    messagingPort: IMessagingPort,
    eventBus: IDomainEventBus,
  ) {
    this.#offboardingProcessRepository = offboardingProcessRepository;
    this.#interviewRepository = interviewRepository;
    this.#interviewAgent = interviewAgent;
    this.#userInfoProvider = userInfoProvider;
    this.#messagingPort = messagingPort;
    this.#eventBus = eventBus;
  }

  async handleIncomingDirectMessage(userId: string, text: string): Promise<void> {
    const process = await this.#findActiveProcess(userId);
    if (!process) return;

    let interview = await this.#interviewRepository.findByProcessId(process.id);
    if (!interview) {
      interview = await this.#interviewRepository.start(process.id);
      await this.#eventBus.publish(new InterviewStartedEvent(process.id, process.departingUserId));
    }

    const pendingTopics = this.#pendingTopics(interview.turns);
    const employeeName = (await this.#userInfoProvider.getDisplayName(userId)) ?? userId;

    const intervieweeTurn: InterviewTurn = {
      turnType: 'note',
      speakerRole: 'interviewee',
      timestamp: new Date(),
      content: text,
      order: interview.turns.length,
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
        turns: interview.turns,
        incomingMessage: text,
      });
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        // Persist what the employee said so it isn't lost, then let the orchestrator hand off
        // to the existing Jira/Trello auth flow instead of sending the generic fallback reply.
        await this.#interviewRepository.addTurns(process.id, [intervieweeTurn]);
        throw error;
      }
      console.error('Interview agent failed to produce the next turn:', error);
      await this.#interviewRepository.addTurns(process.id, [intervieweeTurn]);
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
    const stillPending = this.#pendingTopics([...interview.turns, classifiedIntervieweeTurn]);
    const isComplete = result.isComplete && stillPending.length === 0;

    const updatedInterview = await this.#interviewRepository.addTurns(process.id, [
      classifiedIntervieweeTurn,
      interviewerTurn,
    ]);
    await this.#messagingPort.sendDirectMessage(userId, result.replyText);

    if (isComplete) {
      await this.#interviewRepository.complete(process.id);
      await this.#eventBus.publish(
        new InterviewCompletedEvent(process.id, updatedInterview.id, updatedInterview.turns),
      );
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
